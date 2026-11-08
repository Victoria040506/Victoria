/* Blue Shelf Reading Stats v3 — self-contained, read-only period views. */
(function(){
'use strict';
const root=document.getElementById('page-stats');
const hero=root?.querySelector('.bs-stats-hero');
if(!root||!hero)return;
const style=document.createElement('style');
style.textContent='.bs-stats-period{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 20px;background:linear-gradient(110deg,#eaf6fb,#fff4f9);border:1px solid #dfeaf1;border-radius:20px;margin:16px 0 20px}.bs-stats-period label{font-size:13px;color:#567d96;font-weight:700}.bs-stats-period p{font-size:12px;color:#829baa;margin:4px 0 0}.bs-stats-period select{border:1px solid #d9e6ee;background:#fff;border-radius:14px;color:#547992;font:600 13px "DM Sans",sans-serif;padding:11px 14px;min-width:165px}.bs-stats-period-feedback{font-size:12px;color:#748ea1;margin:0 0 15px}.bs-stats-period-feedback.error{color:#ac536b}#page-stats .controls[hidden]{display:none!important}#page-stats #bs-stats-months{overflow-x:auto;padding-bottom:6px}@media(max-width:620px){.bs-stats-period select{width:100%}}';
document.head.append(style);
let toolbar=document.getElementById('bs-stats-period-toolbar');
if(!toolbar){
 toolbar=document.createElement('div');toolbar.id='bs-stats-period-toolbar';toolbar.className='bs-stats-period';
 const info=document.createElement('div');
 const label=document.createElement('label');label.htmlFor='bs-period-select';label.textContent='✦ Reading statistics for';
 const hint=document.createElement('p');hint.textContent='Your reading story, year by year or all time ♡';
 info.append(label,hint);
 const select=document.createElement('select');select.id='bs-period-select';select.setAttribute('aria-label','Statistics period');
 toolbar.append(info,select);
 hero.insertAdjacentElement('afterend',toolbar);
}
let feedback=document.getElementById('bs-stats-period-feedback');
if(!feedback){feedback=document.createElement('p');feedback.id='bs-stats-period-feedback';feedback.className='bs-stats-period-feedback';toolbar.insertAdjacentElement('afterend',feedback)}
const select=toolbar.querySelector('#bs-period-select');
const genreMode=document.createElement('select');
genreMode.id='bs-genre-stats-mode';
genreMode.setAttribute('aria-label','Group genre chart by main genre or subgenre');
genreMode.innerHTML='<option value="parent">Main genres</option><option value="detail">Detailed subgenres</option>';
const genreModeLabel=document.createElement('label');
genreModeLabel.htmlFor='bs-genre-stats-mode';genreModeLabel.textContent='Genre detail';
const genreModeWrap=document.createElement('div');
genreModeWrap.append(genreModeLabel,genreMode);
toolbar.append(genreModeWrap);
try{genreMode.value=localStorage.getItem('blue-shelf-stats-genre-mode')||'parent'}catch(e){genreMode.value='parent'}

const key='blue-shelf-stats-period-v3';
let selected;
try{selected=localStorage.getItem(key)||String(new Date().getFullYear())}catch(e){selected=String(new Date().getFullYear())}
const val=id=>document.getElementById(id);
const currentYear=()=>new Date().getFullYear();
const getBooks=()=>{
 try{return typeof books!=='undefined'&&Array.isArray(books)?books:[]}catch(e){return []}
};
const getSessions=()=>{
 try{return typeof readingSessions!=='undefined'&&Array.isArray(readingSessions)?readingSessions:[]}catch(e){return []}
};
function yearOf(date){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));
 if(!m)return null;
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 if(y<1900||y>currentYear())return null;
 const actual=new Date(y,mo-1,d);
 return actual.getFullYear()===y&&actual.getMonth()===mo-1&&actual.getDate()===d?y:null;
}
function readBooks(){return getBooks().filter(b=>b?.status==='Read')}
function eligible(){return selected==='all'?readBooks():readBooks().filter(b=>yearOf(b.finished)===Number(selected))}
function matchingSessions(){return selected==='all'?getSessions():getSessions().filter(s=>yearOf(s.date)===Number(selected))}
function getYearOptions(){
 const years=new Set([currentYear()]);
 for(const b of readBooks()){const y=yearOf(b.finished);if(y)years.add(y)}
 for(const s of getSessions()){const y=yearOf(s.date);if(y)years.add(y)}
 const old=selected;
 if(selected!=='all'&&!years.has(Number(selected)))selected=String(currentYear());
 select.replaceChildren();
 const all=document.createElement('option');all.value='all';all.textContent='All Time ♡';select.append(all);
 [...years].sort((a,b)=>b-a).forEach(y=>{const option=document.createElement('option');option.value=String(y);option.textContent=String(y);select.append(option)});
 select.value=selected;
 return old!==selected;
}
function replaceCards(list){
 const node=val('stats-big');if(!node)return;
 const total=list.length;
 const pages=list.reduce((sum,b)=>sum+(Math.max(0,Number(b.pages)||0)),0);
 const ratings=list.map(b=>Number(b.rating)).filter(n=>Number.isFinite(n)&&n>0&&n<=5);
 const average=ratings.length?(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1)+' / 5':'—';
 const days=new Set(matchingSessions().map(s=>s.date).filter(x=>yearOf(x))).size;
 const data=[['📚','Books finished',total],['📖','Pages finished',pages.toLocaleString()],['✧','Average rating',average],['☕','Reading days logged',days]];
 node.replaceChildren();
 for(const [symbol,title,value] of data){
  const card=document.createElement('div');card.className='stat';
  const ico=document.createElement('span');ico.className='icon';ico.textContent=symbol;
  const name=document.createElement('small');name.textContent=title;
  const strong=document.createElement('strong');strong.textContent=value;
  card.append(ico,name,strong);node.append(card);
 }
}
function replaceGenres(list){
 const node=val('genres');if(!node)return;
 const groups=new Map();
 for(const book of list){
  const detail=String(book.genre||'Other').trim()||'Other';
  const name=genreMode.value==='parent'&&typeof window.bsGenreParent==='function'
    ?window.bsGenreParent(detail):detail;
  groups.set(name,(groups.get(name)||0)+1);
 }
 node.replaceChildren();
 if(!list.length){node.textContent='No finished books recorded in this period. ♡';return}
 for(const [name,n] of [...groups].sort((a,b)=>b[1]-a[1])){
  const item=document.createElement('div');item.className='genrebar';
  const labels=document.createElement('div');labels.className='labels';
  const title=document.createElement('span');title.textContent=name;
  const count=document.createElement('span');count.textContent=n;
  labels.append(title,count);
  const progress=document.createElement('div');progress.className='progress';
  const bar=document.createElement('div');bar.className='bar';bar.style.width=(100*n/list.length)+'%';
  progress.append(bar);item.append(labels,progress);node.append(item);
 }
}
function replaceAuthors(list){
 const node=val('bs-stats-authors');if(!node)return;
 const groups=new Map();
 for(const book of list){const name=String(book.author||'Unknown').trim()||'Unknown';groups.set(name,(groups.get(name)||0)+1)}
 node.replaceChildren();
 for(const [name,n] of [...groups].sort((a,b)=>b[1]-a[1]).slice(0,6)){
  const item=document.createElement('div');item.className='bs-author-line';
  const title=document.createElement('span');title.textContent=name;
  const count=document.createElement('strong');count.textContent=n+' book'+(n===1?'':'s');
  item.append(title,count);node.append(item);
 }
 if(!node.childElementCount)node.textContent='No recorded authors for this period.';
}
function replaceMonthly(list){
 const node=val('bs-stats-months');if(!node)return;
 let columns;
 if(selected==='all'){
  const years=[...new Set(list.map(b=>yearOf(b.finished)).filter(Boolean))].sort((a,b)=>a-b);
  if(!years.length)years.push(currentYear());
  columns=years.map(y=>({label:String(y),count:list.filter(b=>yearOf(b.finished)===y).length}));
 }else{
  columns=Array.from({length:12},(_,i)=>({label:new Date(2020,i,1).toLocaleDateString('en',{month:'short'}),count:list.filter(b=>String(b.finished||'').startsWith(selected+'-'+String(i+1).padStart(2,'0'))).length}));
 }
 const max=Math.max(1,...columns.map(c=>c.count));
 node.replaceChildren();
 for(const entry of columns){
  const col=document.createElement('div');col.className='bs-month-cell';
  const n=document.createElement('span');n.className='bs-month-count';n.textContent=entry.count;
  const track=document.createElement('div');track.className='bs-month-track';
  const fill=document.createElement('div');fill.className='bs-month-fill';fill.style.height=(entry.count/max*100)+'%';
  track.append(fill);
  const label=document.createElement('span');label.textContent=entry.label;
  col.append(n,track,label);node.append(col);
 }
 const heading=node.closest('.panel')?.querySelector('h3');
 if(heading)heading.textContent=selected==='all'?'Books finished by year 🌸':'Books finished by month 🌸';
}
function replaceDays(){
 const node=val('bs-stats-days');if(!node)return;
 const end=selected==='all'||Number(selected)===currentYear()?new Date():new Date(Number(selected),11,31);
 const marked=new Set(matchingSessions().map(s=>s.date));
 let activity=0;node.replaceChildren();
 for(let i=34;i>=0;i--){
  const d=new Date(end.getFullYear(),end.getMonth(),end.getDate()-i);
  const day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const read=marked.has(day);if(read)activity++;
  const cell=document.createElement('span');cell.className='bs-reading-day'+(read?' active':'')+(i===0&&selected===String(currentYear())?' today':'');
  cell.title=day+(read?' · Reading logged':' · No recorded session');cell.textContent=d.getDate();node.append(cell);
 }
 if(val('bs-stats-days-note'))val('bs-stats-days-note').textContent=activity+' of these 35 days have a recorded reading session.';
}
function replaceGoal(list){
 const target=val('goalInput'),counter=val('goalCount'),year=val('currentYear'),progress=val('goalProgress');
 if(!target||!counter||!year||!progress)return;
 const panel=target.closest('.panel'),controls=target.closest('.controls');
 let hint=panel?.querySelector('.bs-stats-goal-hint');
 if(!hint&&panel){hint=document.createElement('p');hint.className='bs-stats-goal-hint muted';panel.append(hint)}
 const isCurrent=selected===String(currentYear());
 year.textContent=selected==='all'?'all time':selected;
 counter.textContent=list.length;
 const goalValue=typeof getGoal==='function'?getGoal():72;
 target.value=goalValue;
 if(val('goalTarget'))val('goalTarget').textContent=isCurrent?'/ '+goalValue+' books':'finished';
 progress.style.width=isCurrent?Math.min(100,100*list.length/goalValue)+'%':'0%';
 if(controls)controls.hidden=!isCurrent;
 if(hint){hint.hidden=isCurrent;hint.textContent='You can update your annual goal in the current year view.'}
}
let busy=false,lastBooksSignature='';
function display(){
 if(busy)return;
 busy=true;
 try{
  getYearOptions();
  const list=eligible();
  const parts=[replaceCards,replaceGenres,replaceAuthors,replaceMonthly];
  const errors=[];
  for(const fn of parts){try{fn(list)}catch(e){errors.push(e);console.error('Reading Stats '+fn.name,e)}}
  for(const fn of [replaceDays,()=>replaceGoal(list)]){try{fn()}catch(e){errors.push(e);console.error('Reading Stats section',e)}}
  feedback.classList.toggle('error',errors.length>0);
  if(errors.length)feedback.textContent='Some statistics could not be displayed. '+errors[0].message;
  else{
   const undated=readBooks().filter(b=>!yearOf(b.finished)).length;
   feedback.textContent=selected==='all'
    ?'All Time includes '+undated+' read book'+(undated===1?'':'s')+' with no finish date.'
    :'Showing books finished in '+selected+'. '+undated+' read book'+(undated===1?' has':'s have')+' no recorded finish year.';
  }
 }catch(e){console.error('Reading Stats initialization',e);feedback.classList.add('error');feedback.textContent='Statistics could not load: '+e.message}
 finally{busy=false}
}
genreMode.addEventListener('change',()=>{
 try{localStorage.setItem('blue-shelf-stats-genre-mode',genreMode.value)}catch(e){}
 display();
});
select.addEventListener('change',()=>{
 selected=select.value;
 try{localStorage.setItem(key,selected)}catch(e){}
 display();
});
const navigation=document.querySelector('[data-nav="stats"]');
navigation?.addEventListener('click',()=>setTimeout(display,0));
const originalRender=typeof renderStats==='function'?renderStats:null;
if(originalRender){
 renderStats=function(){
  try{originalRender()}catch(e){console.warn('Legacy stats render skipped',e)}
  display();
 };
}
display();
// Account changes and initial restores can complete after page initialization.
let lastSnapshot='';
setInterval(()=>{
 if(root.classList.contains('hidden'))return;
 const list=getBooks();
 const snapshot=list.length+'|'+list.filter(b=>b.status==='Read').length+'|'+list.reduce((n,b)=>n+(b.status==='Read'?String(b.finished||'').length:0),0);
 if(snapshot!==lastSnapshot){lastSnapshot=snapshot;display()}
},4500);
})();