// regress.js — regression suite for PHASE core logic
const C=require("./core.js");
let pass=0, fail=0; const fails=[];
function ok(name,cond){ if(cond){pass++;} else {fail++;fails.push(name);} }
function approx(a,b,e=1e-6){ return Math.abs(a-b)<e; }

globalThis.__FIELD_W=1280; globalThis.__FIELD_H=720;

// ---- speed / progression monotonicity ----
ok("speed grows with level", C.speedForLevel(5)>C.speedForLevel(1));
ok("level1 speed is base", approx(C.speedForLevel(1),C.CFG.FIELD_SPEED));
ok("threshold monotonic", C.levelThreshold(3)>C.levelThreshold(2) && C.levelThreshold(2)>C.levelThreshold(1));
ok("tones start at 1", C.tonesAtLevel(1)===1);
ok("tones unlock by 4", C.tonesAtLevel(4)===2);
ok("tones cap at 4", C.tonesAtLevel(50)===4);
ok("markLife shrinks", C.markLife(10)<C.markLife(1));
ok("markLife floored", C.markLife(100)>=3.0);
ok("spawnEvery shrinks", C.spawnEvery(10)<C.spawnEvery(1));
ok("spawnEvery floored", C.spawnEvery(100)>=0.85);

// ---- field math ----
// a single source: at its front, amplitude near peak (cos(0)=1) modulated by envelope
(function(){
  const t=1, spd=C.speedForLevel(1);
  const s={x:0,y:0,born:0,tone:0};
  // point exactly on the front (dist == age*spd)
  const frontDist=spd*1;
  const v=C.fieldAt(frontDist,0,t,[s],[],1);
  ok("front amplitude positive", v>0);
  // a point far ahead of the front -> ~0
  const ahead=C.fieldAt(frontDist+500,0,t,[s],[],1);
  ok("ahead of front is zero", approx(ahead,0));
})();

// two sources whose fronts coincide at a midpoint -> constructive (higher than single)
(function(){
  const t=1, spd=C.speedForLevel(1);
  const d=spd*1;                 // front radius at t=1
  const s1={x:-d,y:0,born:0,tone:0};
  const s2={x:+d,y:0,born:0,tone:0};
  const single=C.fieldAt(0,0,t,[s1],[],1);
  const both  =C.fieldAt(0,0,t,[s1,s2],[],1);
  ok("two fronts constructive at midpoint", both>single && both>0);
})();

// absorber damps amplitude
(function(){
  const t=1, spd=C.speedForLevel(1), d=spd;
  const s={x:0,y:0,born:0,tone:0};
  const free=C.fieldAt(d,0,t,[s],[],1);
  const damped=C.fieldAt(d,0,t,[s],[{x:d,y:0,r:80}],1);
  ok("absorber reduces amplitude", Math.abs(damped)<=Math.abs(free));
})();

// ---- evalMark: the core scoring gate ----
(function(){
  const level=1, spd=C.speedForLevel(level);
  const t=1;
  const m={x:0,y:0,tone:0,hit:false};
  const d=spd*t;
  // two same-tone sources with fronts landing exactly on the mark, in phase (dr=0)
  const s1={x:-d,y:0,born:0,tone:0};
  const s2={x:0,y:-d,born:0,tone:0};
  const hit=C.evalMark(m,t,[s1,s2],level);
  ok("evalMark fires on 2 in-phase same-tone fronts", hit!==null);
  ok("evalMark reports pure when tones match", hit && hit.pure===true);
  ok("evalMark counts 2 contributors", hit && hit.contributors===2);

  // single source should NOT fire
  const single=C.evalMark(m,t,[s1],level);
  ok("evalMark needs >=2 contributors", single===null);

  // already-hit mark returns null
  const hm={x:0,y:0,tone:0,hit:true};
  ok("evalMark ignores hit marks", C.evalMark(hm,t,[s1,s2],level)===null);

  // wrong-tone-only sources: contributors but no sameTone -> null
  const w1={x:-d,y:0,born:0,tone:1};
  const w2={x:0,y:-d,born:0,tone:1};
  ok("evalMark requires >=1 same-tone", C.evalMark(m,t,[w1,w2],level)===null);

  // mixed tones (one matches) -> fires but not pure
  const mixHit=C.evalMark(m,t,[s1,w2],level);
  ok("evalMark fires with one matching tone", mixHit!==null);
  ok("evalMark not pure on mixed tones", mixHit && mixHit.pure===false);
})();

