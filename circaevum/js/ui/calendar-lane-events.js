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
      ? [...new Set(['Garmin Workout',...selected.filter(name=>!Object.hasOwn(labels,name)),'Garmin Sleep','Garmin Activity'])] : selected;
  }
  function isGarminActivity(event) {
    return event?.circaevumSourceDetail === 'garmin_activity' || event?.category === 'Garmin Workout';
  }

  function garminActivityIcon(event) {
    const type = String(event.activityType || event.summary || '').toLowerCase();
    if (/cycl|bik/.test(type)) return '🚲';
    if (/runn|run\b|jog/.test(type)) return '🏃';
    if (/swim/.test(type)) return '🏊';
    if (/walk|hik/.test(type)) return '🚶';
    if (/strength|weight|train/.test(type)) return '🏋';
    return '●';
  }

  function heartTrace(items, start, end) {
    const samples = new Map();
    for (const item of items) {
      for (const point of item.event.render?.summary || []) {
        const time = item.start + point.tOff;
        if (Number.isFinite(time) && time >= start && time < end && Number.isFinite(point.v) && point.v > 0) {
          samples.set(time, point.v);
        }
      }
    }
    return [...samples].sort(([a],[b]) => a-b);
  }
  const api = {project, projectFetched, rowKey, selectionNames, heartTrace, isGarminActivity, garminActivityIcon, label:name=>labels[name] || name};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.CalendarLaneEvents=api;
})(typeof window !== 'undefined' ? window : globalThis);
