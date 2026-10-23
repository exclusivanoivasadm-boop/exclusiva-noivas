/** Private checklist reader. No SDK initialization, writes, persistence, or credential handling.
 * Caller supplies the already authorized DEFAULT/SESSION runtime and a generation guard.
 */
export const RESPONSE_PATH = 'checklistV1/responses';
const ID = /^[a-f0-9-]{36}$/;
export const responseLabels = Object.freeze({name:'Nome',size:'Numeração que costuma vestir',eventDate:'Data da cerimônia',eventTime:'Horário da cerimônia',fittings:'Experiência com provas',stage:'Momento da escolha',stageOther:'Seu momento',companions:'Acompanhantes',companionWho:'Quem vem com você',silhouette:'Silhuetas',style:'Caimentos e estilos',styleOther:'Outro estilo',color:'Cores',details:'Detalhes',detailsOther:'Outros detalhes',veil:'Véu',neckline:'Decotes',necklineOther:'Outro decote',sleeves:'Mangas e alças',sleevesOther:'Outras mangas ou alças',budget:'Investimento confortável',concerns:'O que gostaria de esclarecer',decisionPeople:'Pessoas importantes na escolha'});
const FIELD_GROUPS = [
 ['Sobre a noiva',['name','size','eventDate','eventTime','fittings','stage','stageOther']],
 ['Seu vestido',['silhouette','style','styleOther','color','details','detailsOther','veil','neckline','necklineOther','sleeves','sleevesOther']],
 ['Sua visita',['companions','companionWho','budget','concerns','decisionPeople']]
];
export function normalizeResponseSearch(value='') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g,' ').slice(0,120); }
function filterKey(search,date){ return JSON.stringify([normalizeResponseSearch(search),date]); }
function responseError(code,message){const e=new Error(message);e.code=code;return e;}
function validDate(value){if(!value)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
function captureSession({database,auth,assertCurrent}){
 if(!database?.ref||!auth||typeof assertCurrent!=='function')throw responseError('unavailable','Conexão privada indisponível.');
 const user=auth.currentUser;
 if(!user||!user.uid||!user.emailVerified)throw responseError('unauthorized','Entre com a conta autorizada.');
 const check=()=>{assertCurrent();if(auth.currentUser!==user||auth.currentUser?.uid!==user.uid||!auth.currentUser?.emailVerified)throw responseError('stale-session','A sessão mudou. Consulte novamente.');};
 check();return {database,user,check};
}
async function authorize(options){
 const session=captureSession(options),{database,user,check}=session;
 const token=await user.getIdTokenResult();check();
 if(token.signInProvider!=='password')throw responseError('unauthorized','Esta conta não tem acesso.');
 const allowed=await database.ref(`checklistV1/admins/${user.uid}`).once('value');check();
 if(allowed.val()!==true)throw responseError('unauthorized','Esta conta não tem acesso.');
 return session;
}
function safeRecord(value,id){
 // Field allowlist also prevents unexpected server fields from reaching the presentation layer.
 if(!value||typeof value!=='object'||typeof value.name!=='string'||typeof value.eventDate!=='string'||!Number.isFinite(value.createdAt)||value.schemaVersion!==1)return null;
 const answers={};for(const key of Object.keys(responseLabels)){const item=value.answers?.[key];if(typeof item==='string')answers[key]=item;else if(Array.isArray(item)&&item.every(x=>typeof x==='string'))answers[key]=[...item];}
 return {id,schemaVersion:1,name:value.name,eventDate:value.eventDate,createdAt:value.createdAt,answers};
}
export async function fetchResponses(options){
 const {search='',eventDate='',cursor=null}=options;
 if(typeof eventDate!=='string'||!validDate(eventDate))throw responseError('invalid-filter','Informe uma data válida.');
 const term=normalizeResponseSearch(search),filter=filterKey(term,eventDate);
 const {database,user,check}=await authorize(options);check();
 if(cursor&&(cursor.filter!==filter||cursor.uid!==user.uid||!ID.test(cursor.key)||
 (eventDate?(cursor.value!==eventDate):!Number.isFinite(cursor.value))))throw responseError('invalid-cursor','Reinicie a busca.');
 const size=term?100:50,maxPages=term?5:1;let next=cursor,scanned=0;const rows=[];
 for(let page=0;page<maxPages;page++){
  check();let query=database.ref(RESPONSE_PATH).orderByChild(eventDate?'eventDate':'createdAt');
  if(eventDate)query=query.startAt(eventDate);
  if(next)query=query.endBefore(next.value,next.key);else if(eventDate)query=query.endAt(eventDate);
  const snapshot=await query.limitToLast(size+1).once('value');check();
  const ascending=[];snapshot.forEach(child=>{ascending.push({id:child.key,value:child.val()});});
  const hasMore=ascending.length>size,inspected=ascending.slice(-size),oldest=inspected[0];
  scanned+=inspected.length;
  for(const item of inspected){const record=safeRecord(item.value,item.id);if(record&&normalizeResponseSearch(record.name).includes(term))rows.push(record);}
  next=hasMore&&oldest?{value:eventDate?oldest.value.eventDate:oldest.value.createdAt,key:oldest.id,filter,uid:user.uid}:null;
  if(!next)break;
 }
 check();rows.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
 return {rows,cursor:next,scanned,complete:next===null};
}
export async function getResponse(options){
 if(typeof options.id!=='string'||!ID.test(options.id))throw responseError('not-found','Resposta não encontrada.');
 const {database,check}=await authorize(options);
 const snapshot=await database.ref(`${RESPONSE_PATH}/${options.id}`).once('value');check();
 const record=safeRecord(snapshot.val(),options.id);
 if(!record)throw responseError('not-found','Resposta não encontrada.');
 return record;
}
/** Returns plain text only. The UI must use textContent or HTML escaping. */
export function responseSections(record){
 const answers=record?.answers||{};
 const fields=keys=>keys.filter(key=>typeof answers[key]==='string'?answers[key].trim():Array.isArray(answers[key])&&answers[key].length).map(key=>({key,label:responseLabels[key],value:Array.isArray(answers[key])?answers[key].join(' · '):answers[key]}));
 return [{title:'Para acolher nesta visita',fields:fields(['stage','budget','concerns','decisionPeople'])},...FIELD_GROUPS.map(([title,keys])=>({title,fields:fields(keys)}))].filter(section=>section.fields.length);
}