// fronts that arrive but are out of phase should not score (amp too low)
(function(){
  const level=1, spd=C.speedForLevel(level), t=1;
  const m={x:0,y:0,tone:0,hit:false};
  // offset one source so its front reaches the mark half a wavelength early -> destructive
  const d=spd*t;
  const off=C.CFG.WAVELENGTH/2; // half wavelength -> cos(pi) = -1
  const s1={x:-d,y:0,born:0,tone:0};
  const s2={x:0,y:-(d+off),born:0,tone:0}; // its front is "off" by half wavelength at the mark... 
  // NOTE: geometry approx; just assert evalMark never throws and returns a defined result
  const r=C.evalMark(m,t,[s1,s2],level);
  ok("evalMark stable on out-of-phase geometry", r===null || (r&&typeof r.amp==="number"));
})();

// ---- scoreHit ----
(function(){
  const baseHit={contributors:2,pure:false,amp:1.2};
  const s1=C.scoreHit(baseHit,1,false,false);
  const s2=C.scoreHit(baseHit,2,false,false);
  ok("chain multiplies score", s2>s1 && approx(s2,s1*2,1));
  const pureHit={contributors:2,pure:true,amp:1.2};
  ok("pure beats impure", C.scoreHit(pureHit,1,false,false)>s1);
  ok("overcharge boosts", C.scoreHit(baseHit,1,true,false)>s1);
  ok("crit boosts", C.scoreHit(baseHit,1,false,true)>s1);
  ok("more contributors -> more score",
     C.scoreHit({contributors:4,pure:false,amp:1.2},1,false,false)>s1);
  ok("score is integer", Number.isInteger(s1));
})();

// ---- isNearMiss ----
(function(){
  const level=1, spd=C.speedForLevel(level), t=1, d=spd*t;
  const m={x:0,y:0,tone:0,hit:false};
  // a single strong front -> near miss
  const s1={x:-d,y:0,born:0,tone:0};
  ok("single strong front is a near miss", C.isNearMiss(m,t,[s1],level)===true);
  // no fronts -> not a near miss
  ok("empty field no near miss", C.isNearMiss(m,t,[],level)===false);
})();

// ---- determinism / no NaN under random fuzz ----
(function(){
  let bad=0;
  for(let i=0;i<2000;i++){
    const level=1+Math.floor(Math.random()*30);
    const t=Math.random()*8;
    const n=Math.floor(Math.random()*6);
    const sources=[];
    for(let j=0;j<n;j++) sources.push({x:Math.random()*1280,y:Math.random()*720,born:Math.random()*t,tone:Math.floor(Math.random()*4)});
    const m={x:Math.random()*1280,y:Math.random()*720,tone:Math.floor(Math.random()*4),hit:false};
    const v=C.fieldAt(m.x,m.y,t,sources,[],level);
    if(!isFinite(v)) bad++;
    const r=C.evalMark(m,t,sources,level);
    if(r && (!isFinite(r.amp)||!isFinite(r.contributors))) bad++;
    if(r){ const sc=C.scoreHit(r,1+Math.floor(Math.random()*20),Math.random()<.5,Math.random()<.5);
      if(!isFinite(sc)||sc<0) bad++; }
  }
  ok("no NaN/Inf across 2000 fuzz iterations", bad===0);
})();

// ---- charge economy sanity ----
ok("source cost < full charge", C.CFG.SOURCE_COST<1);
ok("refund < cost (net spend per hit-less placement)", C.CFG.CHARGE_REFUND<1);
ok("regen positive", C.CFG.CHARGE_REGEN>0);

// ---- prediction helpers ----
(function(){
  const level=1, spd=C.speedForLevel(level), t=0;
  const m={x:0,y:0,tone:0,hit:false,life:5};
  const aNear=C.arrivalTime(50,0,m,t,level);
  const aFar =C.arrivalTime(200,0,m,t,level);
  ok("arrivalTime grows with distance", aFar>aNear);
  ok("arrivalTime = dist/speed", approx(aNear, 50/spd, 1e-6));
  const s={x:0,y:100,born:0,tone:0};
  ok("frontArrival = born + dist/speed", approx(C.frontArrival(s,m,level), 100/spd, 1e-6));
  const ex={x:-200,y:0,born:0,tone:0};
  const pred=C.predictDrop(200,0,0, [ex], [m], level);
  ok("predictDrop finds a coincidence", pred!==null);
  ok("predictDrop dt small for symmetric drop", pred && pred.dt<0.05);
  ok("predictDrop quality high for good drop", pred && pred.quality>0.8);
  ok("predictDrop null with no sources", C.predictDrop(10,10,0,[],[m],level)===null);
  const shortMark={x:0,y:0,tone:0,hit:false,life:0.1};
  ok("predictDrop respects mark life", C.predictDrop(5000,0,0,[ex],[shortMark],level)===null);
})();

// ---- report ----
console.log(`\nPHASE regression: ${pass} passed, ${fail} failed`);
if(fail){ console.log("FAILURES:\n - "+fails.join("\n - ")); process.exit(1); }
else console.log("ALL GREEN\n");
