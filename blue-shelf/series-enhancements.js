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
  const css=document.createElement('style');
  css.textContent='.bs-series-gap{margin:10px 0 12px;padding:10px 13px;border:1px solid #f3e1bd;background:#fffbf0;border-radius:12px;color:#84683d;font-size:12px;line-height:1.6}.bs-series-gap small{display:block;color:#938573;font-size:11px}.bs-series-gap span{color:#d7a65d}.bs-series-card-info h3{overflow-wrap:anywhere}';
  document.head.appendChild(css);
  const label=document.getElementById('bs-series-scan-status');
  if(label)label.textContent='Checks up to 25 books at a time. Suggestions are saved only after your approval.';
})();