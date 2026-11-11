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

test('fetched lanes do not depend on scene cache, visibility, or duration LOD',()=>{
 const {projectFetched}=require('./calendar-lane-events.js');
 const events=[1,60,86400,31536000].map((seconds,i)=>({uid:String(i),category:'Calendar A',dtstart:{dateTime:'2026-11-09T00:00:00Z'},dtend:{dateTime:new Date(Date.parse('2026-11-09T00:00:00Z')+seconds*1000).toISOString()}}));
 assert.equal(projectFetched(events,['Calendar A'],'Basic calendars').length,4);
 assert.equal(projectFetched(events,['Other'],'Basic calendars').length,0);
 assert.equal(events[0].work,undefined);
});
test('calendar lane selection survives arrival of calendar and owner metadata',()=>{
 const {rowKey}=require('./calendar-lane-events.js');
 const empty={project:'Basic calendars',lane:'Calendar A',access:{},event:{}};
 const fetched={...empty,access:{ownerId:'owner'},event:{calendarId:'google-calendar'}};
 assert.equal(rowKey(empty,'layers'),rowKey(fetched,'layers'));
 assert.notEqual(rowKey(empty,'layers'),rowKey({...fetched,lane:'Calendar B'},'layers'));
});

test('Garmin Health selection always includes structured lanes, Basic stays custom',()=>{
 const {selectionNames}=require('./calendar-lane-events.js');
 assert.deepEqual(selectionNames(['Garmin Sleep'],'Garmin','health'),['Garmin Workout','Garmin Sleep','Garmin Activity']);
 assert.deepEqual(selectionNames(['Garmin Sleep'],'Garmin','basic'),['Garmin Sleep']);
 assert.deepEqual(selectionNames(['Research'],'Project','work'),['Research']);
});

test('Heart overlay clips samples to the ruler and keeps chronological order',()=>{
 const {heartTrace}=require('./calendar-lane-events.js');
 const items=[{start:1000,event:{render:{summary:[{tOff:20,v:72},{tOff:10,v:71},{tOff:40,v:80}]}}}];
 assert.deepEqual(heartTrace(items,1010,1040),[[1010,71],[1020,72]]);
});
