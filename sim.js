// sim.js — headless runtime test. Mocks DOM/canvas/audio, extracts the game IIFE
// from index.html, and simulates real play to catch runtime errors and check balance.
const fs=require("fs");
const html=fs.readFileSync(__dirname+"/index.html","utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);

// ---- minimal DOM / canvas / audio mocks ----
const elements={};
function mkEl(id){
  return {id,style:{},classList:{add(){},remove(){},toggle(){}},
    textContent:"",innerHTML:"",appendChild(){},
    addEventListener(ev,fn){ (this._ev=this._ev||{})[ev]=fn; },
    getBoundingClientRect:()=>({left:0,top:0,width:1280,height:720}),
    getContext:()=>mkCtx(),width:1280,height:720};
}
function mkCtx(){
  const noop=()=>{};
  return {setTransform:noop,clearRect:noop,fillRect:noop,beginPath:noop,arc:noop,fill:noop,
    stroke:noop,moveTo:noop,lineTo:noop,save:noop,restore:noop,strokeRect:noop,
    scale:noop,translate:noop,rotate:noop,closePath:noop,clip:noop,
    createRadialGradient:()=>({addColorStop:noop}),createLinearGradient:()=>({addColorStop:noop}),
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),
    putImageData:noop,drawImage:noop,setLineDash:noop,fillText:noop,
    set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set globalAlpha(v){},
    set shadowColor(v){},set shadowBlur(v){},set font(v){},set textAlign(v){},
    set globalCompositeOperation(v){},set imageSmoothingEnabled(v){},set lineDashOffset(v){}};
}
const docIds=["cField","c","lvlv","scorev","combov","combo","chainfill","charge","chargeOver",
  "overlab","flash","toast","toastT1","toastT2","startBtn","againBtn","intro","over",
  "finalScore","bestScore","finalLvl","finalChain","rankLine","overTag","unlockList","overTip","lvl"];
docIds.forEach(id=>elements[id]=mkEl(id));

global.window={addEventListener(ev,fn){(this._ev=this._ev||{})[ev]=fn;},
  innerWidth:1280,innerHeight:720,devicePixelRatio:1};
global.document={getElementById:id=>elements[id]||mkEl(id),
  createElement:()=>mkEl("tmp"),addEventListener(){}};
global.localStorage={_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=String(v);}};
let rafCb=null;
global.requestAnimationFrame=cb=>{rafCb=cb;return 1;};
global.performance={now:()=>simNow};
global.AudioContext=function(){return{currentTime:0,state:"running",resume(){},
  createOscillator:()=>({type:"",frequency:{value:0},connect(){},start(){},stop(){}}),
  createGain:()=>({gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}),
  destination:{}};};
global.webkitAudioContext=global.AudioContext;
global.PHASE_CORE=null;

let simNow=0;

// load core block then game block
eval(scripts[0].replace("const PHASE_CORE=","global.PHASE_CORE="));
eval(scripts[1]);

// drive: click start
elements.startBtn._ev.click();

// simulate frames. We need access to internal G — re-derive via window events.
// Strategy: pump rAF with advancing time, periodically fire pointerdown / space to play.
const cv=elements.c;
let errors=[];
let frames=0;
const FPS=60, dtMs=1000/FPS;
const SIM_SECONDS=180; // 3 minutes of play
const totalFrames=SIM_SECONDS*FPS;

// crude "AI": every ~12 frames, place two sources near a guessed meeting point.
// We don't have G, but we can fire DOM events the game listens to.
function clickAt(x,y,shift){
  if(shift) window._ev && window._ev.keydown && window._ev.keydown({code:"ShiftLeft",preventDefault(){}});
  cv._ev.pointermove({clientX:x,clientY:y});
  cv._ev.pointerdown({clientX:x,clientY:y});
  if(shift) window._ev && window._ev.keyup && window._ev.keyup({code:"ShiftLeft"});
}

let lastErr=null;
process.on("uncaughtException",e=>{lastErr=e;});

for(frames=0; frames<totalFrames; frames++){
  simNow+=dtMs;
  // play actions
  if(frames%10===0){
    const x=200+Math.random()*880, y=200+Math.random()*400;
    try{ clickAt(x,y, Math.random()<0.2); }catch(e){errors.push("click:"+e.message);}
  }
  if(frames%140===0){
    try{ window._ev.keydown({code:"Space",preventDefault(){}}); }catch(e){errors.push("space:"+e.message);}
  }
  try{
    if(rafCb){const cb=rafCb; rafCb=null; cb(simNow);}
  }catch(e){ errors.push("frame@"+frames+":"+e.message); if(errors.length>5)break; }
  if(lastErr){errors.push("uncaught@"+frames+":"+lastErr.message);lastErr=null;if(errors.length>5)break;}
}

// inspect resulting HUD text as a proxy for state progression
const out={
  frames,
  score:elements.scorev.textContent,
  level:elements.lvlv.textContent,
  chain:elements.combov.textContent,
  charge:elements.charge.style.width,
  errors:errors.slice(0,8),
  errorCount:errors.length,
  best:global.localStorage.getItem("phase_best"),
  peaklvl:global.localStorage.getItem("phase_peaklvl"),
  runs:global.localStorage.getItem("phase_runs"),
};
console.log(JSON.stringify(out,null,2));
if(errors.length){console.log("\nSIM: FAILED with runtime errors");process.exit(1);}
console.log("\nSIM: clean — "+frames+" frames, no runtime errors");
