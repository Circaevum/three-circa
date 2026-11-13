/* Work is a compact projection of VEVENTs and the same selected time as the GL. */
(function () {
  const M = window.WorkTimeline, KEY = 'circaevum.work-example.v3';
  const ZOOMS = { hour:[0,1/24],day:[8,1],clock:[9,1],week:[7,7],month:[5,31],quarter:[4,92],year:[3,366] };
  const MODE_COLORS = {basic:'#9aa3ad',health:'#e11d48',work:'#2563eb',financial:'#16a34a'};
  const SLEEP_COLOR = '#8b5cf6';
  const STATUS_ICONS = {done:'✓',blocked:'!',cancelled:'×',waiting:'…'};
  let demo=M.seed(), workSupplied=null, supplied=null, source='example', project='', selected=null, zoom='month', compact=true, connect=false;
  let githubDelivery=null;
  let reviewColors=null,reviewWork=[],reviewShowEmpty=false;
  let collectionId='', collectionLabel='', laneRank=null, selectedMode='basic', selectedLayerNames=[];
  let start=+new Date(2026,10,1), span=31*M.DAY, context=null, focus=start+span/2, opened=false, returnFocus;
  let draw=null, routeDrag=null, linkStart=null, saving=false, notice='', accessMessage='', syncTimer, rendering=false, pushing=false, initialized=false;
  let selectedLink=null, queuedPan=0, panFrame=null, showWorkflow=false, panelMode='timeline', expanded=false, suppressPortClickUntil=0, forcedLeft=false, kept=new Set();
  let laneMoveId='',fetchedLaneEvents=[],laneRequestKey='',laneRequestId='',laneLoading=false,laneError='',unavailableLanes=new Set(),laneAnchors={open:false,rows:[]};
  const positions=new Map(), pending=new Map();
  const workMarkerIcons={Research:'⚗',Development:'⌘',Delivery:'◆'};
  const isProjectMarker=item=>collectionId==='linked-project'&&item.kind==='milestone'&&workLaneOrder.has(item.lane);
  let canCreateProjectMarker=false;
  const workLaneOrder=new Map(['Research','Development','Delivery'].map((name,index)=>[name,index]));
  const appLayout=()=>window.circaevumHostLayout?.managed===true;
  const modeEnabled=mode=>!appLayout()||!window.circaevumHostLayout?.modes||window.circaevumHostLayout.modes[mode||'basic']===true;
  try {const saved=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(saved)&&saved.every(e=>M.normalize(e)))demo=saved;}catch(_){}
  const gl=()=>window.circaevumGL||window.getGL?.();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  const localDate=t=>new Date(t-new Date(t).getTimezoneOffset()*60000).toISOString().slice(0,10);
  const localTime=t=>new Date(t-new Date(t).getTimezoneOffset()*60000).toISOString().slice(0,16);
  const parentSend=payload=>{if(window.parent!==window)window.parent.postMessage(payload,'*');};
  const host=document.createElement('section');host.id='swim-lanes';host.hidden=true;host.setAttribute('aria-label','Swim Lanes bottom panel');
  document.getElementById('xr-ui-layer').append(host);
  const eventPanel=document.getElementById('event-list-panel');
  const panelTabs=document.createElement('div');panelTabs.className='sl-panel-tabs';panelTabs.setAttribute('role','tablist');panelTabs.setAttribute('aria-label','Events panel mode');
  panelTabs.innerHTML='<button role="tab" data-action="panel-timeline" aria-selected="true">Event list</button><button role="tab" data-action="panel-event" aria-selected="false">Event</button>';
  const panelHeader=eventPanel.querySelector('.event-list-panel-header');
  panelHeader.insertBefore(panelTabs,document.getElementById('event-list-close'));
  const contextHeader=document.getElementById('event-list-horizon-ring-row');if(contextHeader)panelHeader.insertBefore(contextHeader,document.getElementById('event-list-close'));
  const eventMode=document.createElement('div');eventMode.id='sl-event-mode';eventMode.hidden=true;eventMode.innerHTML='<div id="sl-detail" role="tabpanel" aria-label="Event details"></div>';eventPanel.append(eventMode);
  const sceneDetail=document.createElement('div');sceneDetail.id='sl-scene-detail';sceneDetail.hidden=true;eventMode.append(sceneDetail);
  window.openSceneEventPanel=function(content){
    selected=null;panelMode='event';sceneDetail.replaceChildren(content);sceneDetail.hidden=false;
    eventMode.querySelector('#sl-detail').hidden=true;syncPanel(true);
  };
  window.closeSceneEventPanel=function(){sceneDetail.hidden=true;eventMode.querySelector('#sl-detail').hidden=false;panelMode='timeline';syncPanel();};
  function syncPanel(open=false){
    const active=panelMode==='event';eventPanel.classList.toggle('sl-event-active',active);eventMode.hidden=!active;
    panelTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String((b.dataset.action==='panel-event')===active)));
    if(open)window.openEventListPanel?.();
  }
  const leftPanel=document.getElementById('calendars-left-panel');
  const rail=document.createElement('div');rail.id='sl-title-rail';rail.hidden=true;rail.setAttribute('aria-label','Swim lane titles');
  const railInner=document.createElement('div');railInner.id='sl-title-rail-inner';rail.append(railInner);
  const side=document.createElement('div');side.id='sl-side';side.hidden=true;
  leftPanel?.querySelector('.left-panel-body')?.append(side);
  leftPanel?.append(rail);
  const bar=document.createElement('nav');bar.className='swim-lanes-menu';bar.setAttribute('aria-label','Calendar bottom menu');
  bar.innerHTML='<button type="button" aria-controls="swim-lanes" aria-expanded="false" aria-label="Open Swim Lanes">Swim Lanes</button>';
  document.getElementById('xr-ui-layer').append(bar);
  function loaded(){if(supplied!==null)return reviewColors
    ? supplied.concat(window.CalendarLaneEvents.projectFetched(reviewWork,['Work'],collectionLabel)) : supplied;const result=[];gl()?.events?.forEach((events,id)=>{if(gl().layers.get(id)?.visible!==false)result.push(...events);});return result;}
  function items(){const map=new Map();(source==='example'?demo:loaded()).forEach(e=>{const n=M.normalize(e);if(n?.id)map.set(n.id,n);});return [...map.values()];}
  function rows(){
    const all=items();
    if(collectionId==='linked-project'||reviewColors)return all.filter(e=>e.project===project);
    if(!all.some(e=>e.project===project))project=all[0]?.project||'';
    return all.filter(e=>e.project===project);
  }
  function writable(item){return source==='example'||item?.access?.canWrite===true;}
  function showLeft(){
    if(appLayout())return false;
    if(!leftPanel)return false;
    if(!leftPanel.classList.contains('open')){
      forcedLeft=true;
      leftPanel.classList.add('open');
      leftPanel.setAttribute('aria-hidden','false');
      document.body.classList.add('calendars-left-panel-open');
      const tab=document.getElementById('calendar-layers-pull-tab');
      tab?.setAttribute('aria-expanded','true');
      tab?.setAttribute('aria-label','Close Layers');
      window.refreshCalendarLayersList?.();
    }
    leftPanel.classList.add('sl-sheet');
    document.documentElement.style.setProperty('--sl-rail',(leftPanel.offsetWidth||260)+'px');
    return true;
  }
  function hideLeftIfForced(){
    if(!leftPanel)return;
    leftPanel.classList.remove('sl-sheet');
    document.body.classList.remove('sl-layers-open');
    if(!forcedLeft)return;
    forcedLeft=false;
    leftPanel.classList.remove('open');
    leftPanel.setAttribute('aria-hidden','true');
    document.body.classList.remove('calendars-left-panel-open');
    const tab=document.getElementById('calendar-layers-pull-tab');
    tab?.setAttribute('aria-expanded','false');
    tab?.setAttribute('aria-label','Open Layers');
    if(leftPanel){leftPanel.style.top='';leftPanel.style.bottom='';leftPanel.style.height='';}
    const body=leftPanel?.querySelector('.left-panel-body');
    if(body)body.style.paddingBottom='';
  }
  function placeRail(){
    const board=host.querySelector('.sl-board-scroll');
    const body=leftPanel?.querySelector('.left-panel-body');
    rail.hidden=true;
    if(appLayout()||!opened||!host.classList.contains('sl-docked')||!leftPanel||!board){
      side.hidden=true;side.style.position='';side.style.bottom='';side.style.height='';
      if(leftPanel){leftPanel.style.top='';leftPanel.style.bottom='';leftPanel.style.height='';}
      if(body)body.style.paddingBottom='';
      return;
    }
    side.hidden=false;
    document.documentElement.style.setProperty('--sl-rail',leftPanel.offsetWidth+'px');
    const boardRect=board.getBoundingClientRect();
    if(document.body.classList.contains('sl-layers-open')){
      leftPanel.style.top='';leftPanel.style.bottom='0px';leftPanel.style.height='';
      const panelRect=leftPanel.getBoundingClientRect();
      const lift=Math.max(0,panelRect.bottom-boardRect.bottom);
      side.style.position='absolute';side.style.left='0';side.style.right='0';side.style.bottom=lift+'px';side.style.height=boardRect.height+'px';
      if(body)body.style.paddingBottom=(lift+boardRect.height)+'px';
    }else{
      side.style.position='';side.style.bottom='';side.style.height='';
      if(body)body.style.paddingBottom='';
      leftPanel.style.top='auto';
      leftPanel.style.height=boardRect.height+'px';
      leftPanel.style.bottom=Math.max(0,window.innerHeight-boardRect.bottom)+'px';
      side.style.height=boardRect.height+'px';
    }
    side.scrollTop=board.scrollTop;
  }
  function hotRow(key){
    host.querySelectorAll('.sl-hot').forEach(n=>n.classList.remove('sl-hot'));
    side.querySelectorAll('.sl-hot').forEach(n=>n.classList.remove('sl-hot'));
    if(!key)return;
    host.querySelectorAll(`[data-row="${key}"]`).forEach(n=>n.classList.add('sl-hot'));
    side.querySelectorAll(`[data-row="${key}"]`).forEach(n=>n.classList.add('sl-hot'));
  }
  function setOpen(value){
    if(value){returnFocus=document.activeElement;if(!opened&&selectedMode==='basic'&&!reviewColors)expanded=true;}
    opened=value;host.hidden=!value;document.body.classList.toggle('swim-lanes-open',value);
    bar.querySelector('button').setAttribute('aria-expanded',String(value));bar.hidden=value;
    if(value){showLeft();if(initialized)readContext(true);render();host.querySelector('.sl-bar')?.focus?.();}
    else{hideLeftIfForced();placeRail();returnFocus?.focus?.();}
    window.dispatchEvent(new CustomEvent('circaevum:lanes-layout'));
    const url=new URL(location.href);if(value)url.searchParams.set('workView','swim-lanes');else url.searchParams.delete('workView');history.replaceState(null,'',url);
  }
  window.openSwimLanes=()=>setOpen(true);
  function reopenSwimLanes(){const mode=document.body.dataset.mode||'basic';if(appLayout()&&(!collectionId||!modeEnabled(selectedMode)||selectedMode!==mode))window.openSwimCollection(mode);else setOpen(true);}
  bar.addEventListener('click',reopenSwimLanes);
  document.querySelector('[data-open-swim-lanes]')?.addEventListener('click',()=>setOpen(true));
  document.getElementById('calendars-left-close')?.addEventListener('click',()=>{if(opened)requestAnimationFrame(render);});
  document.getElementById('calendar-layers-pull-tab')?.addEventListener('click',()=>{if(opened)requestAnimationFrame(()=>requestAnimationFrame(render));});
  function fit(){const r=rows();if(!r.length)return;const lo=Math.min(...r.map(e=>e.start)),hi=Math.max(...r.map(e=>e.end));span=Math.max(7*M.DAY,hi-lo+2*M.DAY);start=lo-M.DAY;zoom=span<=9*M.DAY?'week':span<=40*M.DAY?'month':span<=110*M.DAY?'quarter':'year';changedTime();}
  function zoomName(level){
    const hit=Object.keys(ZOOMS).find(k=>ZOOMS[k][0]===level);
    if(hit)return hit;
    if(level===6)return 'month';
    return 'year';
  }
  function windowFromPayload(payload){
    if (payload?.zoom === 8 || payload?.zoom === 9) {
      const day = M.localDayWindow(payload.focus);
      if (day) return day;
    }
    const arc=payload&&payload.contextArc;
    if(arc&&Number.isFinite(arc.t0)&&Number.isFinite(arc.t1)&&arc.t1>arc.t0)return {start:arc.t0,span:arc.t1-arc.t0,context:arc};
    const name=zoomName(payload&&payload.zoom);
    const width=ZOOMS[name][1]*M.DAY;
    const at=Date.parse(payload&&payload.focus);
    const center=Number.isFinite(at)?at:focus;
    return {start:center-width/2,span:width,context:null};
  }
  function readContext(recenter=false){
    if(pushing)return;
    let payload;try{payload=window.getEmbedContextArcPayload?.();}catch(_){return;}if(!payload?.focus)return;
    initialized=true;
    const next=Date.parse(payload.focus);if(!Number.isFinite(next))return;
    const mapped=zoomName(payload.zoom);
    const win=windowFromPayload(payload);
    const changed=next!==focus||mapped!==zoom||win.start!==start||Math.abs(win.span-span)>1000;
    if(!changed&&!recenter)return;
    context=win.context;focus=next;zoom=mapped;start=win.start;span=win.span;
    if(opened&&!rendering)render();
  }
  function changedTime(){
    focus=start+span/2;clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{
      const viewer=gl();if(!viewer)return;
      pushing=true;
      try {
        if(Number(window.currentZoom)!==ZOOMS[zoom][0])viewer.setZoomLevel(ZOOMS[zoom][0]);
        viewer.navigateToTime(new Date(focus));
        const payload=window.getEmbedContextArcPayload?.();
        const win=windowFromPayload(payload);
        start=win.start;span=win.span;context=win.context;
        const at=Date.parse(payload&&payload.focus);
        if(Number.isFinite(at))focus=at;
        zoom=zoomName(window.currentZoom);
        initialized=true;
      }finally{pushing=false;}
      if(opened)render();
    },120);
  }
  // Horizontal tangents keep dependency direction readable while routing stays snappable.
  function curve(x1,y1,x2,y2,bend=(x1+x2)/2){
    const reach=Math.max(24,Math.abs(x2-x1)*.45);
    const c1=x2>=x1?Math.max(x1,Math.min(x2,bend)):x1+reach;
    const c2=x2>=x1?c1:x2-reach;
    return `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`;
  }
  function pct(t){return Math.max(0,Math.min(100,(t-start)/span*100));}
  function requestLaneData(force=false,refreshGarmin=false){
    if(!appLayout()||collectionId!=='layers'||!selectedLayerNames.length||!opened)return;
    const key=JSON.stringify([selectedLayerNames,start,span]);if(!force&&key===laneRequestKey)return;
    laneRequestKey=key;laneRequestId=crypto.randomUUID();laneLoading=true;laneError='';unavailableLanes.clear();
    parentSend({type:'CIRCAEVUM_FETCH_LANES',requestId:laneRequestId,names:selectedLayerNames,t0:start,t1:start+span,review:!!reviewColors,refreshGarmin});
  }
  function alignLaneRows(){
    const attached=opened&&!reviewColors&&selectedMode==='basic'&&collectionId==='layers'&&laneAnchors.open&&!document.body.classList.contains('interface-depth');
    const switching=host.classList.contains('sl-row-attached')!==attached;
    const oldRects=switching?new Map([...host.querySelectorAll('.sl-lane')].map(row=>[row,row.getBoundingClientRect()])):null;
    if(switching){host.classList.add('sl-transitioning');clearTimeout(host._motionTimer);host._motionTimer=setTimeout(()=>host.classList.remove('sl-transitioning'),340);}
    host.classList.toggle('sl-row-attached',attached);
    host.style.setProperty('--lane-anchor-left',(laneAnchors.left||352)+'px');
    const visibleAnchors=laneAnchors.rows.filter(a=>selectedLayerNames.includes(a.name)&&a.top+a.height>100&&a.top<innerHeight);
    host.style.setProperty('--lane-toolbar-top',Math.max(0,(visibleAnchors.length?Math.min(...visibleAnchors.map(a=>a.top)):126)-126)+'px');
    for(const row of host.querySelectorAll('.sl-lane')){
      const anchor=laneAnchors.rows.find(a=>window.CalendarLaneEvents.label(a.name)===row.dataset.dropLane);
      const visible=!attached||(anchor&&anchor.top+anchor.height>100&&anchor.top<innerHeight);
      row.style.visibility=visible?'':'hidden';
      if(attached&&anchor)row.style.top=(anchor.top-56)+'px';else row.style.top='';
      if(switching&&visible&&row.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const before=oldRects.get(row),after=row.getBoundingClientRect();if(before&&after.width)row.animate([{transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scaleX(${before.width/after.width})`},{transform:'none'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});}
    }
    window.dispatchEvent(new CustomEvent('circaevum:lanes-layout'));
  }
  function laneColor(lane){
    if (reviewColors?.has(lane)) return reviewColors.get(lane);
    if(selectedMode==='health'&&/^(garmin )?sleep$/i.test(lane))return SLEEP_COLOR;
    return MODE_COLORS[selectedMode]||MODE_COLORS.basic;
  }

  function githubMarker(kind){
    const glyph=kind==='commits'
      ? '<path d="M1 10h5m8 0h5"/><circle cx="10" cy="10" r="4"/>'
      : kind==='force-push'
        ? '<path d="m4 5 5 5-5 5m8-10 5 5-5 5"/>'
        : '<path d="M2 10h15m-6-5 6 5-6 5"/>';
    return `<svg class="sl-github-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;
  }
  function githubDeliveryStatus(list){
    if(collectionId!=='linked-project'||!githubDelivery)return '';
    const counts=githubDelivery.counts||{};
    const summary=githubDelivery.loading?'Loading GitHub activity…':`
      <span>${githubMarker('commits')}${counts.commits==null?'Commits unavailable':esc(counts.commits)+' commits'}</span>
      <span>${githubMarker('pushes')}${counts.pushes==null?'Pushes unavailable':esc(counts.pushes)+' recent pushes'}</span>`;
    const hasActivity=list.some(item=>item.event.githubActivity);
    return `<div class="sl-notice sl-actions"><span class="sl-github-summary" role="status">GitHub · ${summary}</span>
      ${hasActivity?'<button data-action="github-latest">Go to latest GitHub activity</button>':''}
      <button data-action="github-refresh" ${githubDelivery.loading?'disabled':''}>Refresh GitHub</button></div>`;
  }
  function render(){
    if(!opened)return;requestLaneData();rendering=true;host.classList.toggle('sl-review',!!reviewColors);host.classList.toggle('sl-expanded',expanded);host.classList.toggle('sl-basic-full',selectedMode==='basic'&&expanded);
    const docked=appLayout()||!!leftPanel?.classList.contains('open');
    host.classList.toggle('sl-docked',docked);
    const namesInBoard=appLayout()||!docked||!leftPanel?.classList.contains('open');
    host.classList.toggle('sl-named',docked&&namesInBoard);
    const oldBoard=host.querySelector('.sl-board-scroll');
    const scrollTop=oldBoard?.scrollTop||0, scrollLeft=oldBoard?.scrollLeft||0;
    const all=items(), list=rows(), end=start+span, projects=[...new Set(all.map(e=>e.project))];
    const fullDay=zoom==='day'||zoom==='clock';
    const heartLayer=reviewColors?'Heart':'Garmin Activity';
    const overlayHeart=(reviewColors||selectedMode==='health')&&collectionId==='layers'&&selectedLayerNames.includes(heartLayer);
    const heartItems=overlayHeart?list.filter(item=>item.event.render?.metric==='hr'):[];
    const heartTrace=window.CalendarLaneEvents.heartTrace(heartItems,start,end);
    const laneItems=overlayHeart?list.filter(item=>item.lane!=='Heart'):list;
    const dayLabel=fullDay ? new Date(start).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) : '';
    const dateWindow=dayLabel || `${fmt(start)} – ${fmt(end)}`;
    const localZone=new Intl.DateTimeFormat(undefined,{timeZoneName:'short'}).formatToParts(new Date(start))
      .find(part=>part.type==='timeZoneName')?.value || '';
    const dayControls='<button data-action="prev" aria-label="Previous day">←</button><button data-action="today">Today</button><button data-action="next" aria-label="Next day">→</button>';
    const toolBits=`<label class="sl-sr">Source<select id="sl-source"><option value="example" ${source==='example'?'selected':''}>OpenAMI / ISV example</option><option value="loaded" ${source==='loaded'?'selected':''}>My & shared work layers</option></select></label>
      ${projects.length>1?`<label class="sl-sr">Project<select id="sl-project">${projects.map(p=>`<option value="${esc(p)}" ${p===project?'selected':''}>${esc(p)}</option>`).join('')}</select></label>`:''}
      <button data-action="prev" aria-label="Earlier">←</button><button data-action="today">Today</button><button data-action="next" aria-label="Later">→</button>
      <label class="sl-sr">Zoom<select id="sl-zoom">${Object.keys(ZOOMS).map(k=>`<option value="${k}" ${zoom===k?'selected':''}>${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></label>
      <label class="sl-sr">Go to date<input id="sl-date" type="date" value="${localDate(focus)}"></label>
      <button data-action="fit">Fit</button><button data-action="density" aria-pressed="${compact}">${compact?'Compact':'Comfortable'}</button>
      ${source==='example'?'<button data-action="new">+ Item</button>':'<button data-action="refresh">Refresh</button>'}
      `;
    const chrome=`<header class="sl-head"><div><span class="sl-kicker">Circaevum / Work</span><h1 tabindex="-1">Swim Lanes</h1></div><div class="sl-actions"><button class="sl-minimize" data-action="close" aria-label="Minimize Swim Lanes" title="Minimize">−</button></div></header>
      <div class="sl-tools">${toolBits}</div>
      ${showWorkflow?`<div class="sl-workflow-legend">${Object.entries(M.workflows).map(([, [label,icon]])=>`<span style="--workflow:var(--mode-rgb,37,99,235)">${icon} ${label}</span>`).join('')}</div>`:''}
      <div class="sl-caption"><span>${fmt(start)} – ${fmt(end)} ${new Date(focus).getFullYear()} · ${list.length} items</span></div>
      <p class="sl-notice" role="status">${esc(notice||accessMessage||'')}</p>`;
    const healthStatus=(selectedMode==='health'||reviewColors||unavailableLanes.size)?`<p class="sl-health-status" role="status" aria-live="polite">${laneLoading?'<span class="sl-loading-spinner"></span> Loading Health events…':laneError?'Health data could not load. Retry below.':`${list.length} events loaded for ${esc(dateWindow)}`}${unavailableLanes.size?` · Couldn’t fully load ${esc([...unavailableLanes].join(', '))}. <button data-action="retry-lanes">Retry</button>`:''}</p>`:'';
    const dockChrome=(collectionId
      ? `<div class="sl-bar" tabindex="-1"><strong>${esc(collectionLabel)}</strong>${reviewColors?`${dayControls}<button data-action="review-empty" aria-pressed="${reviewShowEmpty}">${reviewShowEmpty?'Hide empty lanes':'Show empty lanes'}</button><small>Powered by Garmin Connect™</small>`:overlayHeart&&fullDay?dayControls:selectedMode==='basic'?`<button data-action="basic-size" ${expanded&&!kept.size?'disabled':''}>${expanded?'Show selected ('+kept.size+'/3)':'Choose lanes'}</button>`:''}<button class="sl-minimize" data-action="close" aria-label="Minimize Swim Lanes" title="Minimize">−</button></div>`
      : `<div class="sl-bar" tabindex="-1">${toolBits}<button class="sl-minimize" data-action="close" aria-label="Minimize Swim Lanes" title="Minimize">−</button></div>`)
      + (showWorkflow?`<div class="sl-workflow-legend">${Object.entries(M.workflows).map(([, [label,icon]])=>`<span style="--workflow:var(--mode-rgb,37,99,235)">${icon} ${label}</span>`).join('')}</div>`:'')
      + (overlayHeart&&!laneLoading&&!laneError?`<p class="sl-heart-legend">${heartTrace.length
        ? `<span aria-hidden="true"></span> Heart rate · ${esc(localZone)}`
        : unavailableLanes.has('Heart')?'Heart rate unavailable':'No heart-rate samples in this time window'}</p>`:'')
      + (notice||accessMessage?`<p class="sl-notice" role="status">${esc(notice||accessMessage)}</p>`:'');
    const board=`<div class="sl-layout"><div class="sl-board-scroll" aria-label="Project timeline"><div class="sl-board ${compact?'sl-compact':''}"><div class="sl-axis">${namesInBoard?`<div class="sl-label">${esc(dayLabel || 'Lanes')}</div>`:''}<div class="sl-track sl-axis-track"></div></div><div id="sl-rows"></div></div></div></div>`;
    if(docked){side.hidden=namesInBoard;host.innerHTML=`<div class="sl-frozen-head">${dockChrome}${healthStatus}${githubDeliveryStatus(list)}</div>${board}`;}
    else{side.hidden=true;side.innerHTML='';host.innerHTML=`<div class="sl-frozen-head"><button class="sl-drawer-grip" data-action="expand" aria-label="${expanded?'Reduce':'Expand'} Swim Lanes" aria-expanded="${expanded}"><span></span></button>${chrome}${githubDeliveryStatus(list)}</div>${board}`;}
    const weekends=[];
    const day=new Date(start);day.setHours(0,0,0,0);
    while(+day<end){const a=+day,d=day.getDay();day.setDate(day.getDate()+1);if(d===0||d===6)weekends.push(`<span class="sl-weekend" style="left:${pct(a)}%;width:${pct(+day)-pct(a)}%" aria-hidden="true"></span>`);}
    const weekendMarkup=weekends.join('');
    const ticks=M.ticks(start,end,fullDay?'day':zoom);host.querySelector('.sl-axis-track').innerHTML=weekendMarkup+ticks.map(t=>`<button class="sl-tick" data-time="${t}" style="left:${pct(t)}%">${fullDay?new Date(t).toLocaleTimeString(undefined,{hour:'numeric'}):zoom==='hour'?new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):fmt(t)}</button>`).join('');
    const groups=new Map();laneItems.forEach(e=>{const key=collectionId==='linked-project'?e.lane:window.CalendarLaneEvents.rowKey(e,collectionId);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);});
    if(collectionId==='layers')for(const name of selectedLayerNames){if(overlayHeart&&name===heartLayer)continue;const lane=window.CalendarLaneEvents.label(name);if(reviewColors&&!reviewShowEmpty&&!['Fitness','Work','Sleep'].includes(lane)&&!unavailableLanes.has(lane))continue;if(![...groups.values()].some(items=>items[0]?.lane===lane))groups.set(JSON.stringify(['','',project,lane]),[]);}
    if(collectionId==='linked-project')for(const lane of ['Attached calendars',...workLaneOrder.keys()])if(!groups.has(lane))groups.set(lane,[]);
    const rowLane=([key,events])=>events[0]?.lane||(collectionId==='layers'?JSON.parse(key)[3]:key);
    const ordered=[...groups.entries()].sort((a,b)=>{const la=rowLane(a),lb=rowLane(b);const ra=la==='Attached calendars'?-1:workLaneOrder.has(la)?workLaneOrder.get(la):(laneRank?.get(la)??999);const rb=lb==='Attached calendars'?-1:workLaneOrder.has(lb)?workLaneOrder.get(lb):(laneRank?.get(lb)??999);return ra-rb||String(la).localeCompare(String(lb));});
    positions.clear();let y=0;const markup=[],titles=[],laneHeight=compact?42:60,cardHeight=compact?19:30;
    // Reserve space for text cards and a smaller, centered footprint for point markers.
    const axisTrack=host.querySelector('.sl-axis-track');
    const width=Math.max(1,axisTrack.offsetWidth);
    const markerHalfSpan=span*12/width, cardSpan=span*72/width;
    ordered.forEach(([groupKey,events])=>{
      const representative=events[0]||{id:'empty-'+groupKey,lane:collectionId==='layers'?JSON.parse(groupKey)[3]:groupKey,project,workflow:'communication',access:{label:'Linked calendar'}};
      const rowId=selectedMode==='basic'?String(groupKey):representative.id;const rowKey=esc(rowId);
      if(selectedMode==='basic'?!expanded&&kept.size&&!kept.has(rowId):kept.size&&!leftPanel?.classList.contains('open')&&!kept.has(rowId))return;
      const visible=M.pack(events.filter(e=>e.start<end&&(e.end>start||e.start>=start)).map(item=>
        (item.event.githubActivity || isProjectMarker(item) || window.CalendarLaneEvents.isGarminActivity(item.event))
          ? {item,start:item.start-markerHalfSpan,end:item.start+markerHalfSpan}
          : {item,start:item.start,end:Math.max(item.end,item.start+cardSpan)}));
      const height=laneHeight,workflow=M.workflows[representative.workflow];
      const access=source==='example'?'Local example':representative.access.label||'Read only';
      const on=kept.has(rowId);
      const color=laneColor(representative.lane);
      const rgb=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)).join(',');
      const sleep=color===SLEEP_COLOR;
      const addMarker=collectionId==='linked-project'&&canCreateProjectMarker&&workLaneOrder.has(representative.lane)
        ? `<button type="button" class="sl-add-marker" data-create-marker="${esc(representative.lane)}" title="Add ${esc(representative.lane)} marker" aria-label="Add ${esc(representative.lane)} marker">${workMarkerIcons[representative.lane]} +</button>`
        : '';
      const label=`<div class="sl-label ${on?'sl-kept':''}" data-row="${rowKey}" data-work-lane="${esc(representative.lane)}" style="height:${height}px;--workflow:${rgb}"><button class="sl-lane-title" data-lane="${rowKey}" aria-pressed="${on}" title="${esc(representative.lane+' / '+representative.project+' · '+access)}">${sleep?'●':workflow[1]} ${esc(representative.lane)}</button>${addMarker}<small>${esc(representative.project)}</small></div>`;
      if(docked&&!namesInBoard)titles.push(label);
      markup.push(`<section class="sl-lane ${on?'sl-kept':''}" data-row="${rowKey}" data-drop-lane="${esc(representative.lane)}" style="height:${height}px;--workflow:${rgb}">${namesInBoard?label:''}<div class="sl-track">${weekendMarkup}${ticks.map(t=>`<span class="sl-gridline" style="left:${pct(t)}%"></span>`).join('')}${context?`<span class="sl-context" style="left:${pct(context.t0)}%;width:${Math.max(0,pct(context.t1)-pct(context.t0))}%"></span>`:''}
      ${collectionId==='layers'&&laneLoading?'<div class="sl-load-state" role="status"><span class="sl-loading-spinner"></span>Loading events…</div>':collectionId==='layers'&&laneError?`<div class="sl-load-state" role="alert">${esc(laneError)} <button data-action="retry-lanes">Retry</button></div>`:collectionId==='layers'&&!visible.length?`<div class="sl-load-state">${unavailableLanes.has(representative.lane)?'Data unavailable':'No events in this time window'}</div>`:''}${visible.map(({item:e,row})=>{
        const left=pct(e.start), top=6+Math.min(row*4,height-cardHeight-12);
        const activity=e.event.githubActivity;
        if(activity||isProjectMarker(e)){
          const center=left/100*width;
          positions.set(e.id,{left:center,right:center,y:y+top+cardHeight/2});
          return `<div class="sl-object sl-github-point" style="left:${left}%;top:${top}px;height:${cardHeight}px;--object:${color}"><button type="button" class="sl-card sl-github-marker ${selected===e.id?'sl-selected':''}" data-id="${esc(e.id)}" title="${esc(e.event.summary)} · ${new Date(e.start).toLocaleString()}" aria-label="${esc(e.event.summary)}">${activity?githubMarker(activity):workMarkerIcons[e.lane]}</button></div>`;
        }
        if (window.CalendarLaneEvents.isGarminActivity(e.event)) {
          const center = left / 100 * width;
          const middle = top + cardHeight / 2;
          positions.set(e.id, {left:center,right:center,y:y+middle});
          const label = esc(e.event.summary || 'Garmin activity');
          const times = new Date(e.start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) +
            ' – ' + new Date(e.end).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
          const duration = pct(e.end) - left;
          return `<span class="sl-activity-duration" style="left:${left}%;width:${duration}%;top:${middle}px;--object:${color}" aria-hidden="true"></span>
            <div class="sl-object sl-activity-point" style="left:${left}%;top:${top}px;height:${cardHeight}px;--object:${color}">
              <button type="button" class="sl-card sl-activity-marker ${selected===e.id?'sl-selected':''}" data-id="${esc(e.id)}"
                title="${label} · ${esc(times)}" aria-label="${label}, ${esc(times)}">${window.CalendarLaneEvents.garminActivityIcon(e.event)}</button>
            </div>`;
        }
        if (window.CalendarLaneEvents.isGarminActivity(e.event)) {
          const center = left / 100 * width;
          const middle = top + cardHeight / 2;
          positions.set(e.id, {left:center,right:center,y:y+middle});
          const label = esc(e.event.summary || 'Garmin activity');
          const times = new Date(e.start).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) +
            ' – ' + new Date(e.end).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
          const duration = pct(e.end) - left;
          return `<span class="sl-activity-duration" style="left:${left}%;width:${duration}%;top:${middle}px;--object:${color}" aria-hidden="true"></span>
            <div class="sl-object sl-activity-point" style="left:${left}%;top:${top}px;height:${cardHeight}px;--object:${color}">
              <button type="button" class="sl-card sl-activity-marker ${selected===e.id?'sl-selected':''}" data-id="${esc(e.id)}"
                title="${label} · ${esc(times)}" aria-label="${label}, ${esc(times)}">${window.CalendarLaneEvents.garminActivityIcon(e.event)}</button>
            </div>`;
        }
        const duration=pct(e.end)-left,objectWidth=Math.min(100-left,Math.max(72/width*100,duration));
        const icon=STATUS_ICONS[e.status]||{meeting:'●',task:'▰',milestone:'◆'}[e.kind];
        positions.set(e.id,{left:left/100*width,right:(left+objectWidth)/100*width,y:y+top+cardHeight/2});
        return `<div class="sl-object" style="left:${left}%;width:${objectWidth}%;top:${top}px;height:${cardHeight}px;--object:${color}"><button class="sl-card ${selected===e.id?'sl-selected':''}" data-id="${esc(e.id)}" draggable="${(collectionId==='linked-project'&&!!e.event.projectLinkId)||(collectionId==='layers'&&!reviewColors&&selectedMode==='basic'&&!!e.event.key&&!laneMoveId)}" title="${esc(e.event.summary)} · ${esc(e.status)} · ${new Date(e.start).toLocaleString()}" aria-label="${esc(e.event.summary)}, ${e.kind}, ${e.status}"><span>${icon}</span> ${esc(e.event.summary)}</button><span class="sl-duration" style="width:${Math.min(100,duration/objectWidth*100)}%"></span>${connect?`<button class="sl-port sl-port-in" data-port="start" data-item="${esc(e.id)}" aria-label="Connect to start of ${esc(e.event.summary)}"></button><button class="sl-port sl-port-out" data-port="end" data-item="${esc(e.id)}" aria-label="Connect from end of ${esc(e.event.summary)}"></button>`:''}</div>`;
      }).join('')}${Date.now()>=start&&Date.now()<end?`<span class="sl-now" style="left:${pct(Date.now())}%"></span>`:''}</div></section>`);y+=height;
    });
    side.innerHTML=docked&&!namesInBoard?`<div class="sl-label sl-axis-label">${esc(dayLabel || 'Lanes')}</div>${titles.join('')}`:'';
    host.querySelector('#sl-rows').innerHTML=markup.join('')||'<p class="sl-empty">No work layers loaded. Choose the example or mark an account event as Work.</p>';
    if(laneItems.length&&!positions.size&&!heartTrace.length){
      const hint=collectionId==='linked-project'&&list.some(item=>item.event.githubActivity)
        ? 'No objects in this window. Use Go to latest GitHub activity to find the newest record.'
        : 'No objects in this window. Use Fit to find this project.';
      host.querySelector('#sl-rows').insertAdjacentHTML('beforeend',`<p class="sl-empty">${hint}</p>`);
    }
    if (y && heartTrace.length) {
      let low=50,high=150;
      for (const [,bpm] of heartTrace) {
        low=Math.min(low,bpm);
        high=Math.max(high,bpm);
      }
      const points=heartTrace.map(([time,bpm])=>({
        time,x:(pct(time)/100*width).toFixed(1),
        y:(6+(1-(bpm-low)/(high-low))*(y-12)).toFixed(1),
      }));
      const gap=30*60000;
      const path=points.map(({time,x,y},i)=>{
        const command=i===0||time-points[i-1].time>gap?'M':'L';
        return `${command}${x},${y}`;
      }).join(' ');
      const isolated=points.filter(({time},i)=>
        (i===0||time-points[i-1].time>gap)&&(i===points.length-1||points[i+1].time-time>gap));
      const dots=isolated.map(({x,y})=>`<circle cx="${x}" cy="${y}" r="2"/>`).join('');
      const axis=host.querySelector('.sl-axis');
      const trackLeft=axis.offsetLeft+axisTrack.offsetLeft;
      host.querySelector('.sl-board').insertAdjacentHTML('beforeend',`<svg class="sl-heart-trace" style="left:${trackLeft}px;width:${width}px;top:${axis.offsetHeight}px;height:${y}px" viewBox="0 0 ${width} ${y}" preserveAspectRatio="none" role="img" aria-label="Heart rate over the selected time window"><path d="${path}"/>${dots}</svg>`);
    }
    const links=[];
    list.forEach(target=>target.dependencies.forEach(from=>{
      const a=positions.get(from),b=positions.get(target.id);if(!a||!b)return;
      const spec=target.links.find(l=>l.uid===from)||{},x1=spec.from==='start'?a.left:a.right,x2=spec.to==='end'?b.right:b.left;
      const bend=Math.round(((x1+x2)/2+(Number(spec.offset)||0))/8)*8;
      const path=curve(x1,a.y,x2,b.y,bend);
      links.push(`<g><path class="sl-link" d="${path}" marker-end="url(#sl-arrow)"/><path class="sl-link-hit" data-link-from="${esc(from)}" data-link-to="${esc(target.id)}" d="${path}" tabindex="0" role="button" aria-label="Dependency to ${esc(target.event.summary)}"/>${connect&&writable(target)?`<circle class="sl-route-handle" cx="${bend}" cy="${(a.y+b.y)/2}" r="4" data-route-from="${esc(from)}" data-route-to="${esc(target.id)}" aria-label="Drag to snap connector routing"/>`:''}</g>`);
    }));
    if(y)host.querySelector('.sl-board').insertAdjacentHTML('beforeend',`<svg class="sl-links" style="height:${y}px" viewBox="0 0 ${width} ${y}" preserveAspectRatio="none" aria-label="Item relationships"><defs><marker id="sl-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#7e929d"/></marker></defs>${links.join('')}<path id="sl-draft"/></svg>`);
    if(selectedMode==='basic'&&collectionId==='layers'&&!reviewColors){
      const sizes={};for(const row of host.querySelectorAll('.sl-lane')){const name=selectedLayerNames.find(name=>window.CalendarLaneEvents.label(name)===row.dataset.dropLane);if(name)sizes[name]=row.offsetHeight;}
      parentSend({type:'CIRCAEVUM_LANE_ROW_SIZES',sizes});
    }
    requestAnimationFrame(alignLaneRows);
    const boardScroll=host.querySelector('.sl-board-scroll');
    boardScroll.scrollTop=scrollTop;boardScroll.scrollLeft=scrollLeft;
    boardScroll.addEventListener('scroll',()=>{if(!side.hidden)side.scrollTop=boardScroll.scrollTop;},{passive:true});
    syncPanel();if(panelMode==='event'&&selected)detail(selected);rendering=false;requestAnimationFrame(()=>{placeRail();window.dispatchEvent(new CustomEvent('circaevum:lanes-layout'));});
  }
  function detail(id){
    sceneDetail.hidden=true;eventMode.querySelector('#sl-detail').hidden=false;
    selected=id;panelMode='event';const item=items().find(e=>e.id===id);if(!item){selected=null;return;}
    const all=items(),deps=M.dependencyState(item,all),next=all.filter(e=>e.dependencies.includes(id)),r=M.report([item])[0];
    syncPanel(true);
    eventMode.querySelector('#sl-detail').innerHTML=`<section class="sl-detail"><div class="sl-actions"><strong>${esc(item.kind)} · ${esc(item.status)}</strong><button data-action="dismiss-detail" aria-label="Close item details">×</button></div><h2>${esc(item.event.summary)}</h2><p>${esc(item.project)} / ${esc(item.lane)}</p><p>${new Date(item.start).toLocaleString()}${item.kind==='milestone'?'':' → '+new Date(item.end).toLocaleString()}</p><p>${esc(item.event.description||'')}</p>${item.event.githubActivity&&/^https:\/\/github\.com\//.test(item.event.url)?`<p><a href="${esc(item.event.url)}" target="_blank" rel="noreferrer">Open on GitHub</a></p>`:''}<p>${M.workflows[item.workflow][1]} ${M.workflows[item.workflow][0]}</p><p>Access: ${esc(source==='example'?'Local example':item.access.label)}${item.access.ownerId?'<br>Owner: '+esc(item.access.ownerId):''}</p><p>Responsible: ${esc(item.assignee||'Unassigned')}<br>Follow-up: ${Number.isFinite(item.followUpAt)?new Date(item.followUpAt).toLocaleString():'Not set'}</p>
      ${r.overdue||r.followUpDue||r.noFollowUp?`<p class="sl-attention">${r.overdue?'Past due. ':''}${r.followUpDue?'Follow-up due. ':''}${r.noFollowUp?'Past meeting has no linked next step.':''}</p>`:''}
      ${collectionId==='linked-project'&&item.event.projectLinkId?`<div class="sl-actions" aria-label="Move event to work lane">${['Attached calendars',...workLaneOrder.keys()].filter(l=>l!==item.lane).map(l=>`<button data-assign-lane="${esc(l)}" data-assign-id="${esc(item.id)}">Move to ${esc(l)}</button>`).join('')}</div>`:''}
      <h3>Depends on</h3><ul>${deps.length?deps.map(d=>`<li>${d.item?`<button data-id="${esc(d.id)}">${esc(d.item.event.summary)}</button>`:'Unavailable item (not loaded or not shared)'} · ${d.unresolved?'unresolved':'done'}${writable(item)?` <button data-remove-link="${esc(d.id)}" aria-label="Remove dependency">×</button>`:''}</li>`).join(''):'<li>None</li>'}</ul>
      <h3>Next steps</h3><ul>${next.length?next.map(e=>`<li><button data-id="${esc(e.id)}">${esc(e.event.summary)}</button></li>`).join(''):'<li>No linked follow-up</li>'}</ul>
      ${selectedLink?.to===item.id&&writable(item)?`<div class="sl-link-editor"><strong>Selected connection</strong><p>Endpoints stay attached to their objects. In Connect mode, drag its handle to snap the curve in 8 px steps.</p><button data-action="route-style">Reset curve</button></div>`:''}
      <div class="sl-actions">${writable(item)?'<button data-action="edit">Edit item</button>':''}<button data-action="focus">Focus time</button>${source==='loaded'&&item.access.canWrite?'<button data-action="share-lane">Lane access & sharing</button>':''}</div></section>`;
  }
  async function persist(event){
    if(source==='example'){const next=demo.filter(e=>e.uid!==event.uid).concat(event);localStorage.setItem(KEY,JSON.stringify(next));demo=next;return;}
    const requestId=crypto.randomUUID();
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Save timed out. Refresh shared layers before retrying.'));},20000);
      pending.set(requestId,{resolve,reject,timer});parentSend({type:'CIRCAEVUM_SAVE_WORK',requestId,event});
    });
  }
  async function saveWork(item,work){
    if(saving||!writable(item))return; saving=true;notice='Saving…';
    try{await persist({...item.event,work});notice='Saved.';}catch(e){notice=e.message||'Save failed.';}finally{saving=false;render();}
  }
  async function makeLink(a,b){
    if(a.id===b.id){notice='An item cannot connect to itself.';render();return;}
    const target=items().find(e=>e.id===b.id);if(!target||!writable(target)){notice='This target is read only. Link into a layer you own.';render();return;}
    const deps=[...new Set([...target.dependencies,a.id])];if(M.cycle(target.id,deps,items())){notice='That connection would create a cycle.';render();return;}
    const links=target.links.filter(l=>l.uid!==a.id).concat({uid:a.id,from:a.port,to:b.port,route:'elbow',offset:0});
    selected=target.id;panelMode='event';await saveWork(target,{...target.event.work,dependencies:deps,links});
  }
  function editor(id){
    const item=items().find(e=>e.id===id);if(source!=='example'){if(item&&writable(item))parentSend({type:'CIRCAEVUM_EDIT_EVENT',event:item.event});return;}
    const e=item?.event||{uid:'work-example-'+crypto.randomUUID(),summary:'',category:'Delivery',dtstart:{dateTime:new Date(focus).toISOString()},dtend:{dateTime:new Date(focus+3600000).toISOString()},work:{project:project||'OpenAMI / ISV',lane:'Delivery',kind:'task',status:'todo',workflow:'communication',dependencies:[]}};
    selected=e.uid;panelMode='event';syncPanel(true);
    const field=(label,name,value,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`;
    const select=(label,name,values,value)=>`<label>${label}<select name="${name}">${values.map(([key,text])=>`<option value="${key}" ${key===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
    eventMode.querySelector('#sl-detail').innerHTML=`<section class="sl-detail"><h2>${item?'Edit':'New'} item</h2><form id="sl-editor">${field('Title','summary',e.summary,'text',true)}${field('Project','project',e.work.project,'text',true)}${field('Calendar layer / lane','lane',e.category||e.work.lane,'text',true)}${select('Kind','kind',['task','meeting','milestone'].map(x=>[x,x]),e.work.kind)}${select('State','status',M.statuses.map(x=>[x,x]),e.work.status)}${select('Workflow tint','workflow',Object.entries(M.workflows).map(([k,v])=>[k,v[0]]),e.work.workflow||'communication')}${field('Start','start',localTime(M.time(e.dtstart)),'datetime-local',true)}${field('End (ignored for milestone)','end',localTime(M.time(e.dtend||e.dtstart)),'datetime-local',true)}${field('Responsible / waiting on','assignee',e.work.assignee||'')}${field('Follow-up date','followUpAt',e.work.followUpAt?localDate(M.time(e.work.followUpAt)):'','date')}<p id="sl-error" role="alert"></p><button type="submit">Save locally</button><button type="button" data-action="cancel">Cancel</button></form></section>`;
    eventMode.querySelector('#sl-editor').addEventListener('submit',async ev=>{
      ev.preventDefault();const data=new FormData(ev.target),a=new Date(data.get('start')),b=new Date(data.get('end'));
      if(!data.get('summary').trim()||!data.get('project').trim()||!data.get('lane').trim()||!Number.isFinite(+a)||!Number.isFinite(+b)||(data.get('kind')!=='milestone'&&b<=a)){eventMode.querySelector('#sl-error').textContent='Enter title, project, lane and an end after start.';return;}
      const event={...e,summary:data.get('summary').trim(),category:data.get('lane').trim(),isWorkEvent:true,dtstart:{dateTime:a.toISOString()},dtend:data.get('kind')==='milestone'?null:{dateTime:b.toISOString()},work:{...e.work,project:data.get('project').trim(),lane:data.get('lane').trim(),kind:data.get('kind'),status:data.get('status'),workflow:data.get('workflow'),assignee:data.get('assignee').trim(),followUpAt:data.get('followUpAt')||null}};
      try{await persist(event);project=M.normalize(event)?.project||project;selected=event.uid;render();}catch(error){eventMode.querySelector('#sl-error').textContent='Not saved: '+error.message;}
    });eventMode.querySelector('[name=summary]').focus();
  }
  document.addEventListener('click',async e=>{
    if(!host.contains(e.target)&&!eventMode.contains(e.target)&&!panelTabs.contains(e.target)&&!rail.contains(e.target)&&!side.contains(e.target))return;
    const port=e.target.closest('[data-port]');if(port){if(draw?.moved||Date.now()<suppressPortClickUntil)return;const p={id:port.dataset.item,port:port.dataset.port};if(linkStart){const a=linkStart;linkStart=null;await makeLink(a,p);}else{linkStart=p;notice='Select the target endpoint.';(side.querySelector('.sl-notice')||host.querySelector('.sl-notice')).textContent=notice;}return;}
    const link=e.target.closest('[data-link-from]');if(link){selectedLink={from:link.dataset.linkFrom,to:link.dataset.linkTo};selected=selectedLink.to;panelMode='event';render();return;}
    const assign=e.target.closest('[data-assign-lane]');if(assign){assignProjectEvent(assign.dataset.assignId,assign.dataset.assignLane);return;}
    const card=e.target.closest('[data-id]');if(card){selected=card.dataset.id;panelMode='event';render();return;}
    const addMarker=e.target.closest('[data-create-marker]');
    if(addMarker&&collectionId==='linked-project'&&canCreateProjectMarker){
      const time=focus>=start&&focus<start+span?focus:start+span/2;
      parentSend({type:'CIRCAEVUM_CREATE_PROJECT_MARKER',project,lane:addMarker.dataset.createMarker,time});
      return;
    }
    const lane=e.target.closest('[data-lane]');if(lane){if(reviewColors)return;const key=lane.dataset.lane;if(selectedMode!=='basic'&&collectionId!=='linked-project')return;if(collectionId==='linked-project'){const name=lane.closest('.sl-label')?.dataset.workLane;if(workLaneOrder.has(name)){parentSend({type:'CIRCAEVUM_CONFIGURE_PROJECT_LANE',project,lane:name});return;}}if(kept.has(key))kept.delete(key);else if(selectedMode!=='basic'||kept.size<3)kept.add(key);else notice='Choose up to three lanes for the lowered view.';if(kept.has(key))requestLaneData(true);render();return;}
    const remove=e.target.closest('[data-remove-link]');if(remove){const target=items().find(x=>x.id===selected);if(target)await saveWork(target,{...target.event.work,dependencies:target.dependencies.filter(x=>x!==remove.dataset.removeLink),links:target.links.filter(x=>x.uid!==remove.dataset.removeLink)});return;}
    const tick=e.target.closest('[data-time]');if(tick){focus=Number(tick.dataset.time);start=focus-span/2;changedTime();render();return;}
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    if(action==='github-refresh'){
      parentSend({type:'CIRCAEVUM_REFRESH_GITHUB_DELIVERY',project});
      return;
    }
    if(action==='github-latest'){
      const dates=rows().filter(item=>item.event.githubActivity).map(item=>item.start);
      if(dates.length){start=Math.max(...dates)-span/2;changedTime();render();}
      return;
    }
    if(action==='review-empty'){reviewShowEmpty=!reviewShowEmpty;render();return;}
    if(action==='retry-lanes'){requestLaneData(true,true);render();return;}
    if(action==='basic-size'){expanded=!expanded;notice=expanded?'Select up to three lane headers, then Show selected.':'';render();return;}
    if(action==='expand'){expanded=!expanded;render();return;}if(action==='panel-event'){panelMode='event';syncPanel(true);if(selected)detail(selected);else if(sceneDetail.hidden)eventMode.querySelector('#sl-detail').innerHTML='<p>Select an event in the scene or Swim Lanes.</p>';return;}if(action==='panel-timeline'){panelMode='timeline';syncPanel();return;}
    if(action==='close')return setOpen(false);if(action==='edit')return editor(selected);if(action==='new')return editor(null);
    if(action==='route-style'&&selectedLink){const target=items().find(e=>e.id===selectedLink.to);if(target){const spec=target.links.find(l=>l.uid===selectedLink.from)||{};await saveWork(target,{...target.event.work,links:target.links.filter(l=>l.uid!==selectedLink.from).concat({...spec,uid:selectedLink.from,route:'elbow',offset:0})});}return;}
    if(action==='focus'){const item=items().find(e=>e.id===selected);if(item){start=item.start-span/2;changedTime();} }
    if(action==='share-lane'){const item=items().find(e=>e.id===selected);if(item)parentSend({type:'CIRCAEVUM_SHARE_WORK_LANE',uid:item.event.uid});return;}
    if ((reviewColors || zoom==='day' || zoom==='clock') && ['prev','next','today'].includes(action)) {
      const day = new Date(action==='today'?Date.now():focus);
      day.setDate(day.getDate()+(action==='next'?1:action==='prev'?-1:0));
      day.setHours(12,0,0,0);
      if(zoom!=='clock')zoom='day';
      start=+day-span/2;changedTime();return;
    }
    if(action==='prev')start-=span;if(action==='next')start+=span;if(action==='today')start=Date.now()-span/2;
    if(['prev','next','today'].includes(action))changedTime();
    if(action==='fit')fit();if(action==='density')compact=!compact;if(action==='connect'){connect=!connect;linkStart=null;notice='';}
    if(action==='workflow')showWorkflow=!showWorkflow;if(action==='dismiss-detail'){selected=null;panelMode='timeline';}if(action==='cancel'){selected=null;panelMode='timeline';syncPanel();}
    if(action==='refresh'){notice='Refreshing shared access…';parentSend({type:'CIRCAEVUM_REFRESH_WORK'});}render();
  });
  function onControlChange(e){
    if(e.target.id==='sl-source'){source=e.target.value;project='';selected=null;notice='';fit();if(source==='loaded')parentSend({type:'CIRCAEVUM_REFRESH_WORK'});}
    else if(e.target.id==='sl-project'){project=e.target.value;selected=null;fit();}
    else if(e.target.id==='sl-zoom'){zoom=e.target.value;span=ZOOMS[zoom][1]*M.DAY;start=focus-span/2;changedTime();}
    else if(e.target.id==='sl-date'){const value=M.time(e.target.value);if(Number.isFinite(value)){start=value-span/2;changedTime();}}
    else return;render();
  }
  function assignProjectEvent(id,lane){
    const item=items().find(e=>e.id===id)
    if(collectionId==='layers'&&!reviewColors&&selectedMode==='basic'&&item?.event.key&&!laneMoveId){
      const destination=selectedLayerNames.find(name=>window.CalendarLaneEvents.label(name)===lane);
      if(!destination||item.lane===lane)return;
      laneMoveId=crypto.randomUUID();notice='Moving event…';
      parentSend({type:'CIRCAEVUM_MOVE_LANE_EVENT',requestId:laneMoveId,key:item.event.key,layer:destination});render();return;
    }
    if(collectionId!=='linked-project'||!item?.event.projectLinkId||!['Attached calendars',...workLaneOrder.keys()].includes(lane))return
    parentSend({type:'CIRCAEVUM_ASSIGN_PROJECT_EVENT',project,linkId:item.event.projectLinkId,sourceId:item.event.projectSourceId,lane})
  }
  host.addEventListener('dragstart',e=>{
    const card=e.target.closest('[data-id][draggable="true"]');if(!card)return
    e.dataTransfer.setData('application/x-circaevum-project-event',card.dataset.id);e.dataTransfer.effectAllowed='move'
  })
  host.addEventListener('dragover',e=>{if(e.target.closest('[data-drop-lane]')&&e.dataTransfer.types.includes('application/x-circaevum-project-event')){e.preventDefault();e.dataTransfer.dropEffect='move';host.querySelectorAll('.sl-drop-target').forEach(row=>row.classList.remove('sl-drop-target'));e.target.closest('[data-drop-lane]').classList.add('sl-drop-target')}})
  host.addEventListener('dragend',()=>host.querySelectorAll('.sl-drop-target').forEach(row=>row.classList.remove('sl-drop-target')))
  host.addEventListener('dragleave',e=>{const row=e.target.closest('[data-drop-lane]');if(row&&!row.contains(e.relatedTarget))row.classList.remove('sl-drop-target')})
  host.addEventListener('drop',e=>{host.querySelectorAll('.sl-drop-target').forEach(row=>row.classList.remove('sl-drop-target'));const lane=e.target.closest('[data-drop-lane]');const id=e.dataTransfer.getData('application/x-circaevum-project-event');if(lane&&id){e.preventDefault();assignProjectEvent(id,lane.dataset.dropLane)}})
  host.addEventListener('change',onControlChange);
  side.addEventListener('change',onControlChange);
  host.addEventListener('wheel',e=>{
    if(e.ctrlKey||!e.target.closest('.sl-board-scroll'))return;
    if(reviewColors&&!e.shiftKey)return;
    const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)*.3?e.deltaX:e.shiftKey?e.deltaY:0;if(!delta)return;
    e.preventDefault();e.stopPropagation();queuedPan+=delta*(e.deltaMode===1?16:e.deltaMode===2?600:1);
    if(panFrame===null)panFrame=requestAnimationFrame(()=>{const width=host.querySelector('.sl-axis-track')?.clientWidth||800;start+=queuedPan/width*span;queuedPan=0;panFrame=null;changedTime();render();});
  },{passive:false});
  host.addEventListener('pointerdown',e=>{
    const port=e.target.closest('[data-port]'),route=e.target.closest('[data-route-from]');
    if(port){draw={id:port.dataset.item,port:port.dataset.port,x:e.clientX,y:e.clientY,moved:false};e.preventDefault();}
    if(route){routeDrag={from:route.dataset.routeFrom,to:route.dataset.routeTo,x:e.clientX,offset:items().find(i=>i.id===route.dataset.routeTo)?.links.find(l=>l.uid===route.dataset.routeFrom)?.offset||0};e.preventDefault();}
  });
  window.addEventListener('pointermove',e=>{
    if(draw){draw.moved ||= Math.hypot(e.clientX-draw.x,e.clientY-draw.y)>5;const svg=host.querySelector('.sl-links'),a=positions.get(draw.id);if(svg&&a){const b=svg.getBoundingClientRect(),x=draw.port==='start'?a.left:a.right;host.querySelector('#sl-draft').setAttribute('d',curve(x,a.y,e.clientX-b.left,e.clientY-b.top));}}
    if(routeDrag){
      const offset=Math.round((routeDrag.offset+e.clientX-routeDrag.x)/8)*8;
      (side.querySelector('.sl-notice')||host.querySelector('.sl-notice')).textContent=`Route offset: ${offset} px (8 px snap)`;
      const target=items().find(i=>i.id===routeDrag.to),spec=target?.links.find(l=>l.uid===routeDrag.from)||{},a=positions.get(routeDrag.from),b=positions.get(routeDrag.to);
      if(a&&b){const x1=spec.from==='start'?a.left:a.right,x2=spec.to==='end'?b.right:b.left,bend=Math.round(((x1+x2)/2+offset)/8)*8;
        const hit=Array.from(host.querySelectorAll('[data-link-from]')).find(n=>n.dataset.linkFrom===routeDrag.from&&n.dataset.linkTo===routeDrag.to);
        if(hit){const d=curve(x1,a.y,x2,b.y,bend);hit.setAttribute('d',d);hit.previousElementSibling?.setAttribute('d',d);hit.nextElementSibling?.setAttribute('cx',bend);}
      }
    }
  });
  window.addEventListener('pointerup',async e=>{
    if(draw){const from=draw;draw=null;host.querySelector('#sl-draft')?.setAttribute('d','');if(from.moved){suppressPortClickUntil=Date.now()+400;linkStart=null;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-port]');if(target)await makeLink(from,{id:target.dataset.item,port:target.dataset.port});else{notice='Drop on an item endpoint to connect.';render();}return;}}
    if(routeDrag){const route=routeDrag;routeDrag=null;const target=items().find(i=>i.id===route.to);if(target)await saveWork(target,{...target.event.work,links:target.links.filter(l=>l.uid!==route.from).concat({...target.links.find(l=>l.uid===route.from),uid:route.from,offset:Math.round((route.offset+e.clientX-route.x)/8)*8,route:'elbow'})});}
  });
  host.addEventListener('keydown',e=>{if(window.isSceneKeyboardEditing?.(e))return;e.stopPropagation();if(e.key==='Escape'){if(connect){connect=false;linkStart=null;render();}else setOpen(false);}if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-link-from]')){e.preventDefault();detail(e.target.dataset.linkTo);}});
  window.addEventListener('circaevum:view-change',()=>{if(!pushing){initialized=true;readContext(false);}});
  function eventsForLayers(ids){
    const g=gl(); const out=[]; if(!g) return out;
    ids.forEach(id=>{
      const layer=g.getLayer?.(id); if(!layer) return;
      const lane=layer.laneName||layer.name||id;
      const list=g.events?.get?.(id)||[];
      list.forEach(ev=>out.push({...ev, isWorkEvent:true, category:ev.category||lane, work:ev.work||{project:layer.collectionLabel||'Life', lane, kind:'task', status:'planned', workflow:'operations', dependencies:[]}}));
    });
    return out;
  }
  window.openSwimCollection=function(colId){
    if(!modeEnabled(colId))return;
    if(appLayout()&&colId==='health'){window.openSwimLayerNames(['Garmin Sleep','Garmin Activity','Garmin Workout'],'Garmin','health');return;}
    reviewColors=null;
    const g=gl();
    const ids=(g?.getLayerIds?.()||[]).filter(id=>g.getLayer(id)?.collection===colId).sort((a,b)=>(g.getLayer(a).laneOrder||0)-(g.getLayer(b).laneOrder||0));
    laneRank=new Map(ids.map(id=>[g.getLayer(id).laneName||g.getLayer(id).name, g.getLayer(id).laneOrder||0]));
    selectedMode=colId;expanded=colId==='basic';notice=expanded?'Select up to three lane headers, then Show selected.':''; collectionId=colId; collectionLabel=ids.length?g.getLayer(ids[0]).collectionLabel:colId;
    supplied=eventsForLayers(ids); source='loaded'; project=supplied[0]?.work?.project||''; kept.clear(); setOpen(true);
  };
  window.openSwimLayerNames=function(names, title, mode='basic', colors){
    if(!modeEnabled(mode))return;
    names=window.CalendarLaneEvents.selectionNames(names,title,mode);
    const append=!colors&&!reviewColors&&mode==='basic'&&selectedMode==='basic'&&opened&&collectionId==='layers';
    reviewColors=colors?new Map(Object.entries(colors).filter(([,color])=>/^#[0-9a-f]{6}$/i.test(color))):null;
    if(reviewColors){reviewShowEmpty=false;parentSend({type:'CIRCAEVUM_LANE_ROW_SIZES',sizes:{}});}
    selectedMode=mode;expanded=mode==='basic'&&!reviewColors;notice=expanded?'Select up to three lane headers, then Show selected.':'';
    const g=gl(); if(!g?.getLayerIds) return;
    const removing=append&&names?.length===1&&selectedLayerNames.includes(names[0]);
    selectedLayerNames=removing?selectedLayerNames.filter(name=>name!==names[0]):[...new Set([...(append?selectedLayerNames:[]),...(names||[])])];
    if(removing){for(const key of kept){try{if(JSON.parse(key)[3]===window.CalendarLaneEvents.label(names[0]))kept.delete(key)}catch{}}}
    if(!selectedLayerNames.length){laneRequestId='';laneRequestKey='';supplied=[];parentSend({type:'CIRCAEVUM_LANE_ROW_SIZES',sizes:{}});setOpen(false);return;}

    laneRank=new Map(selectedLayerNames.map((name,i)=>[window.CalendarLaneEvents.label(name),i]));
    collectionId='layers'; collectionLabel=mode==='basic'&&!reviewColors?'Basic calendars':title||'Calendar';
    if(!append)fetchedLaneEvents=[];
    supplied=appLayout()?window.CalendarLaneEvents.projectFetched(fetchedLaneEvents,selectedLayerNames,collectionLabel):window.CalendarLaneEvents.project(g,selectedLayerNames,collectionLabel);
    source='loaded'; project=collectionLabel; if(!append)kept.clear();laneRequestKey=''; setOpen(true);
  };
  window.addEventListener('circaevum:calendar-events-updated',()=>{
    if(collectionId!=='layers'||appLayout())return;
    supplied=window.CalendarLaneEvents.project(gl(),selectedLayerNames,collectionLabel);
    if(opened)render();
  });
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||window.parent===window)return;const data=e.data;
    if(data?.type==='CIRCAEVUM_WORK_EVENTS'&&Array.isArray(data.events)){workSupplied=data.events;if(collectionId&&collectionId!=='work-project')return;supplied=data.events;accessMessage=data.message||'';if(data.publicView)source='loaded';if(opened&&source==='loaded')render();}
    if(data?.type==='CIRCAEVUM_OPEN_LINKED_PROJECT'&&Array.isArray(data.events)&&modeEnabled('work')){
      if(data.update&&(collectionId!=='linked-project'||project!==data.project))return;
      githubDelivery=data.github||null;
      canCreateProjectMarker=data.canCreateMarker===true;
      supplied=data.events;
      if(data.update){if(opened)render();return;}
      reviewColors=null;selectedMode='work';collectionId='linked-project';collectionLabel=data.project||'Project';
      source='loaded';project=collectionLabel;laneRank=workLaneOrder;kept.clear();setOpen(true);
    }
    if(data?.type==='CIRCAEVUM_REOPEN_SWIM_LANES'){reopenSwimLanes();return;}
    if(data?.type==='CIRCAEVUM_CLOSE_SWIM_LANES'){setOpen(false);return;}
    if(data?.type==='CIRCAEVUM_OPEN_SWIM_LANES'){
      if(!modeEnabled('work'))return;
      source=data.source||(loaded().some(x=>M.normalize(x))?'loaded':'example');
      if(source==='loaded'&&workSupplied!==null)supplied=workSupplied;
      reviewColors=null;selectedMode='work';project=data.project||'';collectionId='work-project';collectionLabel='Work';laneRank=workLaneOrder;kept.clear();setOpen(true);
    }
    // Old deep links/messages now open the calendar, never the retired columns page.
    if(data?.type==='CIRCAEVUM_OPEN_WORK_MODE')window.openSwimCollection('work');
    if(data?.type==='CIRCAEVUM_OPEN_COLLECTION'){
      if(!modeEnabled(data.collection))return;
      const have=gl()?.getLayerIds?.().some(id=>gl().getLayer(id)?.collection===data.collection);
      if(!have&&data.allowSample!==false&&typeof window.loadSampleProfile==='function')window.loadSampleProfile(data.sample||'noor');
      window.openSwimCollection(data.collection);
    }
    if(data?.type==='CIRCAEVUM_MOVE_LANE_RESULT'&&laneMoveId&&data.requestId===laneMoveId){
      laneMoveId='';laneLoading=false;notice=data.error||'Event moved.';
      if(!data.error&&data.event){fetchedLaneEvents=fetchedLaneEvents.filter(event=>event.key!==data.event.key).concat(data.event);supplied=window.CalendarLaneEvents.projectFetched(fetchedLaneEvents,selectedLayerNames,collectionLabel);laneRequestId='';}
      if(opened)render();
    }
    if(data?.type==='CIRCAEVUM_LANE_ANCHORS'){laneAnchors=data;alignLaneRows();}
    if(data?.type==='CIRCAEVUM_LANES_RESULT'&&collectionId==='layers'&&data.requestId===laneRequestId){
      laneLoading=false;laneError=data.error||'';
      unavailableLanes=new Set(Array.isArray(data.unavailableLanes)?data.unavailableLanes:[]);
      if(!laneError){fetchedLaneEvents=data.events||[];supplied=window.CalendarLaneEvents.projectFetched(fetchedLaneEvents,selectedLayerNames,collectionLabel);}
      if(opened)render();
    }
    if(data?.type==='CIRCAEVUM_REFRESH_GARMIN_LANES'&&opened&&
      (reviewColors||selectedLayerNames.some(name=>name.startsWith('Garmin ')))){requestLaneData(true);render();}
    if(data?.type==='CIRCAEVUM_REVIEW_WORK'&&Array.isArray(data.events)){
      reviewWork=data.events;
      if(reviewColors&&opened)render();
    }
    if(data?.type==='CIRCAEVUM_REFRESH_REVIEW_LANES'&&reviewColors&&opened){requestLaneData(true);render();}
    if(data?.type==='CIRCAEVUM_OPEN_LAYERS'&&Array.isArray(data.layerNames))window.openSwimLayerNames(data.layerNames, data.title, data.mode, data.reviewColors);
    if(data?.type==='CIRCAEVUM_WORK_SAVED'){const p=pending.get(data.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(data.requestId);if(data.error)p.reject(new Error(data.error));else{if(supplied&&data.event)supplied=supplied.map(x=>x.uid===data.event.uid&&x.workAccess?.canWrite?{...x,...data.event}:x);p.resolve();}}
  });
  // The viewer initializes after these scripts; read its selected time once ready.
  let startupAttempts=0;
  const startupSync=setInterval(()=>{
    if(typeof sceneContentGroup!=='undefined'&&sceneContentGroup&&gl()){readContext(true);clearInterval(startupSync);}
    else if(++startupAttempts>=80)clearInterval(startupSync);
  },100);
  host.addEventListener('scroll',()=>{if(opened&&!rendering)placeRail();},{passive:true});
  host.addEventListener('pointerover',e=>hotRow(e.target.closest?.('[data-row]')?.dataset.row||''));
  side.addEventListener('pointerover',e=>hotRow(e.target.closest?.('[data-row]')?.dataset.row||''));
  host.addEventListener('pointerleave',()=>hotRow(''));
  side.addEventListener('pointerleave',()=>hotRow(''));
  window.addEventListener('resize',()=>{if(opened)render();});
  leftPanel?.addEventListener('transitionend',e=>{if(e.target===leftPanel&&opened)placeRail();});
  document.getElementById('calendars-left-close')?.addEventListener('click',()=>{forcedLeft=false;if(opened)requestAnimationFrame(()=>render());});
  window.addEventListener('circaevum:host-layout',()=>{
    if(appLayout()){hideLeftIfForced();if(opened&&(!modeEnabled(selectedMode)||selectedMode!==document.body.dataset.mode))setOpen(false);else if(opened)render();}
  });
  if(new URLSearchParams(location.search).get('workView')==='swim-lanes')setOpen(true);
})();
