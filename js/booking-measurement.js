(function(){
 const seen=new Set();
 window.ExclusivaMeasureBooking=function(id){
  if(typeof window.gtag!=='function')return false;
  if(id!==undefined){if(typeof id!=='string'||!/^[-A-Za-z0-9_]{16,80}$/.test(id))return false;const key='exclusiva.measurement.booking.'+id;if(seen.has(id))return false;try{if(window.sessionStorage.getItem(key)==='1')return false;window.sessionStorage.setItem(key,'1');}catch{return false;}seen.add(id);}
  window.gtag('event','generate_lead',{method:'confirmacao_reserva'});
  const sendTo=(window.EXCLUSIVA_GOOGLE_ADS_SEND_TO||'').trim();let awId=(window.EXCLUSIVA_GOOGLE_ADS_ID||'').trim();if(!awId&&sendTo&&sendTo.indexOf('/')>0)awId=sendTo.split('/')[0].trim();if(awId)window.gtag('config',awId);if(sendTo)window.gtag('event','conversion',{send_to:sendTo});return true;
 };
})();
