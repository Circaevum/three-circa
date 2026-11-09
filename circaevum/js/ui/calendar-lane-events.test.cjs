const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('./calendar-lane-events.js');
const {normalize}=require('../models/work-timeline.js');
test('Garmin child categories populate separate lanes from the pooled account layer',()=>{
 const events=['Garmin Sleep','Garmin Activity','Garmin Workout','Other'].map((category,i)=>({uid:String(i),category,dtstart:{dateTime:'2026-11-08T00:00:00Z'},summary:category,render:{metric:'sleepStage'}}));
 const gl={getLayerIds:()=>['user-events'],getLayer:()=>({name:'Account'}),events:new Map([['user-events',events]])};
 const lanes=project(gl,['Garmin Sleep','Garmin Activity','Garmin Workout'],'Garmin');
 assert.deepEqual(lanes.map(e=>normalize(e).lane),['Sleep','Heart','Activities']);
 assert.ok(lanes.every(e=>normalize(e).project==='Garmin' && !normalize(e).access.canWrite));
 assert.equal(events[0].work,undefined);
 assert.equal(lanes[0].render,events[0].render);
 gl.events.get('user-events').push({...events[0],uid:'new-night'});
 assert.equal(project(gl,['Garmin Sleep'],'Garmin').length,2);
});
test('Separate viewer layers remain supported without leaking unrelated calendars',()=>{
 const gl={getLayerIds:()=>['sleep'],getLayer:()=>({name:'Sleep'}),events:new Map([['sleep',[{uid:'one'}]]])};
 assert.equal(project(gl,['Sleep'],'Health').length,1);
 assert.equal(project(gl,['Other'],'Other').length,0);
});
