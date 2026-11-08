/* Blue Shelf · period-aware reading statistics, no changes to book records. */
(function(){
'use strict';
const page=document.getElementById('page-stats');
const hero=page?.querySelector('.bs-stats-hero');
if(!page||!hero||document.getElementById('bs-period-select'))return;
const style=document.createElement('style');
style.textContent='.bs-stats-period{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px 21px;background:linear-gradient(110deg,#eaf6fb,#fff4f9);border:1px solid #dfeaf1;border-radius:20px;margin:16px 0 22px}.bs-stats-period label{font-size:13px;color:#567d96;font-weight:700}.bs-stats-period p{font-size:12px;color:#829baa;margin:4px 0 0}.bs-stats-period select{border:1px solid #d9e6ee;background:white;border-radius:14px;color:#547992;font:600 13px "DM Sans",sans-serif;padding:11px 14px;min-width:170px}.bs-period-info{font-size:12px;color:#7b96a8;margin:0 0 15px}.bs-stats-compact-card{background:#fff;border:1px solid #e2edf3;padding:20px;border-radius:18px}.bs-stats-compact-card strong{font:700 29px Georgia,serif;color:#466f8d;display:block;margin-top:6px}.bs-stats-compact-card small{font-size:12px;color:#7897ab}.bs-stats-current-only-note{color:#879ca9;font-size:11px;margin-top:10px}#page-stats .controls[hidden]{display:none!important}#page-stats #bs-stats-months{overflow-x:auto;padding-bottom:8px}.bs-yearly-chart-note{font-size:11px;color:#7b94a3;margin-top:8px}@media(max-width:620px){.bs-stats-period{padding:14px}.bs-stats-period select{width:100%}}';
document.head.append(style);
const toolbar=document.createElement('div');
toolbar.className='bs-stats-period';
toolbar.innerHTML='<div><label for="bs-period-select">✦ Reading statistics for</label><p>Explore your reading story year by year or across all time ♡</p></div><select id="bs-period-select" aria-label="Choose statistics year"></select>';
hero.insertAdjacentElement('afterend',toolbar);
const select=toolbar.querySelector('select');
const notice=document.createElement('p');
notice.className='bs-period-info';
toolbar.insertAdjacentElement('afterend',notice);
const yearNow=()=>new Date().getFullYear();
const dateYear=v=>{const s=String(v||'').trim();const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const yr=Number(m[1]),mon=Number(m[2]),day=Number(m[3]);if(yr<1900||yr>yearNow()||mon<1||mon>12||day<1||day>31)return null;const d=new Date(yr,mon-1,day);return d.getFullYear()===yr&&d.getMonth()+1===mon&&d.getDate()===day?yr:null};
const periodKey='blue-shelf-stats-period-v1';
let selected=(()=>{try{return localStorage.getItem(periodKey)||String(yearNow())}catch{return String(yearNow())}})();
const allRead=()=>books.filter(b=>b?.status==='Read');
const filtered=()=>selected==='all'?allRead():allRead().filter(b=>dateYear(b.finished)===Number(selected));
const sessions=()=>Array.isArray(readingSessions)?readingSessions:[];
const sessionsFor=()=>selected==='all'?sessions():sessions().filter(x=>dateYear(x.date)===Number(selected));
function options(){
 const years=new Set([yearNow()]);
 for(const b of allRead()){const y=dateYear(b.finished);if(y)years.add(y)}
 for(const event of sessions()){const y=dateYear(event.date);if(y)years.add(y)}
 const available=[...years].sort((a,b)=>b-a);
 if(selected!=='all'&&!years.has(Number(selected)))selected=String(yearNow());
 select.replaceChildren();
 const all=document.createElement('option');all.value='all';all.textContent='All Time ♡';select.append(all);
 for(const year of available){
  const opt=document.createElement('option');opt.value=String(year);opt.textContent=String(year);select.append(opt);
 }
 select.value=selected;
}
function statCards(list){
 const dated=list.length;
 const pages=list.reduce((s,b)=>s+Math.max(0,Number(b.pages)||0),0);
 const rated=list.map(b=>Number(b.rating)).filter(n=>Number.isFinite(n)&&n>0&&n<=5);
 const avg=rated.length?(rated.reduce((a,b)=>a+b,0)/rated.length).toFixed(1)+'/5':'—';
 const days=new Set(sessionsFor().map(s=>s.date).filter(d=>dateYear(d)!==null)).size;
 const data=[['📚','Books finished',dated],['📖','Pages finished',pages.toLocaleString()],['⭐','Average rating',avg],['☕','Reading days logged',days]];
 document.getElementById('stats-big').innerHTML=data.map(([icon,name,value])=>'<div class="stat"><span class="icon">'+icon+'</span><small>'+name+'</small><strong>'+value+'</strong></div>').join('');
}
function genreChart(list){
 const map=new Map();
 for(const b of list){const g=String(b.genre||'Other').trim()||'Other';map.set(g,(map.get(g)||0)+1)}
 const entries=[...map].sort((a,b)=>b[1]-a[1]);
 document.getElementById('genres').innerHTML=entries.length?entries.map(([name,n])=>
  '<div class="genrebar"><div class="labels"><span>'+esc(name)+'</span><span>'+n+'</span></div><div class="progress"><div class="bar" style="width:'+(n/list.length*100)+'%"></div></div></div>').join('')
  :'<p class="muted">No finished books with dates in this period yet. ♡</p>';
}
function authorChart(list){
 const map=new Map();
 for(const b of list){const author=String(b.author||'Unknown').trim()||'Unknown';map.set(author,(map.get(author)||0)+1)}
 const node=document.getElementById('bs-stats-authors');node.replaceChildren();
 for(const [name,count] of [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,6)){
  const item=document.createElement('div');item.className='bs-author-line';
  const title=document.createElement('span');title.textContent=name;
  const strong=document.createElement('strong');strong.textContent=count+' book'+(count===1?'':'s');
  item.append(title,strong);node.append(item);
 }
 if(!node.childNodes.length)node.textContent='Your favorite authors will appear here when you finish books. ♡';
}
function monthlyChart(list){
 const node=document.getElementById('bs-stats-months');node.replaceChildren();
 const end=yearNow(),year=Number(selected);
 let columns=[];
 if(selected==='all'){
  const years=[...new Set(allRead().map(b=>dateYear(b.finished)).filter(Boolean))].sort((a,b)=>a-b);
  if(!years.length)years.push(end);
  columns=years.map(y=>({label:String(y),count:list.filter(b=>dateYear(b.finished)===y).length}));
 }else{
  columns=Array.from({length:12},(_,i)=>({label:new Date(2020,i,1).toLocaleString('en',{month:'short'}),count:list.filter(b=>String(b.finished||'').startsWith(String(year)+'-'+String(i+1).padStart(2,'0'))).length}));
 }
 const maximum=Math.max(1,...columns.map(x=>x.count));
 for(const entry of columns){
  const col=document.createElement('div');col.className='bs-month-cell';
  const val=document.createElement('span');val.className='bs-month-count';val.textContent=entry.count;
  const track=document.createElement('div');track.className='bs-month-track';
  const fill=document.createElement('div');fill.className='bs-month-fill';fill.style.height=(entry.count/maximum*100)+'%';
  track.append(fill);
  const text=document.createElement('span');text.textContent=entry.label;
  col.append(val,track,text);node.append(col);
 }
 const heading=node.closest('.panel')?.querySelector('h3');
 if(heading)heading.textContent=selected==='all'?'Books finished by year 🌸':'Books finished by month 🌸';
}
function dayGrid(){
 const node=document.getElementById('bs-stats-days');if(!node)return;node.replaceChildren();
 let end;
 if(selected==='all'||Number(selected)===yearNow())end=new Date();
 else end=new Date(Number(selected),11,31);
 const marked=new Set(sessionsFor().map(x=>x.date));
 let active=0;
 for(let i=34;i>=0;i--){
  const d=new Date(end.getFullYear(),end.getMonth(),end.getDate()-i);
  const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const on=marked.has(key);if(on)active++;
  const item=document.createElement('span');item.className='bs-reading-day'+(on?' active':'')+(i===0&&selected!=='all'&&Number(selected)===yearNow()?' today':'');
  item.title=key+(on?' · Reading session':' · No session logged');item.textContent=d.getDate();node.append(item);
 }
 const title=node.closest('.panel')?.querySelector('h3');
 if(title)title.textContent=selected==='all'||Number(selected)===yearNow()?'My reading days ☕':'My reading days · end of '+selected+' ☕';
 const info=document.getElementById('bs-stats-days-note');
 if(info)info.textContent=active+' of 35 displayed days have a recorded reading session.';
}
function goal(list){
 const panel=document.getElementById('goalInput')?.closest('.panel');
 const goalInput=document.getElementById('goalInput');
 const count=document.getElementById('goalCount');
 if(!panel||!goalInput||!count)return;
 let hint=panel.querySelector('.bs-stats-current-only-note');
 if(!hint){hint=document.createElement('p');hint.className='bs-stats-current-only-note';panel.append(hint)}
 const controls=goalInput.closest('.controls');
 if(selected===String(yearNow())){
  document.getElementById('currentYear').textContent=selected;
  count.textContent=list.length;const target=getGoal();
  goalInput.value=target;
  document.getElementById('goalTarget').textContent='/ '+target+' books';
  document.getElementById('goalProgress').style.width=Math.min(100,100*list.length/target)+'%';
  controls.hidden=false;hint.hidden=true;
 }else{
  document.getElementById('currentYear').textContent=selected==='all'?'all time':selected;
  count.textContent=list.length;
  document.getElementById('goalTarget').textContent='finished';
  document.getElementById('goalProgress').style.width='0%';
  controls.hidden=true;hint.hidden=false;
  hint.textContent='The annual reading goal can be edited in '+yearNow()+' view.';
 }
}

const former=renderStats;
let rendering=false;
let errorMessage=null;
function showProblem(error){
 console.error('Reading stats period render',error);
 notice.textContent='Some reading statistics could not be displayed: '+(error?.message||String(error))
   +'. Your books have not been changed.';
}
function fillPeriod(){
 options();
 if(rendering)return;
 rendering=true;
 try{
  const list=filtered();
  // Each visual is independent; a failure in one must not blank the rest.
  for(const fn of [statCards,genreChart,authorChart,monthlyChart]){
   try{fn(list)}catch(error){showProblem(error)}
  }
  try{dayGrid()}catch(error){showProblem(error)}
  try{goal(list)}catch(error){showProblem(error)}
  const unknown=allRead().filter(b=>dateYear(b.finished)===null).length;
  if(!errorMessage){
   notice.textContent=selected==='all'
    ?'All-time includes '+unknown+' read book'+(unknown===1?'':'s')+' with no valid finish date.'
    :'Showing books completed in '+selected+'. '+unknown+' read book'+(unknown===1?' has':'s have')+' no valid finish date.';
  }
 }catch(error){showProblem(error)}
 finally{rendering=false}
}
renderStats=function(){
 try{former()}catch(error){console.warn('Base Reading Stats render failed; using period statistics instead.',error)}
 fillPeriod();
};
select.addEventListener('change',()=>{
 selected=select.value;
 try{localStorage.setItem(periodKey,selected)}catch(error){}
 renderStats();
});
// Fill the selector at startup rather than waiting for another page navigation.
try{options()}catch(error){showProblem(error)}
if(!page.classList.contains('hidden'))renderStats();
// Some navigation paths replace the go() wrapper without refreshing this view.
page.addEventListener('click',event=>{
 if(event.target.closest('#bs-period-select'))return;
});
// Do not allow the dropdown to remain blank even when the base app rerenders.
document.querySelectorAll('[data-nav="stats"]').forEach(btn=>{
 btn.addEventListener('click',()=>{
  queueMicrotask(()=>{if(!page.classList.contains('hidden'))renderStats()});
 });
});
})();