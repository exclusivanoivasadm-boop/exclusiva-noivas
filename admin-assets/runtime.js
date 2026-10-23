/* Functional adapter only. No data migration, fixture fallback or direct booking writes. */
const EXPECTED = Object.freeze({projectId:'exclusiva-noivas---agendamento',appId:'1:891467475836:web:9565af78e44e9d6d53d2f9',databaseURL:'https://exclusiva-noivas---agendamento-default-rtdb.firebaseio.com'});
const OWNER_EMAIL='exclusivanoivas.adm@gmail.com';
export function guardedReferencePath(referenceUrl) {
  const url=new URL(referenceUrl),match=/^https?:\/\/[^/?#]+(\/[^?#]*)?(?:[?#]|$)/.exec(referenceUrl),raw=match&&(match[1]||'/');
  if(!raw||raw!==url.pathname)throw Error('Caminho de referência inválido.');
  if(raw==='/')return raw;
  return '/'+raw.slice(1).split('/').map(s=>{let d;try{d=decodeURIComponent(s);}catch{throw Error('Caminho de referência inválido.');}if(!d||/[\/\\.#$\[\]%\u0000-\u001f\u007f]/.test(d))throw Error('Caminho de referência inválido.');return d;}).join('/');
}
export function durationValue(v){const n=Number(v);if(!Number.isInteger(n)||n<15||n>240||n%15)throw Error('Escolha de 15 a 240 minutos, em intervalos de 15.');return n;}
function bookingKey(key){if(typeof key!=='string'||!key||/[\/\\.#$\[\]%\u0000-\u001f\u007f]/.test(key))throw Error('Reserva inválida.');return key;}
const clone=v=>JSON.parse(JSON.stringify(v));
export function createRuntime({firebase=globalThis.firebase,bridgeModule=globalThis.ExclusivaBridgeModule,fetchImpl=globalThis.fetch.bind(globalThis),storage=globalThis.sessionStorage,now=()=>Date.now(),integrationConfig=globalThis.EXCLUSIVA_BOOKING_INTEGRATION}={}) {
  let auth,db,bridge,check,started=false,authorized=false,generation=0,stopAuth=null,stopOwner=null,loginBusy=false,pending=null,preparing=false;
  const listeners=new Set(),privateStops=new Set(),dayBaselines=new Map();
  let state={phase:'loading',authorized:false,bookings:[],settings:null,alerts:[],error:'',mutation:{busy:false,uncertain:false}};
  const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn(clone(state));};
  const active=(g,uid)=>authorized&&g===generation&&auth?.currentUser?.uid===uid;
  const requireAccess=()=>{if(!authorized||!auth?.currentUser)throw Error('Sessão encerrada. Entre novamente.');return {g:generation,uid:auth.currentUser.uid};};
  const ensure=ctx=>{if(!active(ctx.g,ctx.uid))throw Error('Sessão encerrada; verifique o estado antes de repetir.');};
  function clear(error='',phase='signed-out') {authorized=false;generation++;privateStops.forEach(fn=>fn());privateStops.clear();dayBaselines.clear();stopOwner?.();stopOwner=null;pending=null;preparing=false;emit({phase,authorized:false,bookings:[],settings:null,alerts:[],error,mutation:{busy:false,uncertain:false}});}
  function failPrivate(){clear('Acesso interrompido. Entre novamente.','blocked');}
  function reference(path){return /^agendamentos(?:\/|$)/.test(path)?bridge.legacyRef(path):db.ref(path);}
  function watch(ref,callback,ctx){if(!active(ctx.g,ctx.uid))return()=>{};const fn=s=>{if(active(ctx.g,ctx.uid))callback(s.val());};const stop=()=>ref.off('value',fn);privateStops.add(stop);ref.on('value',fn,()=>{if(active(ctx.g,ctx.uid))failPrivate();});return stop;}
  async function read(path){const ctx=requireAccess();if(!/^(?:agendamentos(?:\/[^/]+)?|bookingV1\/(?:revision|settings(?:\/(?:schedulePolicy|defaultDurationMinutes|saturdayDurationMinutes))?|calendar|occupancy\/\d{4}-\d{2}-\d{2}|intervals\/[a-f0-9-]{36})|expediente\/config\/\d{4}-\d{2}-\d{2}|checklistV1\/responses(?:\/[a-f0-9-]{36})?)$/.test(path))throw Error('Consulta não suportada.');const snap=await reference(path).once('value');ensure(ctx);return snap.val();}
  function markerKey(uid){return 'exclusiva-admin-redesign:manual:'+uid;}
  function initializePrivate(ctx){
    if(!active(ctx.g,ctx.uid))return;
    watch(bridge.legacyRef('agendamentos'),rows=>emit({bookings:Object.entries(rows||{}).map(([key,value])=>({...value,key}))}),ctx);
    watch(db.ref('bookingV1/settings'),values=>{try{emit({settings:{defaultDurationMinutes:durationValue(values?.defaultDurationMinutes),saturdayDurationMinutes:durationValue(values?.saturdayDurationMinutes),schedulePolicy:values?.schedulePolicy||null}});}catch{emit({settings:null,error:'Configuração de duração inválida. Alterações bloqueadas.'});}},ctx);
    let seen=null,requests=null;
    const alerts=()=>{if(seen&&requests)emit({alerts:Object.entries(requests).filter(([id,r])=>r.status==='pendente'&&seen[id]!==true).map(([id])=>'request:'+id)});};
    watch(db.ref('bookingV1/adminSeen/'+ctx.uid),value=>{seen=value||{};alerts();},ctx);
    watch(db.ref('bookingV1/requests'),value=>{requests=value||{};alerts();},ctx);
    if(!active(ctx.g,ctx.uid))return;
    try{const marker=storage.getItem(markerKey(ctx.uid));if(marker){const parsed=JSON.parse(marker);if(parsed.uid!==ctx.uid||typeof parsed.key!=='string')throw Error();pending={path:'agendamentos/'+bookingKey(parsed.key),value:null,operation:'set',uid:ctx.uid};emit({mutation:{busy:false,uncertain:true},error:'Existe uma criação anterior sem confirmação nesta sessão. Consulte a reserva antes de criar outra.'});}}catch{emit({mutation:{busy:false,uncertain:true},error:'Não foi possível verificar a operação anterior. Criação manual bloqueada.'});pending={value:null,uid:ctx.uid};}
  }
  async function start(){
    if(started)return;started=true;
    try{
      if(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN)throw Error('Modo de depuração não permitido.');
      if(integrationConfig?.enabled!==true)throw Error('Integração segura de agenda não habilitada.');
      if(!firebase||!bridgeModule?.createAdminBridge||!bridgeModule?.createAppCheckFetch)throw Error('Integração segura indisponível.');
      const response=await fetchImpl('/checklist/config.json',{cache:'no-store',credentials:'same-origin',redirect:'error'});
      if(!response.ok)throw Error('Configuração de proteção indisponível.');const config=await response.json();
      for(const [key,value] of Object.entries(EXPECTED))if(config?.firebase?.[key]!==value)throw Error('Projeto de proteção inválido.');
      const existing=firebase.apps?.find(app=>app.name==='[DEFAULT]');const app=existing||firebase.initializeApp(config.firebase);
      for(const [key,value] of Object.entries(EXPECTED))if(app.options?.[key]!==value)throw Error('Projeto de proteção inválido.');
      if(config.appCheckProvider!=='recaptcha-enterprise'||!/^[A-Za-z0-9_-]{20,200}$/.test(config.appCheckSiteKey||'')||typeof firebase.appCheck?.ReCaptchaEnterpriseProvider!=='function')throw Error('Proteção de acesso indisponível.');
      check=firebase.appCheck(app);check.activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(config.appCheckSiteKey),true);
      const getCheck=async()=>{const value=await check.getToken(false);if(typeof value?.token!=='string'||!value.token.trim())throw Error('Proteção de acesso indisponível.');return value;};await getCheck();
      auth=firebase.auth(app);db=firebase.database(app);await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      bridge=bridgeModule.createAdminBridge({database:db,auth,enabled:true,storage,fetchImpl:bridgeModule.createAppCheckFetch({getToken:getCheck})});
      stopAuth=auth.onAuthStateChanged(async user=>{
        clear();if(!user)return;const g=generation;
        if(!user.providerData?.some(p=>p.providerId==='password')||!user.emailVerified){emit({phase:'blocked',error:'Use a conta autorizada com senha e e-mail verificado.'});return;}
        emit({phase:'authorizing'});
        try{const tokenResult=await user.getIdTokenResult();if(g!==generation||auth.currentUser?.uid!==user.uid)return;if(tokenResult?.signInProvider!=='password'){clear('Entre com a sessão de senha autorizada.','blocked');return;}}catch{if(g===generation)clear('Não foi possível verificar a sessão.','blocked');return;}
        const owner=db.ref('checklistV1/admins/'+user.uid);
        const callback=s=>{if(g!==generation||auth.currentUser?.uid!==user.uid)return;if(s.val()!==true){clear('Esta conta não está autorizada.','blocked');return;}if(authorized)return;authorized=true;emit({phase:'ready',authorized:true,error:''});initializePrivate({g,uid:user.uid});};
        stopOwner=()=>owner.off('value',callback);owner.on('value',callback,()=>{if(g===generation)clear('Não foi possível verificar a autorização.','blocked');});
      });
    }catch{clear('Proteção de acesso indisponível. O painel permanece bloqueado.','blocked');}
  }
  async function login(alias,password){if(loginBusy)throw Error('Aguarde a entrada em andamento.');if(!auth)throw Error('Proteção de acesso indisponível.');if(alias.trim().toLowerCase()!=='exclusiva'||!password)throw Error('Confira os dados de acesso.');loginBusy=true;try{await auth.signInWithEmailAndPassword(OWNER_EMAIL,password);}catch{throw Error('Não foi possível entrar. Confira os dados de acesso.');}finally{password='';loginBusy=false;}}
  async function logout(){clear();try{await auth?.signOut();}catch{emit({phase:'blocked',error:'Sessão local bloqueada. Recarregue para tentar sair novamente.'});}}
  async function availability({date,durationMinutes,key}){
    const ctx=requireAccess();durationMinutes=durationValue(durationMinutes);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Selecione uma data válida.');if(key)bookingKey(key);
    for(let attempt=0;attempt<3;attempt++){
      const revision=await read('bookingV1/revision');if(!Number.isSafeInteger(revision)||revision<0)throw Error('Revisão indisponível.');
      const [policy,calendar,config,occupancy,row]=await Promise.all([read('bookingV1/settings/schedulePolicy'),read('bookingV1/calendar'),read('expediente/config/'+date),read('bookingV1/occupancy/'+date),key?read('agendamentos/'+key):null]);ensure(ctx);
      let excludeClaim=null;if(key){if(!row)throw Error('Reserva indisponível.');const sourceKind=key.startsWith('request:')?'request':'legacy',sourceId=sourceKind==='request'?key.slice(8):key,claim=sourceKind==='request'?sourceId:row._bookingClaimId;
        if(row.status!=='recusado'){if(typeof claim!=='string'||!/^[a-f0-9-]{36}$/.test(claim))throw Error('Identificação indisponível.');const interval=await read('bookingV1/intervals/'+claim);if(!interval||interval.sourceKind!==sourceKind||interval.sourceId!==sourceId||interval.date!==row.dataISO||interval.time!==row.hora)throw Error('Intervalo inconsistente.');excludeClaim=claim;}}
      if(revision!==await read('bookingV1/revision'))continue;ensure(ctx);return bridge.projectManualSlots({date,durationMinutes,policy,calendar,config,occupancy,excludeClaim,nowMs:now()});
    }throw Error('Agenda em atualização. Consulte novamente.');
  }
  async function perform(request){const ctx=requireAccess();if(state.mutation.busy)throw Error('Aguarde a operação em andamento.');if(pending&&pending!==request)throw Error('Há uma operação sem confirmação. Retome a mesma solicitação.');pending=request;emit({mutation:{busy:true,uncertain:false},error:''});try{const result=await bridge.mutate({path:request.path,operation:request.operation,value:request.value});ensure(ctx);if(result?.committed!==true)throw Error('Resultado não confirmado.');if(request.manual)storage.removeItem(markerKey(ctx.uid));pending=null;emit({mutation:{busy:false,uncertain:false}});return result;}catch(error){if(active(ctx.g,ctx.uid)){if(error?.definitelyRejected===true){if(request.manual)storage.removeItem(markerKey(ctx.uid));pending=null;}emit({mutation:{busy:false,uncertain:error?.definitelyRejected!==true},error:error?.definitelyRejected===true?'Alteração recusada. Revise os dados e a disponibilidade.':'Resultado ainda não confirmado. Não crie outra reserva; retome a mesma solicitação.'});}throw error;}}
  async function createBookingInner(payload){const ctx=requireAccess();if(pending)throw Error('Verifique a solicitação anterior antes de criar outra.');if(!state.settings)throw Error('Duração não confirmada.');const value=clone(payload);value.durationMinutes=durationValue(value.durationMinutes);if(!String(value.nome||'').trim()||!String(value.tel||'').trim())throw Error('Informe nome e WhatsApp.');if(!['pendente','agendado','confirmado'].includes(value.status))throw Error('Status inválido.');const projected=await availability({date:value.dataISO,durationMinutes:value.durationMinutes});ensure(ctx);if(!projected.slots?.some(s=>s.time===value.hora&&s.available))throw Error('Horário indisponível.');value.timestamp=new Date(now()).toISOString();value.data=value.dataISO.split('-').reverse().join('/');const ref=db.ref('agendamentos').push();const path=guardedReferencePath(ref.toString()).slice(1);const key=path.split('/')[1];storage.setItem(markerKey(ctx.uid),JSON.stringify({uid:ctx.uid,key}));return perform({path,operation:'set',value,manual:true,uid:ctx.uid});}
  async function updateBookingInner(key,patch){const ctx=requireAccess();bookingKey(key);if(pending)throw Error('Verifique a operação anterior antes de alterar dados.');const value=clone(patch);if(Object.keys(value).some(k=>!['nome','tel','dataISO','data','hora','durationMinutes','status','categoria','obs','casamento'].includes(k)))throw Error('Campo não suportado.');if(value.status&&!['pendente','agendado','confirmado','recusado','finalizado'].includes(value.status))throw Error('Status inválido.');const original=await read('agendamentos/'+key);ensure(ctx);if(!original)throw Error('Reserva indisponível.');const merged={...original,...value};const changed=['dataISO','hora','durationMinutes'].some(k=>Object.hasOwn(value,k)&&value[k]!==original[k]);if(changed||original.status==='recusado'&&value.status&&value.status!=='recusado'){merged.durationMinutes=durationValue(merged.durationMinutes);const slots=await availability({date:merged.dataISO,durationMinutes:merged.durationMinutes,key});ensure(ctx);if(!slots.slots?.some(s=>s.time===merged.hora&&s.available))throw Error('Horário indisponível.');}if(Object.hasOwn(value,'durationMinutes'))value.durationMinutes=durationValue(value.durationMinutes);if(value.dataISO)value.data=value.dataISO.split('-').reverse().join('/');return perform({path:'agendamentos/'+key,operation:'update',value,uid:ctx.uid});}
  async function prepare(fn){const ctx=requireAccess();if(preparing||state.mutation.busy)throw Error('Aguarde a operação em andamento.');preparing=true;try{return await fn();}finally{if(active(ctx.g,ctx.uid))preparing=false;}}
  const createBooking=payload=>prepare(()=>createBookingInner(payload));
  const updateBooking=(key,patch)=>prepare(()=>updateBookingInner(key,patch));
  async function retryPending(){requireAccess();if(preparing)throw Error('Aguarde a operação em andamento.');if(!pending?.value)throw Error('Dados da tentativa não disponíveis. Consulte a reserva original antes de prosseguir.');return perform(pending);}
  async function reconcilePendingInner(){
    const ctx=requireAccess();
    if(!pending||pending.value||!pending.path)throw Error('Use Retomar para confirmar a mesma solicitação original.');
    const request=pending;const stored=storage.getItem('exclusiva.admin.pending.v1:'+ctx.uid+':'+request.path);let attempt;try{attempt=JSON.parse(stored);}catch{}
    if(!attempt||!/^[a-f0-9-]{36}$/.test(attempt.opId||'')||!/^[a-f0-9]{64}$/.test(attempt.hash||''))throw Error('Recibo não identificado. A criação permanece bloqueada; confira a reserva original.');
    const [receiptSnapshot,rowSnapshot]=await Promise.all([db.ref('bookingV1/adminReceipts/'+attempt.opId).once('value'),db.ref(request.path).once('value')]);ensure(ctx);if(pending!==request)throw Error('A solicitação mudou. Consulte novamente.');
    const receipt=receiptSnapshot.val(),row=rowSnapshot.val();
    if(!receipt||!row||!Number.isSafeInteger(receipt.revision)||receipt.revision<1||!/^[a-f0-9]{64}$/.test(receipt.operationHash||'')||!/^[a-f0-9-]{36}$/.test(receipt.targetClaim||'')||receipt.targetClaim!==row._bookingClaimId)throw Error('Ainda não foi possível comprovar o resultado. Nenhuma nova reserva será criada.');
    const key=request.path.split('/')[1];storage.removeItem(markerKey(ctx.uid));pending=null;emit({mutation:{busy:false,uncertain:false},error:''});return {located:true,key};
  }
  const reconcilePending=()=>prepare(reconcilePendingInner);
  function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Selecione uma data válida.');return date;}
  function dayConfig(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['status','inicio','fim'].includes(k))||!['padrao','fechado','especial'].includes(value.status))throw Error('Configuração de expediente inválida.');const result={status:value.status,inicio:'',fim:''};if(value.status==='especial'){for(const k of ['inicio','fim']){if(typeof value[k]!=='string'||!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(value[k]))throw Error('Use horários válidos em intervalos de 15 minutos.');result[k]=value[k];}if(result.inicio>=result.fim)throw Error('O término deve ser posterior ao início.');}return result;}
  async function loadDayConfig(date){const ctx=requireAccess();validDate(date);const raw=await read('expediente/config/'+date);ensure(ctx);const value=dayConfig(raw||{status:'padrao'});dayBaselines.set(date,{ctx,raw:JSON.stringify(raw)});return value;}
  const updateDurationSetting=(name,value)=>prepare(async()=>{const ctx=requireAccess();if(!['defaultDurationMinutes','saturdayDurationMinutes'].includes(name))throw Error('Configuração não suportada.');if(!state.settings)throw Error('Configurações ainda não confirmadas.');return perform({path:'bookingV1/settings/'+name,operation:'set',value:durationValue(value),uid:ctx.uid});});
  const updateDayConfig=(date,config)=>prepare(async()=>{const ctx=requireAccess();validDate(date);const value=dayConfig(config),baseline=dayBaselines.get(date);if(!baseline||!active(baseline.ctx.g,baseline.ctx.uid))throw Error('Consulte a configuração desta data antes de salvar.');const current=await read('expediente/config/'+date);ensure(ctx);if(JSON.stringify(current)!==baseline.raw){dayBaselines.delete(date);throw Error('O expediente mudou. Consulte a data novamente antes de salvar.');}const result=await perform({path:'expediente/config/'+date,operation:'set',value,uid:ctx.uid});dayBaselines.delete(date);return result;});
  async function acknowledgeAlerts(){const ctx=requireAccess();const ids=[...state.alerts];if(!ids.length)return;await db.ref('bookingV1/adminSeen/'+ctx.uid).update(Object.fromEntries(ids.map(id=>[id.slice(8),true])));ensure(ctx);}
  async function listResponses({limit=40,before=null}={}){const ctx=requireAccess();if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Página inválida.');let q=db.ref('checklistV1/responses').orderByChild('createdAt');if(before){if(typeof before.createdAt!=='number'||typeof before.key!=='string')throw Error('Cursor inválido.');q=q.endAt(before.createdAt,before.key);}const snap=await q.limitToLast(limit+(before?1:0)).once('value');ensure(ctx);const rows=[];snap.forEach(child=>{if(child.key!==before?.key)rows.push({...child.val(),id:child.key});});return rows.reverse();}
  return Object.freeze({start,subscribe(fn){listeners.add(fn);fn(clone(state));return()=>listeners.delete(fn);},getState:()=>clone(state),getServices(){const ctx=requireAccess();return {database:db,auth,active:()=>active(ctx.g,ctx.uid),assertCurrent:()=>ensure(ctx)};},login,logout,availability,createBooking,updateBooking,cancelBooking:key=>updateBooking(key,{status:'recusado'}),retryPending,reconcilePending,loadDayConfig,updateDayConfig,updateDurationSetting,acknowledgeAlerts,read,listResponses,destroy(){clear();stopAuth?.();stopAuth=null;listeners.clear();}});
}
