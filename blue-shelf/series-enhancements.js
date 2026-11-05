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
  async function seriesLookupOpenLibrary(book){
    const isbn=seriesISBN(book);
    const queries=[];
    if(isbn)queries.push({isbn,limit:'3',fields:'key,title,author_name,edition_key'});
    if(book.author)queries.push({title:bsSeriesTitleParts(book.title),author:book.author,
       limit:'5',fields:'key,title,author_name,edition_key'});
    const seen=new Set();
    let failed=false;
    for(const params of queries){
      const data=await seriesGetJSON('https://openlibrary.org/search.json?'+new URLSearchParams(params));
      for(const doc of (Array.isArray(data.docs)?data.docs:[])){
        if(!seriesSameTitle(book.title,doc.title)||!seriesAuthorMatch(book,doc.author_name))continue;
        const inline=seriesEditionTitle(book,doc.title);
        if(inline)return inline;
        const keys=Array.isArray(doc.edition_key)?doc.edition_key.slice(0,6):[];
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
    const direct=seriesDirectTitle(book)||bsSeriesExplicitTitle(book.title);
    if(direct)return {...direct,id:book.id,title:book.title};
    let error=null;
    try{
      const proposal=await seriesLookupOpenLibrary(book);
      if(proposal)return proposal;
    }catch(e){error=e;if(e.message==='RATE_LIMIT')throw e;}
    try{
      const proposal=await seriesLookupGoogleBooks(book);
      if(proposal)return proposal;
    }catch(e){error=e;if(e.message==='RATE_LIMIT')throw e;}
    if(error)throw error;
    return null;
  };
  // Include annotated series in the local (no-network) pass.
  const oldLocalProposals=bsSeriesLocalProposals;
  bsSeriesLocalProposals=function(){
    const result=oldLocalProposals(),seen=new Set(result.map(x=>x.id));
    for(const b of books){
      if(!b?.title||String(b.series||'').trim()||seen.has(b.id))continue;
      const value=seriesDirectTitle(b);
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
      &&!bsSeriesExplicitTitle(b.title)&&!seriesDirectTitle(b));
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
  const retryMinutes=30;
  bsSeriesScan=async function(){
    if(bsSeriesScanBusy)return;
    const btn=document.getElementById('bs-series-scan');
    const status=document.getElementById('bs-series-scan-status');
    if(!btn||!status)return;
    bsSeriesScanBusy=true;seriesScanStop=false;
    btn.textContent='■ Stop scanning';btn.disabled=false;
    btn.onclick=()=>{seriesScanStop=true;status.textContent='Stopping after the current lookup…';};
    let localAdded=0,remoteFound=0,failed=0,rateLimited=false,checked=0,attempted=0;
    try{
      for(const suggestion of bsSeriesLocalProposals())
        if(bsSeriesAddProposal(suggestion))localAdded++;
      const pool=scanCandidates();
      // Rotate through the *whole* catalog in stable library order.
      // Advance before network calls so even a first-request 429 cannot restart
      // from the same position on the next click.
      const start=pool.length?((scanCursor%pool.length)+pool.length)%pool.length:0;
      const candidates=[];
      for(let offset=0;offset<pool.length&&candidates.length<20;offset++){
        const index=(start+offset)%pool.length;
        if(eligibleForScan(pool[index]))candidates.push({book:pool[index],index});
      }
      if(!candidates.length){
        const pending=Object.values(scanFailed).filter(x=>x?.retryAfter>Date.now());
        const waiting=pending.length?' '+pending.length+' failed lookups are temporarily paused.':'';
        status.textContent='Nothing new to check right now.'+waiting+' Already checked books are cached for 14 days.';
        bsSeriesRenderProposals();return;
      }
      scanCursor=(candidates[candidates.length-1].index+1)%pool.length;
      persistScanQueue();
      for(const {book:b} of candidates){
        if(seriesScanStop)break;
        attempted++;
        status.textContent='Checking book '+attempted+' of '+candidates.length+
          ': '+b.title+' · '+bsSeriesProposals.length+' suggestions';
        const key=String(b.id);
        const fingerprint=[b.title,b.author,b.isbn].join('|');
        try{
          const proposal=await bsSeriesFetchSuggestion(b);
          checked++;
          if(proposal&&bsSeriesAddProposal(proposal))remoteFound++;
          seriesScanCache[key]={fingerprint,checkedAt:Date.now(),proposal:proposal||null};
          delete scanFailed[key];
          seriesScanPersist();
        }catch(e){
          failed++;
          scanFailed[key]={fingerprint,retryAfter:Date.now()+retryMinutes*60*1000};
          if(e?.message==='RATE_LIMIT'){rateLimited=true;}
          // Do not hit a throttled catalog again in this click.
          persistScanQueue();
          if(rateLimited)break;
        }
        persistScanQueue();
        bsSeriesRenderProposals();
      }
      const completed=Object.keys(seriesScanCache).filter(k=>
        seriesScanCache[k]?.checkedAt&&Date.now()-seriesScanCache[k].checkedAt<14*24*60*60*1000).length;
      status.textContent='Processed '+attempted+' requests · '+checked+' successfully checked · '
        +(localAdded+remoteFound)+' new suggestions · '+completed+' results cached on this device. '
        +(rateLimited?'Catalog rate limit: this book will be retried later, and the next scan starts further along the library. '
          :failed?failed+' failed lookups postponed for '+retryMinutes+' minutes. ':'')
        +(seriesScanStop?'Stopped. ':'')+'Review suggestions before saving.';
      bsSeriesRenderProposals();
    }finally{
      seriesScanStop=false;bsSeriesScanBusy=false;
      btn.textContent='✧ Scan next books';btn.onclick=()=>bsSeriesScan();btn.disabled=false;
    }
  };
  const scanLabel=document.getElementById('bs-series-scan-status');
  if(scanLabel)scanLabel.textContent='Scans up to 20 new books per batch. Failed lookups are postponed, and the next batch continues elsewhere in your library.';
  const scanButton=document.getElementById('bs-series-scan');
  if(scanButton)scanButton.textContent='✧ Scan next books';
  const css=document.createElement('style');
  css.textContent='.bs-series-gap{margin:10px 0 12px;padding:10px 13px;border:1px solid #f3e1bd;background:#fffbf0;border-radius:12px;color:#84683d;font-size:12px;line-height:1.6}.bs-series-gap small{display:block;color:#938573;font-size:11px}.bs-series-gap span{color:#d7a65d}.bs-series-card-info h3{overflow-wrap:anywhere}';
  document.head.appendChild(css);
  const label=document.getElementById('bs-series-scan-status');
  if(label)label.textContent='Checks up to 25 books at a time. Suggestions are saved only after your approval.';
})();