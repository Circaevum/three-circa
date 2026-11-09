/* Work is a compact projection of VEVENTs and the same selected time as the GL. */
(function () {
  const M = window.WorkTimeline, KEY = 'circaevum.work-example.v3';
  const ZOOMS = { hour:[0,1/24],day:[8,1],week:[7,7],month:[5,31],quarter:[4,92],year:[3,366] };
  const COLORS = {upcoming:['#528bd4','Upcoming / horizon'],waiting:['#d72ad7','Waiting for response'],action:['#dec445','Needs action'],'milestone-done':['#45a573','Completed milestone'],completed:['#8397a2','Completed task ✓'],past:['#89929a','Past / no new outcome'],blocked:['#d96669','Blocker / cancellation']};
  let demo=M.seed(), workSupplied=null, supplied=null, source='example', project='', selected=null, zoom='month', compact=true, connect=false;
  let collectionId='', collectionLabel='', laneRank=null, selectedMode='basic', selectedLayerNames=[];
  let start=+new Date(2026,10,1), span=31*M.DAY, context=null, focus=start+span/2, opened=false, returnFocus;
  let draw=null, routeDrag=null, linkStart=null, saving=false, notice='', accessMessage='', syncTimer, rendering=false, pushing=false, initialized=false;
  let selectedLink=null, queuedPan=0, panFrame=null, showWorkflow=false, panelMode='timeline', expanded=false, suppressPortClickUntil=0, forcedLeft=false, kept=new Set();
  const positions=new Map(), pending=new Map();
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
  eventPanel.querySelector('.event-list-panel-header').after(panelTabs);
  const eventMode=document.createElement('div');eventMode.id='sl-event-mode';eventMode.hidden=true;eventMode.innerHTML='<div id="sl-detail" role="tabpanel" aria-label="Event details"></div>';eventPanel.append(eventMode);
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
  function loaded(){if(supplied!==null)return supplied;const result=[];gl()?.events?.forEach((events,id)=>{if(gl().layers.get(id)?.visible!==false)result.push(...events);});return result;}
  function items(){const map=new Map();(source==='example'?demo:loaded()).forEach(e=>{const n=M.normalize(e);if(n?.id)map.set(n.id,n);});return [...map.values()];}
  function rows(){
    const all=items();
    if(collectionId==='linked-project')return all.filter(e=>e.project===project);
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
    const board=host.querySelector('.sl-board');
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
    }
  }
  function hotRow(key){
    host.querySelectorAll('.sl-hot').forEach(n=>n.classList.remove('sl-hot'));
    side.querySelectorAll('.sl-hot').forEach(n=>n.classList.remove('sl-hot'));
    if(!key)return;
    host.querySelectorAll(`[data-row="${key}"]`).forEach(n=>n.classList.add('sl-hot'));
    side.querySelectorAll(`[data-row="${key}"]`).forEach(n=>n.classList.add('sl-hot'));
  }
  function setOpen(value){
    if(value)returnFocus=document.activeElement;
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
    if(level===9)return 'hour';
    return 'year';
  }
  function windowFromPayload(payload){
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
  function render(){
    if(!opened)return;rendering=true;host.classList.toggle('sl-expanded',expanded);
    const docked=appLayout()||!!leftPanel?.classList.contains('open');
    host.classList.toggle('sl-docked',docked);
    const namesInBoard=appLayout()||!docked||!leftPanel?.classList.contains('open');
    host.classList.toggle('sl-named',docked&&namesInBoard);
    const scroll=host.scrollTop, all=items(), list=rows(), end=start+span, projects=[...new Set(all.map(e=>e.project))];
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
      <div class="sl-legend" aria-label="Object color meanings">${Object.entries(COLORS).map(([key,[color,label]])=>`<span><i style="background:${color}"></i>${label}</span>`).join('')}</div>
      ${showWorkflow?`<div class="sl-workflow-legend">${Object.entries(M.workflows).map(([k,[label,icon,rgb]])=>`<span style="--workflow:${rgb}">${icon} ${label}</span>`).join('')}</div>`:''}
      <div class="sl-caption"><span>${fmt(start)} – ${fmt(end)} ${new Date(focus).getFullYear()} · ${list.length} items</span></div>
      <p class="sl-notice" role="status">${esc(notice||accessMessage||'')}</p>`;
    const dockChrome=(collectionId
      ? `<div class="sl-bar" tabindex="-1"><strong>${esc(collectionLabel)}</strong><button class="sl-minimize" data-action="close" aria-label="Minimize Swim Lanes" title="Minimize">−</button></div>`
      : `<div class="sl-bar" tabindex="-1">${toolBits}<button class="sl-minimize" data-action="close" aria-label="Minimize Swim Lanes" title="Minimize">−</button></div>`)
      + (showWorkflow?`<div class="sl-workflow-legend">${Object.entries(M.workflows).map(([k,[label,icon,rgb]])=>`<span style="--workflow:${rgb}">${icon} ${label}</span>`).join('')}</div>`:'')
      + (notice||accessMessage?`<p class="sl-notice" role="status">${esc(notice||accessMessage)}</p>`:'');
    const board=`<div class="sl-layout"><div class="sl-board-scroll" aria-label="Project timeline"><div class="sl-board ${compact?'sl-compact':''}"><div class="sl-axis">${namesInBoard?'<div class="sl-label">Lanes</div>':''}<div class="sl-track sl-axis-track"></div></div><div id="sl-rows"></div></div></div></div>`;
    if(docked){side.hidden=namesInBoard;host.innerHTML=dockChrome+board;}
    else{side.hidden=true;side.innerHTML='';host.innerHTML=`<button class="sl-drawer-grip" data-action="expand" aria-label="${expanded?'Reduce':'Expand'} Swim Lanes" aria-expanded="${expanded}"><span></span></button>${chrome}${board}`;}
    const weekends=[];
    const day=new Date(start);day.setHours(0,0,0,0);
    while(+day<end){const a=+day,d=day.getDay();day.setDate(day.getDate()+1);if(d===0||d===6)weekends.push(`<span class="sl-weekend" style="left:${pct(a)}%;width:${pct(+day)-pct(a)}%" aria-hidden="true"></span>`);}
    const weekendMarkup=weekends.join('');
    const ticks=M.ticks(start,end,zoom);host.querySelector('.sl-axis-track').innerHTML=weekendMarkup+ticks.map(t=>`<button class="sl-tick" data-time="${t}" style="left:${pct(t)}%">${zoom==='hour'||zoom==='day'?new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):fmt(t)}</button>`).join('');
    const groups=new Map();list.forEach(e=>{const key=collectionId==='linked-project'?e.lane:JSON.stringify([e.access.ownerId||'',e.event.calendarId||'',e.project,e.lane]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);});
    if(collectionId==='linked-project')for(const lane of ['Attached calendars',...workLaneOrder.keys()])if(!groups.has(lane))groups.set(lane,[]);
    const ordered=[...groups.entries()].sort((a,b)=>{const la=a[1][0]?.lane||a[0],lb=b[1][0]?.lane||b[0];const ra=la==='Attached calendars'?-1:workLaneOrder.has(la)?workLaneOrder.get(la):(laneRank?.get(la)??999);const rb=lb==='Attached calendars'?-1:workLaneOrder.has(lb)?workLaneOrder.get(lb):(laneRank?.get(lb)??999);return ra-rb||String(la).localeCompare(String(lb));});
    positions.clear();let y=0;const markup=[],titles=[],heightStep=compact?25:40,cardHeight=compact?19:30;
    // Reserve 72 px for legible labels. Exact duration is also shown as a lower bar.
    const width=Math.max(600,host.querySelector('.sl-axis-track').getBoundingClientRect().width);
    ordered.forEach(([groupKey,events])=>{
      const representative=events[0]||{id:'empty-'+groupKey,lane:groupKey,project,workflow:'communication',access:{label:'Linked calendar'}};
      const rowKey=esc(representative.id);
      if(kept.size&&!leftPanel?.classList.contains('open')&&!kept.has(rowKey))return;
      const visible=M.pack(events.filter(e=>e.start<end&&(e.end>start||e.start>=start)),span*72/width);
      const height=Math.max(compact?42:60,(Math.max(-1,...visible.map(e=>e.row))+1)*heightStep+12),workflow=M.workflows[representative.workflow];
      const access=source==='example'?'Local example':representative.access.label||'Read only';
      const on=kept.has(rowKey);
      const sleep=representative.lane==='Sleep';
      const label=`<div class="sl-label ${on?'sl-kept':''}" data-row="${rowKey}" style="height:${height}px;--workflow:${sleep?'124,58,237':workflow[2]}"><button class="sl-lane-title" data-lane="${rowKey}" aria-pressed="${on}" title="${esc(representative.lane+' / '+representative.project+' · '+access)}">${sleep?'●':workflow[1]} ${esc(representative.lane)}</button><small>${esc(representative.project)}</small></div>`;
      if(docked&&!namesInBoard)titles.push(label);
      markup.push(`<section class="sl-lane ${on?'sl-kept':''}" data-row="${rowKey}" data-drop-lane="${esc(representative.lane)}" style="height:${height}px;--workflow:${workflow[2]}">${namesInBoard?label:''}<div class="sl-track">${weekendMarkup}${ticks.map(t=>`<span class="sl-gridline" style="left:${pct(t)}%"></span>`).join('')}${context?`<span class="sl-context" style="left:${pct(context.t0)}%;width:${Math.max(0,pct(context.t1)-pct(context.t0))}%"></span>`:''}
      ${visible.map(e=>{
        const left=pct(e.start),duration=pct(e.end)-left,objectWidth=Math.min(100-left,Math.max(72/width*100,duration));
        const top=6+e.row*heightStep,semantic=M.semantic(e),icon=e.status==='done'?'✓':{meeting:'●',task:'▰',milestone:'◆'}[e.kind];
        positions.set(e.id,{left:left/100*width,right:(left+objectWidth)/100*width,y:y+top+cardHeight/2});
        return `<div class="sl-object" style="left:${left}%;width:${objectWidth}%;top:${top}px;height:${cardHeight}px;--object:${COLORS[semantic][0]}"><button class="sl-card ${selected===e.id?'sl-selected':''}" data-id="${esc(e.id)}" draggable="${collectionId==='linked-project'&&!!e.event.projectLinkId}" title="${esc(e.event.summary)} · ${esc(e.status)} · ${new Date(e.start).toLocaleString()}" aria-label="${esc(e.event.summary)}, ${e.kind}, ${e.status}"><span>${icon}</span> ${esc(e.event.summary)}</button><span class="sl-duration" style="width:${Math.min(100,duration/objectWidth*100)}%"></span>${connect?`<button class="sl-port sl-port-in" data-port="start" data-item="${esc(e.id)}" aria-label="Connect to start of ${esc(e.event.summary)}"></button><button class="sl-port sl-port-out" data-port="end" data-item="${esc(e.id)}" aria-label="Connect from end of ${esc(e.event.summary)}"></button>`:''}</div>`;
      }).join('')}${Date.now()>=start&&Date.now()<end?`<span class="sl-now" style="left:${pct(Date.now())}%"></span>`:''}</div></section>`);y+=height;
    });
    side.innerHTML=docked&&!namesInBoard?`<div class="sl-label sl-axis-label">Lanes</div>${titles.join('')}`:'';
    host.querySelector('#sl-rows').innerHTML=markup.join('')||'<p class="sl-empty">No work layers loaded. Choose the example or mark an account event as Work.</p>';
    if(list.length&&!positions.size)host.querySelector('#sl-rows').insertAdjacentHTML('beforeend','<p class="sl-empty">No objects in this window. Use Fit to find this project.</p>');
    const links=[];
    list.forEach(target=>target.dependencies.forEach(from=>{
      const a=positions.get(from),b=positions.get(target.id);if(!a||!b)return;
      const spec=target.links.find(l=>l.uid===from)||{},x1=spec.from==='start'?a.left:a.right,x2=spec.to==='end'?b.right:b.left;
      const bend=Math.round(((x1+x2)/2+(Number(spec.offset)||0))/8)*8;
      const path=curve(x1,a.y,x2,b.y,bend);
      links.push(`<g><path class="sl-link" d="${path}" marker-end="url(#sl-arrow)"/><path class="sl-link-hit" data-link-from="${esc(from)}" data-link-to="${esc(target.id)}" d="${path}" tabindex="0" role="button" aria-label="Dependency to ${esc(target.event.summary)}"/>${connect&&writable(target)?`<circle class="sl-route-handle" cx="${bend}" cy="${(a.y+b.y)/2}" r="4" data-route-from="${esc(from)}" data-route-to="${esc(target.id)}" aria-label="Drag to snap connector routing"/>`:''}</g>`);
    }));
    if(y)host.querySelector('.sl-board').insertAdjacentHTML('beforeend',`<svg class="sl-links" style="height:${y}px" viewBox="0 0 ${width} ${y}" preserveAspectRatio="none" aria-label="Item relationships"><defs><marker id="sl-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#7e929d"/></marker></defs>${links.join('')}<path id="sl-draft"/></svg>`);
    syncPanel();if(panelMode==='event'&&selected)detail(selected);host.scrollTop=scroll;rendering=false;requestAnimationFrame(()=>{placeRail();window.dispatchEvent(new CustomEvent('circaevum:lanes-layout'));});
  }
  function detail(id){
    selected=id;panelMode='event';const item=items().find(e=>e.id===id);if(!item){selected=null;return;}
    const all=items(),deps=M.dependencyState(item,all),next=all.filter(e=>e.dependencies.includes(id)),r=M.report([item])[0];
    syncPanel(true);
    eventMode.querySelector('#sl-detail').innerHTML=`<section class="sl-detail"><div class="sl-actions"><strong>${esc(item.kind)} · ${esc(item.status)}</strong><button data-action="dismiss-detail" aria-label="Close item details">×</button></div><h2>${esc(item.event.summary)}</h2><p>${esc(item.project)} / ${esc(item.lane)}</p><p>${new Date(item.start).toLocaleString()}${item.kind==='milestone'?'':' → '+new Date(item.end).toLocaleString()}</p><p>${esc(item.event.description||'')}</p><p>${M.workflows[item.workflow][1]} ${M.workflows[item.workflow][0]}</p><p>Access: ${esc(source==='example'?'Local example':item.access.label)}${item.access.ownerId?'<br>Owner: '+esc(item.access.ownerId):''}</p><p>Responsible: ${esc(item.assignee||'Unassigned')}<br>Follow-up: ${Number.isFinite(item.followUpAt)?new Date(item.followUpAt).toLocaleString():'Not set'}</p>
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
    const lane=e.target.closest('[data-lane]');if(lane){const key=lane.dataset.lane;if(kept.has(key))kept.delete(key);else kept.add(key);render();return;}
    const remove=e.target.closest('[data-remove-link]');if(remove){const target=items().find(x=>x.id===selected);if(target)await saveWork(target,{...target.event.work,dependencies:target.dependencies.filter(x=>x!==remove.dataset.removeLink),links:target.links.filter(x=>x.uid!==remove.dataset.removeLink)});return;}
    const tick=e.target.closest('[data-time]');if(tick){focus=Number(tick.dataset.time);start=focus-span/2;changedTime();render();return;}
    const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    if(action==='expand'){expanded=!expanded;render();return;}if(action==='panel-event'){panelMode='event';syncPanel(true);if(selected)detail(selected);else eventMode.querySelector('#sl-detail').innerHTML='<p>Select an event in Swim Lanes.</p>';return;}if(action==='panel-timeline'){panelMode='timeline';syncPanel();return;}
    if(action==='close')return setOpen(false);if(action==='edit')return editor(selected);if(action==='new')return editor(null);
    if(action==='route-style'&&selectedLink){const target=items().find(e=>e.id===selectedLink.to);if(target){const spec=target.links.find(l=>l.uid===selectedLink.from)||{};await saveWork(target,{...target.event.work,links:target.links.filter(l=>l.uid!==selectedLink.from).concat({...spec,uid:selectedLink.from,route:'elbow',offset:0})});}return;}
    if(action==='focus'){const item=items().find(e=>e.id===selected);if(item){start=item.start-span/2;changedTime();} }
    if(action==='share-lane'){const item=items().find(e=>e.id===selected);if(item)parentSend({type:'CIRCAEVUM_SHARE_WORK_LANE',uid:item.event.uid});return;}
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
    if(collectionId!=='linked-project'||!item?.event.projectLinkId||!['Attached calendars',...workLaneOrder.keys()].includes(lane))return
    parentSend({type:'CIRCAEVUM_ASSIGN_PROJECT_EVENT',project,linkId:item.event.projectLinkId,sourceId:item.event.projectSourceId,lane})
  }
  host.addEventListener('dragstart',e=>{
    const card=e.target.closest('[data-id][draggable="true"]');if(!card)return
    e.dataTransfer.setData('application/x-circaevum-project-event',card.dataset.id);e.dataTransfer.effectAllowed='move'
  })
  host.addEventListener('dragover',e=>{if(e.target.closest('[data-drop-lane]')&&e.dataTransfer.types.includes('application/x-circaevum-project-event')){e.preventDefault();e.dataTransfer.dropEffect='move'}})
  host.addEventListener('drop',e=>{const lane=e.target.closest('[data-drop-lane]');const id=e.dataTransfer.getData('application/x-circaevum-project-event');if(lane&&id){e.preventDefault();assignProjectEvent(id,lane.dataset.dropLane)}})
  host.addEventListener('change',onControlChange);
  side.addEventListener('change',onControlChange);
  host.addEventListener('wheel',e=>{
    if(e.ctrlKey||!e.target.closest('.sl-board-scroll'))return;
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
    const g=gl();
    const ids=(g?.getLayerIds?.()||[]).filter(id=>g.getLayer(id)?.collection===colId).sort((a,b)=>(g.getLayer(a).laneOrder||0)-(g.getLayer(b).laneOrder||0));
    laneRank=new Map(ids.map(id=>[g.getLayer(id).laneName||g.getLayer(id).name, g.getLayer(id).laneOrder||0]));
    selectedMode=colId; collectionId=colId; collectionLabel=ids.length?g.getLayer(ids[0]).collectionLabel:colId;
    supplied=eventsForLayers(ids); source='loaded'; project=supplied[0]?.work?.project||''; kept.clear(); setOpen(true);
  };
  window.openSwimLayerNames=function(names, title, mode='basic'){
    if(!modeEnabled(mode))return;
    selectedMode=mode;
    const g=gl(); if(!g?.getLayerIds) return;
    selectedLayerNames=[...(names||[])];
    laneRank=new Map(selectedLayerNames.map((name,i)=>[window.CalendarLaneEvents.label(name),i]));
    collectionId='layers'; collectionLabel=title||'Calendar';
    supplied=window.CalendarLaneEvents.project(g,selectedLayerNames,collectionLabel);
    source='loaded'; project=collectionLabel; kept.clear(); setOpen(true);
  };
  window.addEventListener('circaevum:calendar-events-updated',()=>{
    if(collectionId!=='layers')return;
    supplied=window.CalendarLaneEvents.project(gl(),selectedLayerNames,collectionLabel);
    if(opened)render();
  });
  window.addEventListener('message',e=>{
    if(e.source!==window.parent||window.parent===window)return;const data=e.data;
    if(data?.type==='CIRCAEVUM_WORK_EVENTS'&&Array.isArray(data.events)){workSupplied=data.events;if(collectionId&&collectionId!=='work-project')return;supplied=data.events;accessMessage=data.message||'';if(data.publicView)source='loaded';if(opened&&source==='loaded')render();}
    if(data?.type==='CIRCAEVUM_OPEN_LINKED_PROJECT'&&Array.isArray(data.events)&&modeEnabled('work')){
      selectedMode='work';collectionId='linked-project';collectionLabel=data.project||'Project';
      supplied=data.events;source='loaded';project=collectionLabel;laneRank=workLaneOrder;kept.clear();setOpen(true);
    }
    if(data?.type==='CIRCAEVUM_REOPEN_SWIM_LANES'){reopenSwimLanes();return;}
    if(data?.type==='CIRCAEVUM_CLOSE_SWIM_LANES'){setOpen(false);return;}
    if(data?.type==='CIRCAEVUM_OPEN_SWIM_LANES'){
      if(!modeEnabled('work'))return;
      source=data.source||(loaded().some(x=>M.normalize(x))?'loaded':'example');
      if(source==='loaded'&&workSupplied!==null)supplied=workSupplied;
      selectedMode='work';project=data.project||'';collectionId='work-project';collectionLabel='Work';laneRank=workLaneOrder;kept.clear();setOpen(true);
    }
    // Old deep links/messages now open the calendar, never the retired columns page.
    if(data?.type==='CIRCAEVUM_OPEN_WORK_MODE')window.openSwimCollection('work');
    if(data?.type==='CIRCAEVUM_OPEN_COLLECTION'){
      if(!modeEnabled(data.collection))return;
      const have=gl()?.getLayerIds?.().some(id=>gl().getLayer(id)?.collection===data.collection);
      if(!have&&data.allowSample!==false&&typeof window.loadSampleProfile==='function')window.loadSampleProfile(data.sample||'noor');
      window.openSwimCollection(data.collection);
    }
    if(data?.type==='CIRCAEVUM_OPEN_LAYERS'&&Array.isArray(data.layerNames))window.openSwimLayerNames(data.layerNames, data.title, data.mode);
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
