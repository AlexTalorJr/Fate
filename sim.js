// sim.js — headless runtime test for PHASE. Mocks DOM/canvas/audio.
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const noop=()=>{};
function ctx(){return new Proxy({},{get:(t,p)=>{
  if(p==="createImageData")return (w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h});
  if(p==="createRadialGradient"||p==="createLinearGradient")return ()=>({addColorStop:noop});
  if(p==="getBoundingClientRect")return ()=>({left:0,top:0,width:1280,height:720});
  return noop;},set:()=>true});}
const els={};
function el(id){return{id,style:{},classList:{add:noop,remove:noop,toggle:noop},textContent:"",innerHTML:"",
  appendChild:noop,addEventListener(e,f){(this._ev=this._ev||{})[e]=f;},
  getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),getContext:()=>ctx(),width:1280,height:720};}
["cField","c","lvlv","scorev","combov","combo","chainfill","charge","chargeOver","overlab","flash",
 "toast","toastT1","toastT2","coach","coach1","coach2","keyhint","hud","chargeWrap","startBtn","skipBtn",
 "againBtn","intro","over","finalScore","bestScore","finalLvl","finalChain","rankLine","overTag",
 "unlockList","overTip","lvl"].forEach(i=>els[i]=el(i));
global.window={addEventListener(e,f){(this._ev=this._ev||{})[e]=f;},innerWidth:1280,innerHeight:720,devicePixelRatio:1};
global.document={getElementById:i=>els[i]||el(i),createElement:()=>el("t"),addEventListener:noop};
global.localStorage={_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=""+v;}};
let raf=null; global.requestAnimationFrame=cb=>{raf=cb;return 1;};
let now=0; global.performance={now:()=>now};
global.AudioContext=function(){return{currentTime:0,state:"running",resume:noop,
  createOscillator:()=>({type:"",frequency:{value:0},connect:noop,start:noop,stop:noop}),
  createGain:()=>({gain:{value:0,setValueAtTime:noop,linearRampToValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop}),destination:{}};};
global.webkitAudioContext=global.AudioContext;
global.PHASE_CORE=null;
eval(scripts[0].replace("const PHASE_CORE=","global.PHASE_CORE="));
eval(scripts[1]);

function click(x,y){els.c._ev.pointermove({clientX:x,clientY:y});els.c._ev.pointerdown({clientX:x,clientY:y});}
let errors=[];
function pump(){ if(raf){const cb=raf;raf=null;try{cb(now);}catch(e){errors.push(e.message);}} }

// ---- Run A: tutorial path ----
els.startBtn._ev.click();
for(let f=0;f<60*30;f++){ // 30s
  now+=1000/60;
  // tap whatever DROP HERE ghost expects: tutorial forces position, so any click works for step 0/1;
  // for step 3 we click near center to try to score (won't always, but shouldn't crash)
  if(f%8===0) click(560+Math.random()*160, 320+Math.random()*120);
  pump();
  if(errors.length>5)break;
}
const afterTut={taught:global.localStorage.getItem("phase_taught"),state_score:els.scorev.textContent};

// ---- Run B: skip path + 5 min stress ----
els.skipBtn._ev.click();
for(let f=0;f<60*60*5;f++){ // 5 min
  now+=1000/60;
  if(f%9===0) click(150+Math.random()*980, 180+Math.random()*460);
  if(f%150===0) try{global.window._ev.keydown({code:"Space",preventDefault(){}});}catch(e){errors.push("space:"+e.message);}
  pump();
  if(errors.length>5)break;
}

const out={tutErrorsAndStress:errors.slice(0,8),errorCount:errors.length,
  taughtFlag:afterTut.taught, finalScore:els.scorev.textContent, level:els.lvlv.textContent,
  best:global.localStorage.getItem("phase_best"), runs:global.localStorage.getItem("phase_runs")};
console.log(JSON.stringify(out,null,2));
if(errors.length){console.log("\nSIM: FAILED");process.exit(1);}
console.log("\nSIM: clean — tutorial + 5min stress, no runtime errors");
