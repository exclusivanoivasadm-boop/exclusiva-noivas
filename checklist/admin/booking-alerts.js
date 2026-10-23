/* In-app only. No Firebase, browser Notifications, service worker or local storage.
 * Feed IDs from the existing authorized private listener, never customer objects. */
(function(root){
 'use strict';
 function createBookingAlerts({onAlert=()=>{},onChange=()=>{}}={}) {
  let active=false,baseline=false,seen=new Set(),pending=new Set();
  function validate(ids){if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id||id.length>256))throw new TypeError('Expected booking IDs only');return new Set(ids)}
  function summary(){const count=pending.size;return{count,message:count===0?'Nenhum novo agendamento pendente de leitura.':count===1?'Você tem um novo agendamento para consultar.':`Você tem ${count} novos agendamentos para consultar.`}}
  function changed(){try{onChange(summary())}catch{}}
  function stop(){active=false;baseline=false;seen.clear();pending.clear();changed()}
  function start(){stop();active=true}
  function reconnect(){baseline=false}
  function acceptSnapshot(ids,{unreadIds=[]}={}){
   if(!active)return 0;
   const unique=validate(ids),unread=validate(unreadIds);let count=0;const opening=!baseline;
   if(opening){
    // Unread classification comes from an authorized persisted server marker.
    // Missing marker => caller supplies []; history does not cause a flood.
    for(const id of unique){seen.add(id);if(unread.has(id)&&!pending.has(id)){pending.add(id);count++}}
    baseline=true;
   }else{
    for(const id of unique){if(!seen.has(id)){seen.add(id);pending.add(id);count++}}
   }
   // Removed or cancelled rows must not remain in the pending badge.
   for(const id of pending)if(!unique.has(id))pending.delete(id);
   changed();
   if(count){try{onAlert({...summary(),added:count,source:opening?'opening':'live'})}catch{}}
   return count;
  }
  function pendingIds(){return [...pending]}
  // Call ONLY after successful private server acknowledgement for these exact IDs.
  // Captured IDs avoid clearing a newly arrived booking during an async save.
  function acknowledge(ids){const acknowledged=validate(ids);if(!active)return;for(const id of acknowledged)pending.delete(id);changed()}
  return{start,stop,reconnect,acceptSnapshot,pendingIds,acknowledge};
 }
 root.createBookingAlerts=createBookingAlerts;
 if(typeof module!=='undefined')module.exports={createBookingAlerts};
})(globalThis);
