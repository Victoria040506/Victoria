/* Blue Shelf — safe automatic genre suggestions, 2026.
   Never overwrite manually assigned genres, ratings, reading dates, or books. */
(function(){
'use strict';
const library=document.getElementById('page-library');
if(!library||document.getElementById('bs-auto-genre-box'))return;
const rules=[
 ['Fantasy',/\b(?:fantasy|fantastyka|fantastyczne|magic fantasy|magical fantasy|high fantasy|urban fantasy)\b/i],
 ['Science Fiction',/\b(?:science fiction|sci[- ]fi|science-fiction|fiction scientifique|fantastyka naukowa|dystopian|dystopia|space opera|cyberpunk)\b/i],
 ['Romance',/\b(?:romance|romans|romansid|romantic fiction|love stories|romantic suspense|romantasy)\b/i],
 ['Mystery',/\b(?:mystery|mysteries|detective fiction|cozy mystery|crime fiction|kryminał|kryminal|police procedural)\b/i],
 ['Thriller',/\b(?:thriller|suspense fiction|psychological suspense|sensacja|psychological thriller)\b/i],
 ['Horror',/\b(?:horror|ghost stories|gothic horror|groza|supernatural horror)\b/i],
 ['Historical Fiction',/\b(?:historical fiction|historical novel|powieść historyczna|powiesc historyczna)\b/i],
 ['Young Adult',/\b(?:young adult|juvenile fiction|teen fiction|młodzieżowa|mlodziezowa)\b/i],
 ['Comics',/\b(?:comics|comic books|graphic novels|manga|manhwa|komiks|komiksy)\b/i],
 ['Biography',/\b(?:biograph(?:y|ies)|autobiograph(?:y|ies)|memoirs?|biografia|wspomnienia)\b/i],
 ['Nonfiction',/\b(?:nonfiction|non-fiction|popular science|self-help|psychology|history non-fiction|reportage|reportaż|reportaz|poradnik)\b/i],
 ['Poetry',/\b(?:poetry|poems|wiersze|poezja)\b/i],
 ['Literary Fiction',/\b(?:literary fiction|contemporary fiction|fiction literaria|literatura piękna|literatura piekna)\b/i]
];
// Detailed genres use explicitly labeled metadata, not plot keywords.
const bsSubgenreRules=[
 ['Cozy Mystery',/\b(?:cozy|cosy)\s+(?:mystery|mysteries|detective|murder)\b/i],
 ['Dark Academia',/\bdark academia\b/i],
 ['Dark Fantasy',/\bdark fantasy\b/i],
 ['Urban Fantasy',/\burban fantasy\b/i],
 ['Epic Fantasy',/\b(?:epic|high)\s+fantasy\b/i],
 ['Romantasy',/\b(?:romantasy|fantasy romance|romantic fantasy|fae romance|faerie romance)\b/i],
 ['Paranormal Romance',/\b(?:paranormal romance|supernatural romance|vampire romance|shifter romance|werewolf romance|monster romance|demon romance)\b/i],
 ['Dark Romance',/\b(?:dark (?:contemporary|new adult|college|high school|billionaire|bully|mafia|mm|m\/m|rockstar|sports|marriage)?\s*romance)\b/i],
 ['Mafia Romance',/\b(?:mafia romance|mob romance|bratva romance)\b/i],
 ['Sports Romance',/\b(?:sports romance|hockey romance|football romance|baseball romance|racing romance|formula 1 romance|f1 romance)\b/i],
 ['Historical Romance',/\b(?:historical romance|regency romance|victorian romance)\b/i],
 ['Romantic Suspense',/\bromantic suspense\b/i],
 ['Romantic Comedy',/\b(?:romantic comedy|romcom|rom-com)\b/i],
 ['Contemporary Romance',/\b(?:contemporary romance|modern romance)\b/i],
 ['College Romance',/\b(?:college romance|campus romance|university romance)\b/i],
 ['Bully Romance',/\b(?:bully romance|high school bully romance)\b/i],
 ['MM Romance',/\b(?:mm romance|m\/m romance|queer romance)\b/i],
 ['Psychological Thriller',/\bpsychological thriller\b/i],
 ['Crime Thriller',/\b(?:crime thriller|legal thriller|detective thriller)\b/i],
 ['Gothic Horror',/\b(?:gothic horror|gothic fiction)\b/i],
 ['Graphic Novel',/\bgraphic novels?\b/i],
 ['Manga',/\bmanga\b/i],
 ['Manhwa',/\bmanhwa\b/i]
];
const bsGenreParents={
 'Cozy Mystery':'Mystery','Dark Academia':'Literary Fiction',
 'Dark Fantasy':'Fantasy','Urban Fantasy':'Fantasy','Epic Fantasy':'Fantasy','Romantasy':'Fantasy',
 'Paranormal Romance':'Romance','Dark Romance':'Romance','Mafia Romance':'Romance',
 'Sports Romance':'Romance','Historical Romance':'Romance','Romantic Suspense':'Romance',
 'Romantic Comedy':'Romance','Contemporary Romance':'Romance','College Romance':'Romance',
 'Bully Romance':'Romance','MM Romance':'Romance',
 'Psychological Thriller':'Thriller','Crime Thriller':'Thriller','Gothic Horror':'Horror',
 'Graphic Novel':'Comics','Manga':'Comics','Manhwa':'Comics'
};
window.bsGenreParent=g=>bsGenreParents[g]||g||'Other';
function bsGenreFromText(text){
 const clean=String(text||'').replace(/<[^>]*>/g,' ').slice(0,2500);
 const hit=bsSubgenreRules.find(([,pattern])=>pattern.test(clean));
 return hit?hit[0]:'';
}
function classify(subjects){
 const values=Array.isArray(subjects)?subjects:[subjects];
 const found=[];
 for(const value of values){
  const specific=bsGenreFromText(value);
  if(specific)return specific;
  const raw=String(value||'').trim();
  if(!raw||raw.length>160)continue;
  for(const [genre,regex] of rules){
   if(regex.test(raw)&&!found.includes(genre))found.push(genre);
  }
 }
 // Only select the strongest listed catalog category. Genre is editable.
 return found[0]||'';
}
window.bsGenreFromSubjects=classify;
const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isbn=v=>String(v||'').replace(/[^0-9X]/gi,'').toUpperCase();
function exactLocalGenre(b){
 const targetISBN=isbn(b.isbn);
 const targetTitle=normalize(b.title),targetAuthor=normalize(b.author);
 for(const other of books){
  if(other===b||!String(other.genre||'').trim())continue;
  if(targetISBN.length>=10&&targetISBN===isbn(other.isbn))return {genre:other.genre,source:'Same ISBN already in library'};
  if(targetTitle&&targetAuthor&&targetTitle===normalize(other.title)&&targetAuthor===normalize(other.author))return {genre:other.genre,source:'Same book and author in library'};
 }
 return null;
}
// Offline inference from explicitly recorded metadata. Descriptive language is
// weaker than an actual catalog subject, so every result stays reviewable.
const explicitGenreSignals=[
 ['Fantasy',/(?:\b(?:fantasy|fantastyka|fantastycznej|fantastyczny|fantastyczna|fantasy romance|romantasy|urban fantasy|high fantasy|epic fantasy)\b)/iu],
 ['Romance',/(?:\b(?:romance novel|romance book|romance story|romantic novel|contemporary romance|dark romance|sports romance|historical romance|romans(?:u|em|owa|owy)?|powieść romantyczna|powiesc romantyczna)\b)/iu],
 ['Science Fiction',/(?:\b(?:science fiction|sci.fi|dystopian novel|dystopian fiction|fantastyka naukowa|powieść dystopijna|powiesc dystopijna|space opera|cyberpunk novel)\b)/iu],
 ['Mystery',/(?:\b(?:mystery novel|mystery series|detective novel|detective fiction|cozy mystery|crime novel|crime fiction|kryminał(?:u|em)?|powieść kryminalna|powiesc kryminalna)\b)/iu],
 ['Thriller',/(?:\b(?:psychological thriller|thriller novel|thriller psychologiczny|thrillera|thrillerem|thriller)\b)/iu],
 ['Horror',/(?:\b(?:horror novel|horror story|horror fiction|powieść grozy|powiesc grozy|horror)\b)/iu],
 ['Historical Fiction',/(?:\b(?:historical fiction|historical novel|powieść historyczna|powiesc historyczna)\b)/iu],
 ['Comics',/(?:\b(?:graphic novel|graphic novels|manga|manhwa|komiks|komiksy)\b)/iu],
 ['Biography',/(?:\b(?:biography|autobiography|memoir|biografia|autobiografia|wspomnienia)\b)/iu],
 ['Poetry',/(?:\b(?:poetry collection|poem collection|zbiór wierszy|zbior wierszy|poezja)\b)/iu]
];
function localBookGenre(b){
 const copies=exactLocalGenre(b);
 if(copies)return copies;
 // Imported EPUB subjects are sometimes stored as subject/category metadata.
 const subjects=[b.subject,b.subjects,b.categories,b.category].flat().filter(Boolean);
 const tag=classify(subjects);
 if(tag)return {genre:tag,source:'Stored catalog/EPUB subject · review'};
 const description=String(b.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1400);
 const titleSubgenre=bsGenreFromText(b.title);
 if(titleSubgenre)return {genre:titleSubgenre,source:'Explicit subgenre in title · review'};
 const descriptionSubgenre=bsGenreFromText(description);
 if(descriptionSubgenre)return {genre:descriptionSubgenre,source:'Subgenre mentioned in description · review'};
 if(!description)return null;
 const matches=explicitGenreSignals.filter(([,re])=>re.test(description));
 // No genre inference if conflicting explicit descriptions.
 if(matches.length!==1)return null;
 return {genre:matches[0][0],source:'Genre mentioned in book description · review'};
}
async function onlineGenre(b){
 if(!b.author&&!b.isbn)return null;
 const cleanISBN=isbn(b.isbn);
 const query=cleanISBN.length>=10?'isbn:'+cleanISBN:
  'intitle:"'+String(b.title||'').replace(/"/g,'').slice(0,85)+'" inauthor:"'+String(b.author).replace(/"/g,'').slice(0,70)+'"';
 const response=await fetch('https://www.googleapis.com/books/v1/volumes?'+new URLSearchParams({q:query,maxResults:'5',printType:'books'}),{signal:AbortSignal.timeout(12000)});
 if(response.status===429)throw new Error('RATE_LIMIT');
 if(!response.ok)throw new Error('HTTP '+response.status);
 const data=await response.json();
 for(const item of data.items||[]){
  const v=item.volumeInfo||{};
  const ids=(v.industryIdentifiers||[]).map(x=>isbn(x.identifier));
  const isbnMatch=cleanISBN.length>=10&&ids.includes(cleanISBN);
  const titleMatch=normalize(v.title)===normalize(b.title);
  const authorMatch=normalize(b.author)&&Array.isArray(v.authors)&&v.authors.some(a=>{
   const x=normalize(a),y=normalize(b.author);return x===y||(x.length>6&&y.length>6&&(x.includes(y)||y.includes(x)));
  });
  if(!isbnMatch&&!(titleMatch&&authorMatch))continue;
  const genre=classify(v.categories);
  if(genre)return {genre,source:'Google Books category'};
 }
 return null;
}
const ui=document.createElement('section');
ui.id='bs-auto-genre-box';ui.className='bs-auto-genre-box';
ui.innerHTML='<div class="bs-auto-genre-heading"><div><strong>🌷 Automatic book genres</strong><p>Check your whole library offline using book descriptions and metadata. Review suggestions before saving. Existing genres stay unchanged.</p></div><button id="bs-auto-genre-start" type="button">✧ Analyze all books offline</button><button id="bs-auto-genre-online" type="button">⌕ Try online catalog (optional)</button></div><p id="bs-auto-genre-feedback" role="status" aria-live="polite"></p><div id="bs-auto-genre-review" class="bs-auto-genre-review"></div>';
const style=document.createElement('style');
style.textContent='#bs-auto-genre-box{border:1px solid #deebef;background:linear-gradient(110deg,#eef8fc,#fff4f9);border-radius:20px;padding:18px 20px;margin:18px 0 24px;color:#587e95}#bs-auto-genre-box .bs-auto-genre-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}#bs-auto-genre-box strong{font:600 19px Georgia,serif;color:#47718e}#bs-auto-genre-box p{font-size:12px;line-height:1.6;margin:6px 0}#bs-auto-genre-box button{border:1px solid #cfe0e8;border-radius:99px;background:white;padding:9px 15px;color:#477b99;cursor:pointer;font-weight:700}#bs-auto-genre-box button:disabled{opacity:.55;cursor:wait}#bs-auto-genre-box .bs-auto-genre-heading button{margin:3px 4px}#bs-auto-genre-feedback{padding:6px 0}#bs-auto-genre-review label{cursor:pointer}#bs-auto-genre-review{max-height:320px;overflow-y:auto}#bs-auto-genre-review label{display:flex;gap:9px;align-items:center;padding:8px;border-bottom:1px solid #e9e8ed;font-size:12px}#bs-auto-genre-review label span{flex:1;min-width:0;overflow-wrap:anywhere}#bs-auto-genre-review label em{color:#7995a7;font-style:normal}#bs-auto-genre-review .bs-genre-apply{margin:12px 0 4px;background:#83acc7;color:white;border:0}';
document.head.append(style);
const section=library.querySelector('.sectiontitle');
if(section)section.insertAdjacentElement('afterend',ui);
else library.prepend(ui);
const start=ui.querySelector('#bs-auto-genre-start');
const feedback=ui.querySelector('#bs-auto-genre-feedback');
const review=ui.querySelector('#bs-auto-genre-review');
let scanning=false,proposals=[];
const proposalStorage='blue-shelf-genre-proposals-v3';
const proposalSignature=p=>String(p.id)+'|'+String(p.genre);
function loadProposals(){
 try{
  const data=JSON.parse(sessionStorage.getItem(proposalStorage)||'[]');
  if(!Array.isArray(data))return [];
  const byId=new Map(books.map(b=>[b.id,b]));
  return data.filter(p=>p&&typeof p.id==='string'&&typeof p.genre==='string'
   &&byId.has(p.id)&&!String(byId.get(p.id).genre||'').trim()).slice(0,3000);
 }catch{return []}
}
function persistProposals(){
 try{sessionStorage.setItem(proposalStorage,JSON.stringify(proposals))}catch(e){console.warn('Could not cache review proposals',e)}
}
function addProposal(proposal){
 if(!proposal||!proposal.id||!proposal.genre)return false;
 if(proposals.some(x=>x.id===proposal.id))return false;
 proposals.push(proposal);return true;
}
proposals=loadProposals();
function draw(){
 persistProposals();
 review.replaceChildren();
 for(let i=0;i<proposals.length;i++){
  const p=proposals[i],line=document.createElement('label');
  const check=document.createElement('input');check.type='checkbox';check.checked=true;check.dataset.genreIndex=String(i);
  const text=document.createElement('span');text.textContent=p.title;
  const genre=document.createElement('em');genre.textContent=p.genre+' · '+p.source;
  line.append(check,text,genre);review.append(line);
 }
 if(proposals.length){
  const apply=document.createElement('button');apply.className='bs-genre-apply';apply.type='button';
  apply.textContent='✓ Apply selected genres ('+proposals.length+')';
  apply.onclick=()=>{
   let changed=0;
   for(const check of review.querySelectorAll('input[type="checkbox"]:checked')){
    const p=proposals[Number(check.dataset.genreIndex)];
    const book=books.find(b=>b.id===p.id);
    if(!book||String(book.genre||'').trim())continue;
    if(typeof bsMarkEditedBook==='function')bsMarkEditedBook(book.id);
    book.genre=p.genre;book.genres=typeof window.bsGenresClean==='function'?window.bsGenresClean([p.genre,...(Array.isArray(book.genres)?book.genres:[])]):[p.genre];changed++;
   }
   if(changed){store();if(typeof renderLibrary==='function')renderLibrary()}
   proposals=[];draw();
   feedback.textContent='✓ '+changed+' missing genres filled. Your existing genres and reading progress were not changed.';
  };
  review.append(apply);
 }
}
function findMissing(){
 return books.filter(b=>b?.title&&!String(b.genre||'').trim());
}
function collectLocal(){
 // Preserve proposals already found, including results of earlier searches.
 proposals=loadProposals();
 const missing=findMissing(),found=new Set(proposals.map(p=>p.id));
 let added=0;
 for(const b of missing){
  if(found.has(b.id))continue;
  const value=localBookGenre(b);
  if(value&&addProposal({id:b.id,title:b.title,genre:value.genre,source:value.source})){
   found.add(b.id);added++;
  }
 }
 draw();
 feedback.textContent='✓ Analyzed '+missing.length+' books offline · '+proposals.length+
  ' total suggestions ('+added+' newly found). '+(proposals.length?'Review these below before applying.':
  'No clear genre evidence in the saved metadata. Online catalog results may remain unavailable.');
 return found;
}
start.addEventListener('click',()=>{
 if(scanning)return;
 try{collectLocal()}
 catch(error){
  console.error('Genre offline classification failed',error);
  feedback.textContent='Could not analyze saved book descriptions: '+error.message;
 }
});

const actions=document.createElement('div');
actions.className='bs-genre-export-actions';
const exportButton=document.createElement('button');
exportButton.type='button';exportButton.textContent='↓ Export unmatched book metadata';
exportButton.title='Download titles, authors, ISBNs and book descriptions — no notes or EPUB files';
exportButton.onclick=()=>{
 try{
  const items=findMissing().map(b=>({id:b.id,title:String(b.title||''),
   author:String(b.author||''),isbn:String(b.isbn||''),
   description:String(b.description||'').slice(0,2500)}));
  const blob=new Blob([JSON.stringify({type:'blue-shelf-genre-research',version:1,books:items},null,2)],
    {type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='blue-shelf-missing-genres.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  feedback.textContent='Exported '+items.length+' books missing genres. Includes titles, authors, ISBN and publisher descriptions, not private notes or ebook files.';
 }catch(e){feedback.textContent='Could not export metadata: '+e.message}
};
const importButton=document.createElement('button');
importButton.type='button';
importButton.textContent='↑ Import reviewed genre suggestions';
const importPicker=document.createElement('input');
importPicker.type='file';
importPicker.accept='.json,application/json';
importPicker.style.display='none';
importPicker.setAttribute('aria-label','Choose Blue Shelf genre suggestions JSON');
importButton.addEventListener('click',()=>importPicker.click());
importPicker.addEventListener('change',async()=>{
 const file=importPicker.files?.[0];
 importPicker.value='';
 if(!file)return;
 try{
  if(file.size>5*1024*1024)throw Error('File exceeds 5 MB');
  const payload=JSON.parse(await file.text());
  if(payload?.type!=='blue-shelf-genre-proposals'||payload.version!==1||!Array.isArray(payload.books))
   throw Error('This is not a Blue Shelf genre suggestions export');
  if(payload.books.length>10000)throw Error('Too many suggestions in this file');
  const existing=new Map(books.map(book=>[String(book.id),book]));
  let added=0,skipped=0;
  for(const candidate of payload.books){
   if(!candidate||typeof candidate.id!=='string'||typeof candidate.genre!=='string'
    ||typeof candidate.title!=='string'){skipped++;continue}
   const book=existing.get(candidate.id);
   if(!book||String(book.genre||'').trim()||normalize(book.title)!==normalize(candidate.title)){
    skipped++;continue;
   }
   // Restrict automatic imports to the same approved genres as local detection.
   const allowed=[...new Set([...rules.map(pair=>pair[0]),...bsSubgenreRules.map(pair=>pair[0]),'Literary Fiction'])];
   if(!allowed.includes(candidate.genre)){skipped++;continue}
   const source=String(candidate.source||'Imported metadata review').slice(0,110);
   const existingProposal=proposals.find(p=>p.id===book.id);
   // Upgrade a generic suggestion with a more specific one for the same
   // book, but never modify a genre already saved in the actual library.
   const upgrade=existingProposal&&existingProposal.genre!==candidate.genre
     &&bsGenreParents[candidate.genre]===existingProposal.genre;
   if(upgrade){
     existingProposal.genre=candidate.genre;
     existingProposal.source='Imported detailed suggestion · '+source;
     added++;
   }else if(addProposal({id:book.id,title:book.title,genre:candidate.genre,
      source:'Imported suggestion · '+source})){added++}else skipped++;
  }
  draw();
  feedback.textContent='Imported '+added+' additional genre suggestions for review; '
   +skipped+' skipped (duplicate, unmatched or already categorized). Nothing was saved to your books.';
 }catch(error){
  console.error('Genre suggestions import',error);
  feedback.textContent='Could not import suggestions: '+error.message+'. No books were modified.';
 }
});
actions.append(importButton,importPicker);
actions.append(exportButton);
ui.append(actions);
style.textContent+='#bs-auto-genre-box .bs-genre-export-actions{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}';
if(proposals.length){
 draw();
 feedback.textContent=proposals.length+' earlier genre suggestions restored for review. They have not been saved to your library.';
}
const online=ui.querySelector('#bs-auto-genre-online');
online.addEventListener('click',async()=>{
 if(scanning)return;
 scanning=true;online.disabled=true;start.disabled=true;
 try{
  const found=collectLocal();
  const missing=findMissing();
  const key='blue-shelf-genre-checked-v2';
  let cached={};try{cached=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(e){}
  const candidates=missing.filter(b=>!found.has(b.id)&&(!cached[b.id]||cached[b.id].fingerprint!==[b.title,b.author,b.isbn].join('|'))).slice(0,5);
  let checked=0,failures=0,rateLimit=false;
  for(const b of candidates){
   feedback.textContent='Optional online catalog: '+(checked+failures+1)+' / '+candidates.length+' · '+b.title;
   try{
    const result=await onlineGenre(b);checked++;
    if(result){
     found.add(b.id);
     addProposal({id:b.id,title:b.title,genre:result.genre,source:result.source+' · review'});
    }
    cached[b.id]={fingerprint:[b.title,b.author,b.isbn].join('|'),checkedAt:Date.now()};
   }catch(e){
    failures++;
    if(e.message==='RATE_LIMIT'){rateLimit=true;break}
   }
   try{localStorage.setItem(key,JSON.stringify(cached))}catch(e){}
  }
  draw();
  feedback.textContent=proposals.length+' suggested genres (offline + online) · '+checked+
   ' successful online lookups. '+(rateLimit?'Catalog limited requests. Offline matches remain available. ':
   failures?failures+' online lookups failed. ':'')+'Only selected suggestions will be saved.';
 }catch(error){
  console.error('Optional genre lookup failed',error);
  feedback.textContent='Online lookup unavailable: '+error.message+'. You can still use offline analysis.';
 }finally{
  scanning=false;start.disabled=false;online.disabled=false;
 }
});
})();