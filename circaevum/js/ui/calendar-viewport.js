/* Optional fitted canvas. The legacy full-window path remains the default outside app mode. */
(function () {
  const state = { managed: false, enabled: false, workEnabled: true, left: 0, right: 0, modes: null };
  window.circaevumHostLayout = state;
  window.getModeSelectedTimeColor = light => {
    const colors = { basic: [0x59616c, 0xd1d5db], work: [0x1769a0, 0x75c7ff], health: [0xa92e49, 0xff9baa], financial: [0x187347, 0x8aefb4] };
    return (colors[document.body.dataset.mode] || colors.basic)[light ? 0 : 1];
  };
  const hiddenLayers = new Map();
  let hookedGL = null;
  function applyModes() {
    const gl = window.circaevumGL || window.getGL?.();
    if (!gl || !state.modes) return;
    if (hookedGL !== gl && gl.on) {
      hookedGL = gl;
      for (const event of ['layerAdded','eventsIngested']) gl.on(event, () => setTimeout(applyModes, 0));
    }
    for (const id of gl.getLayerIds()) {
      const layer = gl.getLayer(id);
      const mode = layer?.collection || 'basic';
      if (state.modes[mode] === false) {
        if (!hiddenLayers.has(id)) hiddenLayers.set(id, layer.visible !== false);
        if (layer.visible !== false) gl.setLayerVisibility(id, false);
      } else if (hiddenLayers.has(id)) {
        const visible = hiddenLayers.get(id); hiddenLayers.delete(id);
        gl.setLayerVisibility(id, visible);
      }
    }
    window.refreshCalendarLayersList?.();
  }
  window.applyCalendarModeVisibility = applyModes;
  const depthPages = new Map();
  function syncDepthPages(){
    const enabled=document.body.classList.contains('interface-depth');
    const definitions=[
      ['scene',-360,['canvas-container','zoom-controls','hud','orbital-data-panel','orbital-data-restore']],
      ['events',-120,['event-list-panel','event-list-pull-tab']],
      ['lanes',120,['swim-lanes']]
    ];
    if(!enabled){
      for(const {sheet,entries} of depthPages.values()){
        for(const {node,marker} of entries){marker.replaceWith(node)}
        sheet.remove();
      }
      depthPages.clear();return;
    }
    for(const [name,z,ids] of definitions){
      let page=depthPages.get(name);
      if(!page){const sheet=document.createElement('div');sheet.className='interface-depth-page';sheet.dataset.page=name;sheet.style.setProperty('--page-depth',z+'px');sheet.setAttribute('aria-label',name==='scene'?'Calendar page':name==='events'?'Events page':'Swim lanes page');document.getElementById('xr-ui-layer').append(sheet);page={sheet,entries:[]};depthPages.set(name,page)}
      const order=state.depthLayout?.order||['scene','events','lanes','layers'];
      const index=order.indexOf(name);
      page.sheet.style.setProperty('--page-depth',((index-1.5)*240)+'px');
      page.sheet.style.zIndex=String(index+1);
      for(const id of ids){
        const node=document.getElementById(id);if(!node||page.entries.some(e=>e.node===node))continue;
        const marker=document.createComment('depth-page-slot');node.before(marker);page.entries.push({node,marker});page.sheet.append(node);
      }
      const closed=name==='events'?!document.body.classList.contains('event-list-panel-open'):name==='lanes'?!document.body.classList.contains('swim-lanes-open'):false;
      page.sheet.hidden=false;
      let placeholder=page.sheet.querySelector('.depth-page-placeholder');
      if(!placeholder){placeholder=document.createElement('div');placeholder.className='depth-page-placeholder';page.sheet.append(placeholder)}
      placeholder.hidden=!closed;
      placeholder.textContent=(name==='events'?'Events':'Swim lanes')+' · closed in normal view';
    }
  }
  let frame = null, lastGeometry = '';
  function update() {
    frame = null;
    if (!hookedGL) applyModes();
    const fit = state.managed && state.enabled && !document.body.classList.contains('is-tour-editor-open');
    document.body.classList.toggle('fit-calendar-viewport', fit);
    document.body.classList.toggle('portal-calendar-layout', state.managed);
    const visibleRect = id => {
      const el = document.getElementById(id);
      return el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' ? {top:el.offsetTop,right:el.offsetLeft+el.offsetWidth,width:el.offsetWidth,height:el.offsetHeight} : null;
    };
    const swim = visibleRect('swim-lanes');
    const leftPanel = document.body.classList.contains('calendars-left-panel-open') ? visibleRect('calendars-left-panel') : null;
    const rightPanel = document.body.classList.contains('event-list-panel-open') ? visibleRect('event-list-panel') : null;
    const left = Math.min(Math.max(state.left, leftPanel?.right || 0), Math.max(0, innerWidth - 240));
    const right = Math.min(Math.max(state.right, rightPanel ? rightPanel.width : 0), Math.max(0, innerWidth - left - 240));
    const attached=document.getElementById('swim-lanes')?.classList.contains('sl-row-attached');
    const bottom = attached?0:Math.min(swim ? innerHeight - swim.top : 0, Math.max(0, innerHeight - 180));
    const root = document.documentElement.style;
    root.setProperty('--calendar-fit-left', left + 'px');
    if(state.left>0)root.setProperty('--host-lane-label-width',state.left+'px');
    root.setProperty('--calendar-fit-right', right + 'px');
    root.setProperty('--calendar-fit-bottom', bottom + 'px');
    root.setProperty('--viewer-lanes-height', bottom + 'px');
    root.setProperty('--viewer-panel-right', right + 'px');
    const fullPage=document.getElementById('swim-lanes')?.classList.contains('sl-basic-full')&&document.body.classList.contains('swim-lanes-open');
    const geometry = JSON.stringify([bottom,right,fullPage,document.body.classList.contains('swim-lanes-open')]);
    if(state.managed && geometry !== lastGeometry){
      lastGeometry=geometry;
      window.parent.postMessage({type:'CIRCAEVUM_PANEL_GEOMETRY',bottom,right,fullPage,lanesOpen:document.body.classList.contains('swim-lanes-open')},'*');
    }
    syncDepthPages();
    window.circaevumResizeViewport?.();
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(update); }
  function applyDepthLayout(layout){
    const order=layout?.order;
    state.depthLayout={order:Array.isArray(order)&&order.length===4&&new Set(order).size===4&&order.every(id=>['scene','events','lanes','layers'].includes(id))?order:['scene','events','lanes','layers']};
    for(const [key,min,max,fallback] of [['pitch',-50,50,8],['yaw',-75,75,-28]]){
      const value=layout?.[key];document.documentElement.style.setProperty('--depth-'+key,(Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback)+'deg');
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window) return;
    const data = event.data;
    if(data?.type==='CIRCAEVUM_DEPTH_LAYOUT'){applyDepthLayout(data.depthLayout);syncDepthPages();return;}
    if (data?.type !== 'CIRCAEVUM_HOST_CHROME' || data.workbench !== true) return;
    Object.assign(state, { managed: true, enabled: data.fitViewport === true, workEnabled: data.workEnabled === true,
      left: Number.isFinite(data.left) ? Math.max(0, data.left) : 0,
      right: Number.isFinite(data.right) ? Math.max(0, data.right) : 0 });
    document.body.classList.toggle('interface-depth',data.depthPreview === true);
    window.setSceneIconsOpen?.(data.sceneIconsOpen === true);
    applyDepthLayout(data.depthLayout);
    state.modes = data.modes || { basic: true, health: true, work: state.workEnabled, financial: true };
    state.modes.basic = true;
    const activeMode = state.modes[data.activeMode] === true ? data.activeMode : 'basic';
    const changed = document.body.dataset.mode !== activeMode;
    document.body.dataset.mode = activeMode;
    if (changed) window.dispatchEvent(new CustomEvent('circaevum:mode-theme'));
    window.applyCalendarModeVisibility?.();
    document.documentElement.style.setProperty('--host-chrome-left', state.left + 'px');
    document.documentElement.style.setProperty('--host-chrome-right', state.right + 'px');
    window.dispatchEvent(new CustomEvent('circaevum:host-layout'));
    schedule();
  });
  const observer = new ResizeObserver(schedule);
  for (const id of ['swim-lanes','calendars-left-panel','event-list-panel']) {
    const el = document.getElementById(id); if (el) observer.observe(el);
  }
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('circaevum:lanes-layout', schedule);
})();
