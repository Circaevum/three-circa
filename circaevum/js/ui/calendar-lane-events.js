/* Read-only projection of a calendar's child layers, including pooled account events. */
(function(root) {
  const labels = {'Garmin Sleep':'Sleep','Garmin Activity':'Heart','Garmin Workout':'Activities'};
  function project(gl, names, title) {
    const wanted = new Set(names || []), result = new Map();
    for (const id of gl?.getLayerIds?.() || []) {
      const layer = gl.getLayer(id);
      for (const event of gl.events?.get(id) || []) {
        const category = event.category ?? event.categories;
        const name = (Array.isArray(category) ? category[0] : category) || event.layerId || layer?.name || id;
        if (!wanted.has(name) && !wanted.has(id) && !wanted.has(layer?.name)) continue;
        const lane = labels[name] || name;
        const key = event.uid || event.id;
        if (!key) continue;
        result.set(key, {...event, category:lane, isWorkEvent:true,
          work:{...(event.work || {}), project:title || 'Calendar', lane},
          workAccess:{label:'Calendar',canWrite:false}});
      }
    }
    return [...result.values()];
  }
  function projectFetched(events,names,title){
    return project({getLayerIds:()=>['fetched'],getLayer:()=>({}),events:new Map([['fetched',events||[]]])},names,title);
  }
  function rowKey(event,collection){
    // Calendar metadata may arrive later. Selection belongs to the lane, not its first event.
    return JSON.stringify(collection==='layers'?['','',event.project,event.lane]:[event.access.ownerId||'',event.event.calendarId||'',event.project,event.lane]);
  }
  function selectionNames(names,title,mode){
    const selected=[...new Set(names||[])];
    return mode==='health'&&(String(title).toLowerCase().includes('garmin')||selected.some(name=>name.startsWith('Garmin ')))
      ? [...new Set(['Garmin Sleep','Garmin Activity','Garmin Workout',...selected])] : selected;
  }
  const api = {project, projectFetched, rowKey, selectionNames, label:name=>labels[name] || name};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.CalendarLaneEvents=api;
})(typeof window !== 'undefined' ? window : globalThis);
