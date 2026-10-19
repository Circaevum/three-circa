// Executes the actual existing JS calculation module as the parity oracle.
const {spawnSync}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const js=require('../../circaevum/js/aevum/helical-projection.js');
const build=spawnSync('cargo',['build','--offline','--locked','--example','parity'],{cwd:__dirname,encoding:'utf8'});if(build.status!==0)throw Error(build.stderr);
const exe=path.join(__dirname,'target/debug/examples/parity');
const fixtures=[[0,100,10,100,1,0,2,100],[100,0,10,-50,2,1.3,64,200],[3,3,0,3,.24,-2,1,10]];
let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<50;i++)fixtures.push([(random()-.5)*1e4,(random()-.5)*1e4,random()*100,(random()-.5)*1e4,.1+random()*20,(random()-.5)*10,1+Math.floor(random()*128),1+random()*500]);
function close(a,b){assert.ok(Number.isFinite(a)&&Number.isFinite(b));assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);}
for(const f of fixtures){const run=spawnSync(exe,f.map(String),{encoding:'utf8'});if(run.status!==0)throw Error(run.stderr);const rust=JSON.parse(run.stdout),[a,b,r,c,p,s,n,h]=f;
const point=js.point(r,s,c,1);[point.x,point.y,point.z].forEach((v,i)=>close(rust.point[i],v));close(rust.theta,js.thetaFromHeight(b,c,p,s,h));const expected=js.sampleHelix(...f);assert.equal(rust.points.length,expected.length);expected.forEach((v,i)=>close(rust.points[i],v));}
console.log(`PASS: ${fixtures.length} Rust/JS parity fixtures (forward/reversed/zero spans and parameterized periods/scales)`);
