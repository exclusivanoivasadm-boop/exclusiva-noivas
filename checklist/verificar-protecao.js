(()=>{'use strict';const btn=document.getElementById('check'),status=document.getElementById('status');let instance=null,busy=false;
const expectedApp='1:891467475836:web:9565af78e44e9d6d53d2f9',siteKey='6LdwNf0tAAAAAG8dZXcMEiSFnMQmxsmi4h8SSG2k';
btn.addEventListener('click',async()=>{if(busy)return;busy=true;btn.disabled=true;status.textContent='Verificando proteção…';try{
 if(!['https://exclusivanoivas.com.br','https://www.exclusivanoivas.com.br'].includes(location.origin)||window.FIREBASE_APPCHECK_DEBUG_TOKEN)throw Error();
 if(!instance){const app=firebase.initializeApp({apiKey:'AIzaSyC8MacELfK0_avvpWIWBHZpJO_WYqhjOaE',projectId:'exclusiva-noivas---agendamento',appId:expectedApp},'exclusiva-protection-check');instance=firebase.appCheck(app);instance.activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(siteKey),false);}
 const result=await instance.getToken(true);if(typeof result?.token!=='string'||!result.token)throw Error();
 // No token export or application logs. SDK-managed browser caching may occur. The SDK performs the token exchange; these are
 // sanity checks, NOT a replacement for Admin SDK cryptographic verification.
 const payload=result.token.split('.')[1];if(!payload)throw Error();const claims=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
 if(claims.sub!==expectedApp||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw Error();
 status.textContent='Atestação recebida pelo SDK para a app correta. Nenhum dado de cliente foi acessado. Regras e fluxo completo ainda precisam ser verificados.';
 }catch{status.textContent='Não foi possível confirmar a proteção. Nenhum envio ou consulta de clientes foi realizado.';}finally{busy=false;btn.disabled=false;}});
})();
