/* Blue Shelf Series Tracker enhancements — non-destructive, Nov 2026.
   Does not alter saved books on load; changes only require existing explicit approval. */
(function(){
  'use strict';
  const previousGroups=bsSeriesGroups;
  // Catalog imports sometimes place the complete book title before the actual
  // series label, e.g. "Book title: The Honey and Ice Series".
  // Only shorten unambiguous series-labelled suffixes, for display and grouping.
  // The saved series field remains untouched.
  function cleanDisplayName(value){
    const name=String(value||'').trim();
    const match=name.match(/^[^:：]{3,180}[:：]\s*((?:(?:The|A|An)\s+)?[^:：]{3,100}\s+(?:Series|Duet|Trilogy|Saga|Quartet|Chronicles|Cycle))$/i);
    return match?match[1].trim():name;
  }
  bsSeriesGroups=function(){
    const raw=previousGroups();
    const grouped=new Map();
    for(const group of raw){
      const name=cleanDisplayName(group.name);
      const key=bsSeriesNormalized(name);
      if(!grouped.has(key))grouped.set(key,{...group,key,name,items:[]});
      grouped.get(key).items.push(...group.items);
    }
    const groups=[...grouped.values()];
    groups.forEach(group=>{
      group.items.sort((a,b)=>a.number!=null&&b.number!=null?a.number-b.number:a.number!=null?-1:b.number!=null?1:String(a.book.title||'').localeCompare(String(b.book.title||'')));
      group.total=group.items.length;
      group.read=group.items.filter(item=>item.book.status==='Read').length;
      group.reading=group.items.filter(item=>item.book.status==='Currently Reading').length;
      group.progress=Math.round(100*group.read/Math.max(1,group.total));
      group.next=group.items.find(item=>item.book.status==='Currently Reading')||group.items.find(item=>item.book.status!=='Read'&&item.book.status!=='DNF');
      const present=new Set(group.items.map(item=>item.number).filter(n=>Number.isInteger(n)&&n>0&&n<=100));
      const highest=Math.max(0,...present);
      group.gaps=highest>=2&&highest<=30
        ?Array.from({length:highest},(_,i)=>i+1).filter(n=>!present.has(n))
        :[];
      group.numbered=present.size;
    });
    return groups;
  };
  const previousCard=bsSeriesCard;
  bsSeriesCard=function(group){
    let html=previousCard(group);
    if(group.gaps.length){
      const label=group.gaps.length===1?'Possible gap in your library':'Possible gaps in your library';
      const nums=group.gaps.map(n=>'#'+n).join(', ');
      const note='<p class="bs-series-gap"><span aria-hidden="true">✧</span> <strong>'+label+':</strong> '+nums+' <small>(based on numbered books you added; not a verified list of published volumes)</small></p>';
      html=html.replace('<button type="button" class="bs-series-expand"',note+'<button type="button" class="bs-series-expand"');
    }
    return html;
  };
  const previousRender=renderSeriesTracker;
  renderSeriesTracker=function(){
    previousRender();
    const page=document.getElementById('page-series');
    if(!page)return;
    const sort=document.getElementById('bs-series-sort');
    if(sort&&!sort.querySelector('[value="missing"]')){
      const option=document.createElement('option');option.value='missing';option.textContent='Possible missing volumes first';sort.append(option);
    }
    if(sort?.value==='missing'){
      const node=document.getElementById('bs-series-list');
      if(node){
        const all=bsSeriesGroups(), search=(document.getElementById('bs-series-search')?.value||'').toLocaleLowerCase().trim();
        const filter=document.getElementById('bs-series-filter')?.value||'all';
        const visible=all.filter(g=>(!search||(g.name+' '+g.items.map(x=>x.book.title+' '+x.book.author).join(' ')).toLocaleLowerCase().includes(search))
          &&(filter==='all'||filter==='reading'&&(g.read>0&&g.read<g.total||g.reading>0)||filter==='finished'&&g.read===g.total||filter==='unread'&&g.read===0&&g.reading===0));
        visible.sort((a,b)=>b.gaps.length-a.gaps.length||a.name.localeCompare(b.name));
        node.innerHTML=visible.length?visible.map(bsSeriesCard).join(''):'<div class="bs-series-empty">No matching series found.</div>';
      }
    }
  };
  // Scan in manageable batches. Failed requests can be retried; successful checks
  // are skipped for the current page session. Never modify records automatically.
  bsSeriesScan=async function(){
    if(bsSeriesScanBusy)return;
    const btn=document.getElementById('bs-series-scan');
    const status=document.getElementById('bs-series-scan-status');
    if(!btn||!status)return;
    bsSeriesScanBusy=true;btn.disabled=true;
    let localAdded=0, remoteFound=0, failed=0, rateLimited=false, checked=0;
    try{
      for(const suggestion of bsSeriesLocalProposals())
        if(bsSeriesAddProposal(suggestion))localAdded++;
      const candidates=books.filter(b=>b?.title&&!String(b.series||'').trim()
        &&!bsSeriesExplicitTitle(b.title)&&!bsSeriesScanSeen.has(b.id)).slice(0,25);
      for(const b of candidates){
        status.textContent='Checking '+(++checked)+' / '+candidates.length+': '+b.title;
        try{
          const value=await bsSeriesFetchSuggestion(b);
          bsSeriesScanSeen.add(b.id);
          if(value&&bsSeriesAddProposal(value))remoteFound++;
        }catch(error){
          failed++;
          if(error?.message==='RATE_LIMIT'){rateLimited=true;break;}
        }
      }
      status.textContent=(localAdded+remoteFound)+' new suggestions · '+checked+' online records checked. '
        +(rateLimited?'Catalog rate limit reached; try later. ':failed?failed+' lookups failed and may be retried. ':'')
        +'Review every suggestion before saving. Catalog coverage is incomplete.';
      if(!checked&&!localAdded)status.textContent='No unchecked books left in this session. Reload to start a fresh scan.';
      bsSeriesRenderProposals();
    }finally{
      bsSeriesScanBusy=false;btn.disabled=false;
    }
  };

  /* Series discovery v3: use ISBN where available, verify the actual
     author/title, inspect Open Library edition metadata and annotated titles,
     and remember completed checks between visits. Never auto-save books. */
  const seriesScanCacheKey='blue-shelf-series-scan-v3';
  let seriesScanStop=false;
  const seriesScanRead=()=>{
    try {return JSON.parse(localStorage.getItem(seriesScanCacheKey)||'{}')||{};}
    catch(e){return {};}
  };
  const seriesScanCache=seriesScanRead();
  function seriesScanPersist(){
    try {localStorage.setItem(seriesScanCacheKey,JSON.stringify(seriesScanCache));}
    catch(e){console.warn('Series scan cache unavailable',e);}
  }
  const seriesCleanTitle=value=>bsSeriesNormalized(String(value||'')
    .replace(/\s*[\(\[][^)\]]{2,110}[\)\]]\s*$/u,'')
    .replace(/\s*[,;:—–-]\s*(?:book|volume|vol|tom|tome)\s*#?\s*\d+(?:\.\d+)?\s*$/iu,''));
  function seriesSameTitle(a,b){
    const x=seriesCleanTitle(a),y=seriesCleanTitle(b);
    return x.length>=3&&x===y;
  }
  function seriesISBN(book){
    const raw=String(book.isbn||'').replace(/[^0-9Xx]/g,'').toUpperCase();
    return (raw.length===10||raw.length===13)?raw:null;
  }
  function seriesCandidate(book,series,source,number){
    const parsed=bsSeriesFromValue(series);
    if(!parsed||!bsSeriesScriptCompatible(book,parsed))return null;
    if(seriesCleanTitle(parsed.name)===seriesCleanTitle(book.title))return null;
    return {id:book.id,title:book.title,name:parsed.name,
      number:(Number.isFinite(number)&&number>0&&number<=100)?number:parsed.number,
      source,confidence:'Review'};
  }
  function seriesEditionTitle(book,title){
    const raw=String(title||'').trim();
    // Common catalog annotation: "Book Name (Series Name, #2)"
    const match=raw.match(/^(.*?)\s*[\(\[]\s*([^()\[\]]{3,100}?)\s*[,;]\s*#?\s*(\d+(?:\.\d+)?)\s*[\)\]]$/u);
    if(match&&seriesSameTitle(book.title,match[1]))
      return seriesCandidate(book,match[2],'Catalog title annotation',Number(match[3]));
    return null;
  }
  function seriesDirectTitle(book){
    // User-supplied book name with series annotation, safely reviewable.
    return seriesEditionTitle(book,book.title);
  }
  async function seriesGetJSON(url){
    const response=await fetch(url,{signal:AbortSignal.timeout(11000)});
    if(response.status===429)throw Error('RATE_LIMIT');
    if(!response.ok)throw Error('CATALOG_UNAVAILABLE');
    return response.json();
  }
  function seriesAuthorMatch(book,authors){
    if(!String(book.author||'').trim())return false;
    return bsSeriesSameAuthor(book,Array.isArray(authors)?authors:[]);
  }
  // Author-verified series: exact author + exact title only.
  // Official source: https://www.rinakent.com/pl/villain-series/ruthless-empire
  // Royal Elite #6 includes Ruthless Empire; prequel/epilogue are left unnumbered
  // unless the book itself carries an explicit number.
  const verifiedSeries=[
    {author:'Rina Kent',series:'Royal Elite',titles:{
      'cruel king':null,'deviant king':1,'steel princess':2,
      'twisted kingdom':3,'black knight':4,'vicious prince':5,
      'ruthless empire':6,'royal elite epilogue':null
    }}
  ];
  function verifiedSeriesProposal(book){
    const author=bsSeriesNormalized(book.author);
    const title=seriesCleanTitle(book.title);
    for(const set of verifiedSeries){
      if(author!==bsSeriesNormalized(set.author))continue;
      if(!Object.prototype.hasOwnProperty.call(set.titles,title))continue;
      return {id:book.id,title:book.title,name:set.series,
        number:set.titles[title],source:'Verified author series list',confidence:'Review'};
    }
    return null;
  }
  // Existing user-confirmed assignments can suggest a label for another
  // edition of the SAME title by the SAME author. No genre-based guessing.
  function matchingLocalSeries(book){
    const title=seriesCleanTitle(book.title),author=bsSeriesNormalized(book.author);
    if(!title||!author)return null;
    const matches=books.filter(other=>other.id!==book.id&&other.series
       &&bsSeriesNormalized(other.author)===author
       &&seriesCleanTitle(other.title)===title);
    const names=new Set(matches.map(b=>bsSeriesNormalized(bsSeriesParse(b)?.name)).filter(Boolean));
    if(names.size!==1)return null;
    const other=matches[0],parsed=bsSeriesParse(other);
    return {id:book.id,title:book.title,name:parsed.name,number:parsed.number,
      source:'Same title and author already in your library',confidence:'Review'};
  }
  async function seriesLookupOpenLibrary(book){
    const isbn=seriesISBN(book);
    const queries=[];
    if(isbn)queries.push({isbn,limit:'3',fields:'key,title,author_name,edition_key'});
    if(book.author)queries.push({title:bsSeriesTitleParts(book.title),author:book.author,
       limit:'3',fields:'key,title,author_name,edition_key'});
    const seen=new Set();
    let failed=false;
    for(const params of queries){
      const data=await seriesGetJSON('https://openlibrary.org/search.json?'+new URLSearchParams(params));
      for(const doc of (Array.isArray(data.docs)?data.docs:[])){
        if(!seriesSameTitle(book.title,doc.title)||!seriesAuthorMatch(book,doc.author_name))continue;
        const inline=seriesEditionTitle(book,doc.title);
        if(inline)return inline;
        const keys=Array.isArray(doc.edition_key)?doc.edition_key.slice(0,2):[];
        for(const key of keys){
          if(!/^OL\d+M$/.test(String(key))||seen.has(key))continue;
          seen.add(key);
          try{
            const edition=await seriesGetJSON('https://openlibrary.org/books/'+key+'.json');
            const fromSeries=bsSeriesFromEdition(edition);
            if(fromSeries){
              const proposal=seriesCandidate(book,fromSeries.name,'Open Library edition series',fromSeries.number);
              if(proposal)return proposal;
            }
            const annotation=seriesEditionTitle(book,edition.title);
            if(annotation)return annotation;
          }catch(e){
            if(e.message==='RATE_LIMIT')throw e;
            failed=true;
          }
        }
      }
    }
    if(failed)throw Error('CATALOG_UNAVAILABLE');
    return null;
  }
  async function seriesLookupGoogleBooks(book){
    const isbn=seriesISBN(book);
    const q=isbn?'isbn:'+isbn:'intitle:"'+String(book.title).replace(/"/g,'').slice(0,90)+'" inauthor:"'+String(book.author).replace(/"/g,'').slice(0,70)+'"';
    if(!isbn&&!book.author)return null;
    const url='https://www.googleapis.com/books/v1/volumes?'+new URLSearchParams({q,maxResults:'5',printType:'books'});
    const data=await seriesGetJSON(url);
    for(const item of (Array.isArray(data.items)?data.items:[])){
      const info=item.volumeInfo||{};
      if(!seriesSameTitle(book.title,info.title)||!seriesAuthorMatch(book,info.authors))continue;
      const annotated=seriesEditionTitle(book,info.title);
      if(annotated)return annotated;
      // Some Google Books entries contain a structured seriesInfo field.
      // Never infer a series solely from description, subject or genre.
      const ser=info.seriesInfo;
      if(ser&&typeof ser==='object'){
        const val=String(ser.seriesName||ser.name||'');
        const number=Number(ser.volumeNumber||ser.position);
        const proposal=seriesCandidate(book,val,'Google Books structured series',number);
        if(proposal)return proposal;
      }
    }
    return null;
  }
  bsSeriesFetchSuggestion=async function(book){
    const direct=verifiedSeriesProposal(book)||matchingLocalSeries(book)
      ||seriesDirectTitle(book)||bsSeriesExplicitTitle(book.title);
    if(direct)return {...direct,id:book.id,title:book.title};
    let rateLimited=false,otherError=false;
    // Try both catalogues independently. A 429 from Open Library must not
    // prevent an attempt on Google Books.
    for(const lookup of [seriesLookupOpenLibrary,seriesLookupGoogleBooks]){
      try{
        const proposal=await lookup(book);
        if(proposal)return proposal;
      }catch(e){
        if(e?.message==='RATE_LIMIT')rateLimited=true;
        else otherError=true;
      }
    }
    if(rateLimited)throw Error('RATE_LIMIT');
    if(otherError)throw Error('CATALOG_UNAVAILABLE');
    return null;
  };
  // Include annotated series in the local (no-network) pass.
  const oldLocalProposals=bsSeriesLocalProposals;
  bsSeriesLocalProposals=function(){
    const result=oldLocalProposals(),seen=new Set(result.map(x=>x.id));
    for(const b of books){
      if(!b?.title||String(b.series||'').trim()||seen.has(b.id))continue;
      const value=verifiedSeriesProposal(b)||matchingLocalSeries(b)||seriesDirectTitle(b)||seriesFromDescription(b);
      if(value){result.push(value);seen.add(b.id);}
    }
    return result;
  };
  // Cursor and retry state are separate from book metadata and stay on this device.
  // A throttled first result no longer sends every click to the same 20 records.
  const scanQueueKey='blue-shelf-series-queue-v4';
  function readScanQueue(){
    try{
      const obj=JSON.parse(localStorage.getItem(scanQueueKey)||'{}');
      return obj&&typeof obj==='object'?obj:{};
    }catch(e){return {};}
  }
  const scanQueue=readScanQueue();
  const scanFailed=scanQueue.failed&&typeof scanQueue.failed==='object'?scanQueue.failed:{};
  let scanCursor=Number.isFinite(scanQueue.cursor)?scanQueue.cursor:0;
  function persistScanQueue(){
    try{localStorage.setItem(scanQueueKey,JSON.stringify({
      cursor:scanCursor,failed:scanFailed
    }));}catch(e){console.warn('Could not save series queue cursor',e);}
  }
  function scanCandidates(){
    return books.filter(b=>b?.id&&b?.title&&!String(b.series||'').trim()
      &&!bsSeriesExplicitTitle(b.title)&&!seriesDirectTitle(b)
      &&!verifiedSeriesProposal(b)&&!matchingLocalSeries(b));
  }
  function eligibleForScan(book){
    const key=String(book.id);
    const fingerprint=[book.title,book.author,book.isbn].join('|');
    const cached=seriesScanCache[key];
    if(cached?.fingerprint===fingerprint
      &&Date.now()-cached.checkedAt<14*24*60*60*1000){
      if(cached.proposal)bsSeriesAddProposal(cached.proposal);
      return false;
    }
    const failure=scanFailed[key];
    return !(failure?.fingerprint===fingerprint&&failure.retryAfter>Date.now());
  }
  function seriesFromDescription(book){
    const description=String(book.description||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!description||description.length<20)return null;
    // Use only explicit statements: "Book 2 in the Royal Elite series" or
    // "the third book in the ... series". Never guess from shared genre.
    const direct=description.match(/\b(?:book|volume|tom|tome)\s*(\d{1,2})\s+(?:in|of|from|w|z)\s+(?:the\s+)?([A-ZÀ-Ž][\p{L}\p{N}'’&\s-]{2,70}?)\s+(?:series|duet|trilogy|saga|serii|cyklu)\b/iu);
    const reverse=description.match(/\b(?:the\s+)?([A-ZÀ-Ž][\p{L}\p{N}'’&\s-]{2,70}?)\s+(?:series|duet|trilogy|saga|serii|cyklu)\s*(?:,|:|-)?\s*(?:book|tom|volume)\s*(\d{1,2})\b/iu);
    let name,number;
    if(direct){name=direct[2];number=Number(direct[1]);}
    else if(reverse){name=reverse[1];number=Number(reverse[2]);}
    else return null;
    if(!name||name.trim().split(/\s+/).length>8||number>30)return null;
    return seriesCandidate(book,name.trim(),'Explicit series statement in book description · verify',number);
  }
  const retryMinutes=30;
  // Batch discovery: move the cursor only for actual processed records.
  // If an API throttles, continue with offline checks, but do not misreport
  // unqueried books as checked. Next run resumes the precise next item.
  const seriesRemotePauseKey='blue-shelf-series-remote-pause-v5';
  function readRemotePause(){
    try{return Number(localStorage.getItem(seriesRemotePauseKey))||0;}catch(e){return 0;}
  }
  let remotePauseUntil=readRemotePause();
  function setRemotePause(until){
    remotePauseUntil=until;
    try{localStorage.setItem(seriesRemotePauseKey,String(until));}catch(e){}
  }
  // Scanner v6: count only actual catalog requests as catalog checks.
  // Offline suggestions scan all books once per click; throttling never marks
  // skipped books as checked or advances the cursor over them.
  const bsSeriesProgress=document.createElement('div');
  bsSeriesProgress.className='bs-series-scan-progress';
  bsSeriesProgress.setAttribute('role','status');
  bsSeriesProgress.setAttribute('aria-live','polite');
  const bsSeriesStatusNode=document.getElementById('bs-series-scan-status');
  if(bsSeriesStatusNode)bsSeriesStatusNode.insertAdjacentElement('afterend',bsSeriesProgress);
  function seriesScanStats(){
    const candidates=scanCandidates();
    let successful=0,pending=0;
    for(const book of candidates){
      const f=[book.title,book.author,book.isbn].join('|');
      const saved=seriesScanCache[String(book.id)];
      if(saved?.fingerprint===f&&Date.now()-saved.checkedAt<14*86400000)successful++;
      else if(scanFailed[String(book.id)]?.retryAfter>Date.now())pending++;
    }
    return {total:candidates.length,successful,pending};
  }
  let bsLocalChecked=0,bsLocalTotal=0;
  function seriesScanShow(message){
    const stats=seriesScanStats();
    if(bsSeriesStatusNode)bsSeriesStatusNode.textContent=message;
    if(bsSeriesProgress){
      const percent=stats.total?Math.floor(stats.successful/stats.total*100):100;
      const localPercent=bsLocalTotal?Math.floor(bsLocalChecked/bsLocalTotal*100):0;
      bsSeriesProgress.innerHTML='<div class="bs-series-scan-progress-head"><strong>Local book analysis: '
        +bsLocalChecked+' / '+bsLocalTotal+'</strong><span>'+localPercent+'%</span></div>'
        +'<div class="bs-series-scan-progress-track"><span class="bs-local-progress-fill" style="width:'+localPercent+'%"></span></div>'
        +'<div class="bs-series-scan-progress-head" style="margin-top:12px"><strong>Online records checked: '
        +stats.successful+' / '+stats.total+'</strong><span>'+percent+'%</span></div>'
        +'<div class="bs-series-scan-progress-track"><span style="width:'+percent+'%"></span></div>'
        +'<small>'+stats.pending+' temporarily unavailable · '
        +bsSeriesProposals.length+' proposals waiting for review</small>';
    }
  }
  bsSeriesScan=async function(){
    if(bsSeriesScanBusy)return;
    const btn=document.getElementById('bs-series-scan');
    if(!btn)return;
    bsSeriesScanBusy=true;seriesScanStop=false;btn.disabled=false;
    btn.textContent='■ Stop scanning';
    btn.onclick=()=>{seriesScanStop=true;seriesScanShow('Stopping after the current request…');};
    let localAdded=0,remoteAdded=0,checked=0,errors=0,rateLimited=false;
    try{
      // The entire library can be scanned locally without the API.
      for(const p of bsSeriesLocalProposals()){
        if(bsSeriesAddProposal(p))localAdded++;
      }
      bsSeriesRenderProposals();
      seriesScanShow('Local scan complete: '+localAdded+' new proposals. Checking online catalog availability…');
      if(Date.now()<remotePauseUntil){
        const minutes=Math.max(1,Math.ceil((remotePauseUntil-Date.now())/60000));
        seriesScanShow('Online search temporarily paused for about '+minutes
          +' more minute'+(minutes===1?'':'s')+' due to catalog limits. '
          +'No books will be skipped or counted as checked. Local suggestions are shown below.');
        return;
      }
      const pool=scanCandidates();
      if(!pool.length){
        seriesScanShow('No unmatched books require an online lookup. Local suggestions are ready for review.');
        return;
      }
      const start=((scanCursor%pool.length)+pool.length)%pool.length;
      const queue=[];
      for(let offset=0;offset<pool.length&&queue.length<10;offset++){
        const index=(start+offset)%pool.length;
        if(eligibleForScan(pool[index]))queue.push({book:pool[index],index});
      }
      if(!queue.length){
        seriesScanShow('No eligible books to check right now. Previously checked books are cached; failed books become available after their retry period.');
        return;
      }
      // Limit per-click network load. Never loop over untouched books merely
      // to inflate a "processed" counter.
      for(const {book,index} of queue){
        if(seriesScanStop)break;
        const fingerprint=[book.title,book.author,book.isbn].join('|');
        seriesScanShow('Searching online: '+(checked+errors+1)+' / '+queue.length+' · '+book.title);
        try{
          const result=await seriesLookupGoogleBooks(book);
          if(result&&bsSeriesAddProposal(result))remoteAdded++;
          seriesScanCache[String(book.id)]={fingerprint,checkedAt:Date.now(),proposal:result||null};
          delete scanFailed[String(book.id)];
          seriesScanPersist();
          checked++;
        }catch(error){
          errors++;
          scanFailed[String(book.id)]={fingerprint,retryAfter:Date.now()+30*60000};
          if(error?.message==='RATE_LIMIT'){
            rateLimited=true;
            setRemotePause(Date.now()+30*60000);
          }
        }
        scanCursor=(index+1)%pool.length;
        persistScanQueue();
        bsSeriesRenderProposals();
        if(rateLimited)break;
      }
      const message=rateLimited
        ?'The catalog blocked further requests after '+(checked+errors)+' attempt(s). '
          +'Online scanning is paused for 30 minutes; unvisited books were not counted as checked.'
        :'This run: '+checked+' books checked online, '+remoteAdded+' new online proposals'
          +(errors?', '+errors+' temporarily unavailable':'')+'. '
          +'You can continue with another batch or review suggestions.';
      seriesScanShow(message);
    }catch(error){
      console.error('Series Tracker scan:',error);
      seriesScanShow('The scan stopped because of an unexpected error: '+(error?.message||'unknown error')
        +'. Your books were not changed.');
    }finally{
      bsSeriesScanBusy=false;seriesScanStop=false;
      btn.disabled=false;
      btn.textContent=Date.now()<remotePauseUntil?'✧ Check catalog availability':'✧ Scan next books';
      btn.onclick=()=>bsSeriesScan();
    }
  };
  const scanLabel=document.getElementById('bs-series-scan-status');
  if(scanLabel)scanLabel.textContent='Checks 20 books per batch without stopping on one failed catalog request. Online sources are rate-limited; local matches work immediately.';
  const scanButton=document.getElementById('bs-series-scan');
  if(scanButton)scanButton.textContent='✧ Scan next books';
  seriesScanShow('Ready to scan. Local series are detected instantly; the online catalog may temporarily limit requests.');

  // Visible v7 diagnostics and full local scan, independent of catalog limits.
  // Only suggestions are collected; no saved book is modified.
  const seriesDiscoveryRoot=document.querySelector('.bs-series-discovery');
  const seriesDiscoveryActions=document.querySelector('.bs-series-discover-actions');
  const onlineScanButton=document.getElementById('bs-series-scan');
  if(seriesDiscoveryRoot&&seriesDiscoveryActions&&onlineScanButton){
    const version=document.createElement('div');
    version.className='bs-scan-version';
    version.textContent='Series discovery v8 · separate local and online progress';
    seriesDiscoveryActions.prepend(version);
    const localButton=document.createElement('button');
    localButton.type='button';localButton.className='secondary bs-local-scan';
    localButton.textContent='♡ Analyze my entire library locally';
    localButton.onclick=()=>{
      localButton.disabled=true;
      try{
        const before=bsSeriesProposals.length;
        const missing=books.filter(b=>b?.title&&!String(b.series||'').trim());
        bsLocalTotal=missing.length;
        bsLocalChecked=0;
        seriesScanShow('Analyzing '+missing.length+' books using saved book details…');
        let found=0;
        for(const b of missing){
          const result=verifiedSeriesProposal(b)||matchingLocalSeries(b)
            ||seriesDirectTitle(b)||bsSeriesExplicitTitle(b.title)
            ||seriesFromDescription(b);
          if(result&&bsSeriesAddProposal(result))found++;
          bsLocalChecked++;
        }
        bsSeriesRenderProposals();
        seriesScanShow('Local analysis finished: '+missing.length+' books without a series field considered; '
          +found+' new suggestions. No internet requests were needed. '
          +'Unrecognized books need more reliable external series metadata.');
        if(!found&&before===bsSeriesProposals.length){
          seriesScanShow('Local analysis finished: '+missing.length+' books checked, no new matches. '
            +'This does not mean they are standalone books; their metadata is incomplete. '
            +'Online lookup is a separate step and may be temporarily rate-limited.');
        }
      }catch(error){
        console.error('Local series discovery',error);
        seriesScanShow('Local discovery failed: '+(error?.message||'unknown error'));
      }finally{localButton.disabled=false;}
    };
    onlineScanButton.parentNode.insertBefore(localButton,onlineScanButton);
    // Ensure the original online button always gives a visible explanation
    // when the remote catalog cooldown is still active.
    const originalOnlineScan=bsSeriesScan;
    bsSeriesScan=async function(){
      if(Date.now()<remotePauseUntil){
        const minutes=Math.max(1,Math.ceil((remotePauseUntil-Date.now())/60000));
        seriesScanShow('Online catalog cooldown: approximately '+minutes+' min remaining. '
          +'The remote search cannot run yet. You can use “Analyze my entire library locally” now.');
        return;
      }
      return originalOnlineScan();
    };
    onlineScanButton.onclick=()=>bsSeriesScan();
    onlineScanButton.textContent='⌕ Check online for series';
    const originalShow=seriesScanShow;
    // The visible version label proves which script actually executed.
    bsLocalTotal=books.filter(b=>b?.title&&!String(b.series||'').trim()).length;
    seriesScanShow('Version 8 loaded. Run the local scan to fill its progress bar. Online scanning is separately limited by the catalog.');
  }
  const css=document.createElement('style');
  css.textContent='.bs-series-gap{margin:10px 0 12px;padding:10px 13px;border:1px solid #f3e1bd;background:#fffbf0;border-radius:12px;color:#84683d;font-size:12px;line-height:1.6}.bs-series-gap small{display:block;color:#938573;font-size:11px}.bs-series-gap span{color:#d7a65d}.bs-series-card-info h3{overflow-wrap:anywhere}.bs-scan-version{font-size:11px;letter-spacing:.04em;color:#7394a8;font-weight:700;padding:5px 0}.bs-local-scan{margin-right:8px}.bs-series-scan-progress{width:100%;margin:12px 0 0;font-size:12px;color:#6d91a8}.bs-series-scan-progress-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:7px}.bs-series-scan-progress-track{height:8px;background:#e7eef3;border-radius:99px;overflow:hidden}.bs-series-scan-progress-track span{display:block;height:100%;background:#8cafc8;border-radius:99px}.bs-series-scan-progress small{display:block;margin-top:7px}.bs-local-progress-fill{background:#a6cdb6!important}';
  document.head.appendChild(css);

})();