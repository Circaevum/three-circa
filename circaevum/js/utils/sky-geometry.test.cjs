const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const names = ['resolveDayFrameLteSkySourcePositions','getSkyGeometryScratch','commitSkyGeometryPositions','applyDayFrameLteSkyInterstellarWarp','flattenListHorizonPositionArray'];
function load(path) {
 const source=fs.readFileSync(path,'utf8');
 const ctx={Float32Array, amount:0, window:{flattenTimelineFocusY:()=>12}, getActiveTimelineFlattenAmount:()=>ctx.amount, contextSphereState:{radius:10}, ContextSphereWarp:{isWarpModeEnabled:()=>ctx.warp, getCameraInsideCached:()=>ctx.inside, getSceneYSelectedWeekWarpAmount:()=>0.75, warpLtePointToRing:p=>({x:p.x+2,y:p.y-3,z:p.z+4})}};
 vm.createContext(ctx);
 for(const name of names){const start=source.indexOf('function '+name+'(');if(start<0)continue;const end=source.indexOf('\n}',start)+2;vm.runInContext(source.slice(start,end),ctx);}
 return ctx;
}
function geometry(){return {userData:{listHorizonLogical:new Float32Array([1,2,3,4,5,6,7,8,9])},attributes:{position:{array:new Float32Array(9),needsUpdate:false}},normals:0,bounds:0,computeVertexNormals(){this.normals++},computeBoundingSphere(){this.bounds++}};}
const after=load(path.join(__dirname, '../main.js'));

const a=geometry(), b=geometry();
for(const [amount,warp,inside] of [[0,false,false],[.4,false,false],[.4,true,false],[.4,true,true],[0,false,false],[1,true,false]]){
 Object.assign(after,{amount,warp,inside});
 after.applyDayFrameLteSkyInterstellarWarp(b);
 const expected=Array.from(a.userData.listHorizonLogical, (v,i)=>{
   const base=i%3===1 && amount>.001 ? v*(1-amount)+12*amount : v;
   return Math.fround(base)+(warp && !inside ? [2,-3,4][i%3] : 0);
 });
 assert.deepEqual(b.attributes.position.array,new Float32Array(expected));
 const normals=b.normals, scratch=b.userData.skyWarpScratch;b.attributes.position.needsUpdate=false;
 for(let i=0;i<120;i++)after.applyDayFrameLteSkyInterstellarWarp(b);
 assert.equal(b.normals,normals);assert.equal(b.attributes.position.needsUpdate,false);assert.equal(b.userData.skyWarpScratch,scratch);
}
const target=new Float32Array(9), bands=new Float32Array([1,2,3]);
assert.deepEqual(after.flattenListHorizonPositionArray(a.userData.listHorizonLogical,12,.6,bands,target),new Float32Array([1,8.6,3,4,10.4,6,7,12.2,9]));
assert.equal(after.flattenListHorizonPositionArray(a.userData.listHorizonLogical,12,.6,bands,target),target);
console.log('PASS: identical vertices across flatten/warp/inside transitions; 120 settled frames per state cause zero uploads/normal rebuilds; scratch buffers reused.');
