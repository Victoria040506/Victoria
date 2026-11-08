/* Blue Shelf - cloud sync status. Read-only except user-requested retry. */
(function(){
'use strict';
const account=document.querySelector('header .bs-account-wrap');
const profile=account?.querySelector('#bs-account-toggle');
if(!account||!profile||document.getElementById('bs-cloud-status'))return;
const css=document.createElement('style');
css.textContent='.bs-cloud-pill{border:1px solid #dae7ef;background:#edf6fb;color:#517b97;border-radius:99px;padding:9px 12px;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer}.bs-cloud-pill[data-state="saved"]{background:#e9f6ef;color:#4c8b73}.bs-cloud-pill[data-state="pending"]{background:#fff7e9;color:#92703b}.bs-cloud-pill[data-state="error"]{background:#fff0f0;color:#a65363}.bs-cloud-panel{position:absolute;z-index:60;right:0;top:calc(100% + 10px);width:min(340px,calc(100vw - 24px));background:#fffefc;border:1px solid #dce9f1;border-radius:18px;padding:18px;box-shadow:0 16px 42px #36577725;color:#59798e;font-size:12px;line-height:1.65}.bs-cloud-panel[hidden]{display:none!important}.bs-cloud-panel h3{font:600 21px Georgia,serif;color:#496e89;margin:0 0 12px}.bs-cloud-panel p{border-bottom:1px solid #edf1f4;padding:7px 0;margin:0}.bs-cloud-panel small{display:block;margin:10px 0;color:#7d94a4}.bs-cloud-panel button{border:0;border-radius:99px;padding:8px 12px;background:#e7f3fa;color:#496f8b;cursor:pointer}.bs-cloud-panel button:disabled{opacity:.5}.bs-cloud-close{float:right}.bs-cloud-pill:focus-visible{outline:2px solid #7aacc9;outline-offset:2px}@media(max-width:620px){.bs-cloud-pill{padding:8px;font-size:10px}}';
css.textContent+='.bs-cloud-float{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:10000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:none}.bs-cloud-float>.bs-cloud-pill,.bs-cloud-float>.bs-cloud-panel{pointer-events:auto}.bs-cloud-float>.bs-cloud-pill{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:45px;padding:12px 18px;box-shadow:0 7px 23px rgba(62,93,117,.19);font:700 12px \"DM Sans\",sans-serif}.bs-cloud-float>.bs-cloud-panel{position:absolute;top:auto;right:0;bottom:calc(100% + 12px);max-height:min(68vh,440px);overflow-y:auto;box-shadow:0 12px 35px rgba(62,93,117,.22)}@media(max-width:620px){.bs-cloud-float{right:12px;bottom:max(12px,env(safe-area-inset-bottom))}.bs-cloud-float>.bs-cloud-pill{padding:11px 14px;font-size:11px}.bs-cloud-float>.bs-cloud-panel{width:min(340px,calc(100vw - 24px))}}';
document.head.append(css);
const pill=document.createElement('button');
pill.id='bs-cloud-status';pill.className='bs-cloud-pill';pill.type='button';
pill.setAttribute('aria-controls','bs-cloud-status-panel');
pill.setAttribute('aria-expanded','false');
const panel=document.createElement('section');
panel.id='bs-cloud-status-panel';panel.className='bs-cloud-panel';panel.hidden=true;
panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Synchronization status');
panel.innerHTML='<button class="bs-cloud-close" aria-label="Close cloud details" type="button">×</button><h3>Cloud sync ♡</h3><p id="bs-cloud-state-detail"></p><p id="bs-cloud-pending-detail"></p><p id="bs-cloud-last-detail"></p><p id="bs-cloud-error-detail" hidden></p><small>Saved locally is not the same as saved in the cloud. A successful cloud sync must be confirmed.</small><button id="bs-cloud-retry" type="button">↻ Check / retry sync</button>';
const floating=document.createElement('div');
floating.className='bs-cloud-float';
floating.id='bs-cloud-floating';
floating.append(panel,pill);
document.body.append(floating);
const current=(id,content)=>{const node=document.getElementById(id);if(node)node.textContent=content;};
const userId=()=>{try{return cloudUser?.id||''}catch{return ''}};
const lastKey=()=> 'blue-shelf-last-confirmed-cloud-v1:'+userId();
let lastError='';
function pendingCount(){
 try{return userId()&&typeof bsDirtyBookMap==='function'?Object.keys(bsDirtyBookMap()||{}).length:0}catch{return 0}
}
function confirmedTime(){
 try{return Number(localStorage.getItem(lastKey()))||0}catch{return 0}
}
function render(){
 let busy=false,waiting=false,error='',synced=false;
 try{
  busy=!!bsAutoBusy;waiting=!!bsAutoPending;error=String(bsAutoLastError||'');
  synced=bsAutoLastCheck>0&&bsAutoSynced===bsAutoChanges&&!busy&&!waiting;
 }catch(e){}
 const count=pendingCount(),uid=userId();
 if(error)lastError=error;
 if(!error&&(waiting||busy))lastError='';
 let label,detail,state;
 if(!uid){state='offline';label='☁ Local only';detail='Cloud account is not connected.'}
 else if(error||lastError){state='error';label='☁ Sync error';detail='The latest cloud synchronization has not been confirmed.'}
 else if(busy){state='pending';label='☁ Syncing…';detail='Cloud synchronization is running.'}
 else if(waiting||count){state='pending';label='☁ '+(count?count+' pending':'Queued');detail='Changes are waiting for cloud synchronization.'}
 else if(synced){state='saved';label='☁✓ Cloud saved';detail='The cloud confirmed synchronization in this tab.'}
 else{state='offline';label='☁ Not verified';detail='No successful synchronization has been confirmed in this tab.'}
 pill.dataset.state=state;pill.textContent=label;
 pill.setAttribute('aria-label',label+'; show details');
 current('bs-cloud-state-detail',detail);
 current('bs-cloud-pending-detail','Pending book edits: '+(uid?count+' (tracked on this device)':'sign in to check')+(waiting&&!count?' · other changes queued':''));
 const stamp=confirmedTime();
 current('bs-cloud-last-detail','Last confirmed cloud sync: '+(uid&&stamp?new Date(stamp).toLocaleString():'not recorded'));
 const bad=document.getElementById('bs-cloud-error-detail');
 if(bad){bad.hidden=state!=='error';bad.textContent=state==='error'?'Error: '+(error||lastError):''}
 const retry=document.getElementById('bs-cloud-retry');
 if(retry)retry.disabled=!uid||busy;
}
const close=()=>{panel.hidden=true;pill.setAttribute('aria-expanded','false')};
pill.addEventListener('click',()=>{panel.hidden=!panel.hidden;pill.setAttribute('aria-expanded',String(!panel.hidden));render()});
panel.querySelector('.bs-cloud-close').addEventListener('click',close);
document.addEventListener('click',e=>{if(!panel.hidden&&!floating.contains(e.target))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
panel.querySelector('#bs-cloud-retry').addEventListener('click',async()=>{
 if(typeof bsAutoSyncNow!=='function')return;
 current('bs-cloud-state-detail','Checking cloud synchronization…');
 try{await bsAutoSyncNow()}catch(e){lastError=String(e?.message||e)}
 render();
});
try{
 if(typeof bsAutoCloudState==='function'){
  const original=bsAutoCloudState;
  bsAutoCloudState=function(message,error=false){
   const result=original.apply(this,arguments);
   if(error)lastError=String(message||'Cloud synchronization failed');
   else if(/^✓\s*\d+\s+books saved on your account/.test(String(message||''))){
    lastError='';
    if(userId())try{localStorage.setItem(lastKey(),String(Date.now()))}catch(e){}
   }
   render();return result;
  };
 }
}catch(e){console.warn('Cloud indicator observer unavailable',e)}
render();setInterval(render,2500);
window.addEventListener('focus',render);
document.addEventListener('visibilitychange',render);
})();