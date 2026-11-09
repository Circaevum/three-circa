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
  const api = {project, label:name=>labels[name] || name};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.CalendarLaneEvents=api;
})(typeof window !== 'undefined' ? window : globalThis);
