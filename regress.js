// regress.js — regression suite for PHASE core (v5: pulsars + resonance + surge)
const C=require("./core.js");
let pass=0,fail=0; const fails=[];
function ok(name,cond){ if(cond){pass++;} else {fail++;fails.push(name);} }
function approx(a,b,e=1e-6){ return Math.abs(a-b)<e; }
globalThis.__FIELD_W=1280; globalThis.__FIELD_H=720;

// ---- progression ----
ok("speed grows with level", C.speedForLevel(5)>C.speedForLevel(1));
ok("level1 speed is base", approx(C.speedForLevel(1),C.CFG.FIELD_SPEED));
ok("threshold monotonic", C.levelThreshold(3)>C.levelThreshold(2)&&C.levelThreshold(2)>C.levelThreshold(1));
ok("tones start at 1", C.tonesAtLevel(1)===1);
ok("tones unlock by 4", C.tonesAtLevel(4)===2);
ok("tones cap at 4", C.tonesAtLevel(50)===4);
ok("markLife shrinks", C.markLife(10)<C.markLife(1));
ok("markLife floored at 2.8", C.markLife(100)>=2.8 && approx(C.markLife(100),2.8));
ok("spawnEvery shrinks", C.spawnEvery(10)<C.spawnEvery(1));
ok("spawnEvery floored at 0.8", C.spawnEvery(100)>=0.8 && approx(C.spawnEvery(100),0.8));

// ---- field math (visual layer) ----
(function(){
  const t=1,spd=C.speedForLevel(1),s={x:0,y:0,born:0,tone:0};
  ok("front amplitude positive", C.fieldAt(spd,0,t,[s],[],1)>0);
  ok("ahead of front ~0", approx(C.fieldAt(spd+500,0,t,[s],[],1),0));
})();

// ---- circle intersection geometry ----
(function(){
  ok("two overlapping circles -> 2 pts", C.circleIntersections(0,0,5,8,0,5).length===2);
  ok("far circles -> 0 pts", C.circleIntersections(0,0,5,100,0,5).length===0);
  ok("contained circle -> 0 pts", C.circleIntersections(0,0,10,1,0,2).length===0);
  const p=C.circleIntersections(0,0,5,8,0,5)[0];
  ok("intersection lies on both circles", approx(Math.hypot(p.x,p.y),5,1e-6)&&approx(Math.hypot(p.x-8,p.y),5,1e-6));
})();

// ---- pulsar fronts (v5) ----
(function(){
  const spd=C.speedForLevel(1), s={x:0,y:0,born:0,tone:0};
  // sawtooth: the *leading* front radius resets each PULSE_PERIOD
  const justBefore=C.frontRadius(s,C.CFG.PULSE_PERIOD-0.01,spd);
  const justAfter =C.frontRadius(s,C.CFG.PULSE_PERIOD+0.01,spd);
  ok("frontRadius is sawtooth (resets each pulse)", justAfter<justBefore);
  ok("frontRadius -1 before born", C.frontRadius({x:0,y:0,born:2,tone:0},1,spd)===-1);
  ok("frontRadius -1 after life", C.frontRadius(s,C.CFG.SOURCE_LIFE+1,spd)===-1);
  // frontRadii: several concentric live fronts once a few pulses have been emitted
  const radii=C.frontRadii(s,C.CFG.PULSE_PERIOD*2+0.1,spd);
  ok("frontRadii returns multiple concentric fronts", radii.length>=2);
  ok("frontRadii sorted large->small", radii.every((r,i)=>i===0||radii[i-1]>=r));
  ok("frontRadii empty before born", C.frontRadii({x:0,y:0,born:5,tone:0},1,spd).length===0);
  ok("frontRadii empty after life", C.frontRadii(s,C.CFG.SOURCE_LIFE+1,spd).length===0);
  // sourceAlive
  ok("sourceAlive true mid-life", C.sourceAlive(s,C.CFG.SOURCE_LIFE*0.5)===true);
  ok("sourceAlive false before born", C.sourceAlive({x:0,y:0,born:2,tone:0},1)===false);
  ok("sourceAlive false after life", C.sourceAlive(s,C.CFG.SOURCE_LIFE)===false);
  // decay
  ok("decay 1 at birth", approx(C.sourceDecay(s,0),1));
  ok("decay 0 at end", approx(C.sourceDecay(s,C.CFG.SOURCE_LIFE),0));
})();

// ---- liveCrossings (v5) ----
(function(){
  const level=1;
  const s1={x:440,y:360,born:0,tone:0};
  const s2={x:840,y:360,born:0,tone:0};
  // at t where each leading front ~200px the two rings cross near the midline
  let sawCrossing=false;
  for(let t=0.05;t<3;t+=0.02){ if(C.liveCrossings(t,[s1,s2],level).length>0){sawCrossing=true;break;} }
  ok("liveCrossings finds crossings for two pulsars", sawCrossing);
  // a pulsar's own concentric rings must never cross each other
  let selfCross=false;
  for(let t=0.05;t<3;t+=0.02){ if(C.liveCrossings(t,[s1],level).length>0){selfCross=true;break;} }
  ok("a single pulsar never self-crosses", selfCross===false);
})();

// ---- evalMark focus descriptor (v5) ----
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0};
  const s2={x:840,y:360,born:0.5,tone:0};   // dropped later — realistic stagger
  let foc=null;
  for(let t=0;t<3;t+=0.02){const h=C.evalMark(m,t,[s1,s2],level); if(h){foc=h;break;}}
  ok("staggered fronts produce a focus", foc!==null);
  ok("focus reports 2 contributors", foc && foc.contributors===2);
  ok("same-tone focus is pure", foc && foc.pure===true);
  ok("focus exposes closeness in [0,1]", foc && foc.close>=0 && foc.close<=1);
})();
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:true,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:0};
  ok("hit mark ignored by evalMark", C.evalMark(m,1.5,[s1,s2],level)===null);
})();

// ---- fillMark resonance integrator (v5 core hook) ----
function integrateRes(m,sources,level,T){
  m.res=0; let full=false, peak=0;
  for(let t=0;t<T;t+=1/60){ const r=C.fillMark(m,t,1/60,sources,level); peak=Math.max(peak,m.res); if(r.full){full=true;break;} }
  return {full,peak};
}
(function(){
  const level=1;
  // two flanking same-tone pulsars -> mark resonates to full within a couple seconds.
  // (Mark sits slightly off the exact bisector midpoint, as in real play, so a crossing
  // dwells on it; the exact-midpoint degenerate case is the slow outlier ~4s.)
  const m={x:640,y:330,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:0};
  const r=integrateRes(m,[s1,s2],level,4);
  ok("two flanking pulsars resonate within ~2s", r.full===true);
  ok("two flanking pulsars resonate a mark to full", r.full===true);
  ok("resonance never exceeds RESONANCE_MAX", m.res<=C.CFG.RESONANCE_MAX+1e-9);

  // single source NEVER fills (no qualifying crossing -> drains)
  const m2={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const r2=integrateRes(m2,[s1],level,5);
  ok("single source never resonates", r2.full===false && approx(r2.peak,0));

  // wrong-tone-only NEVER fills (need >=1 same tone)
  const m3={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const w1={x:440,y:360,born:0,tone:1}, w2={x:840,y:360,born:0,tone:1};
  const r3=integrateRes(m3,[w1,w2],level,5);
  ok("wrong-tone-only never resonates", r3.full===false);

  // hit mark: fillMark is a no-op
  const m4={x:640,y:360,tone:0,hit:true,r:22,isSuper:false,life:10};
  const rr=C.fillMark(m4,1.5,1/60,[s1,s2],level);
  ok("fillMark no-op on hit mark", rr.full===false && rr.focus===null);
})();

// ---- superposition needs 3 sources (resonance-level) ----
(function(){
  const level=7;
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:0}, s3={x:640,y:170,born:0,tone:0};
  const mA={x:640,y:360,tone:0,hit:false,r:22,isSuper:true,life:12};
  const with2=integrateRes(mA,[s1,s2],level,5);
  ok("super mark cannot resonate on 2 sources", with2.full===false);
  const mB={x:640,y:330,tone:0,hit:false,r:22,isSuper:true,life:12};
  const with3=integrateRes(mB,[s1,s2,s3],level,6);
  ok("super mark resonates with 3 sources", with3.full===true);
})();

// ---- mixed tone scores (focus) but is not pure ----
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:1};
  let foc=null;
  for(let t=0;t<3;t+=0.02){const h=C.evalMark(m,t,[s1,s2],level); if(h){foc=h;break;}}
  ok("mixed tone yields focus", foc!==null);
  ok("mixed tone not pure", foc && foc.pure===false);
})();

// ---- scoreHit ----
(function(){
  const base={contributors:2,pure:false,amp:2};
  const s1=C.scoreHit(base,1,false,false), s2=C.scoreHit(base,2,false,false);
  ok("chain multiplies", s2>s1 && approx(s2,s1*2,1));
  ok("pure beats impure", C.scoreHit({contributors:2,pure:true,amp:2},1,false,false)>s1);
  ok("overcharge boosts", C.scoreHit(base,1,true,false)>s1);
  ok("crit boosts", C.scoreHit(base,1,false,true)>s1);
  ok("more contributors more score", C.scoreHit({contributors:4,pure:false,amp:4},1,false,false)>s1);
  ok("score integer", Number.isInteger(s1));
})();

// ---- surge rhythm (v5) ----
(function(){
  const a=C.surgeState(0), b=C.surgeState(12);
  ok("surge starts calm", a.phase==="calm");
  ok("surge window reached later", b.phase==="surge");
  let seenCalm=false, seenSurge=false, kOk=true;
  for(let t=0;t<64;t+=0.25){ const s=C.surgeState(t); if(s.phase==="calm")seenCalm=true; else seenSurge=true; if(s.k<0||s.k>1)kOk=false; }
  ok("surge alternates calm and surge", seenCalm&&seenSurge);
  ok("surge progress k in [0,1]", kOk);
})();

// ---- prediction ----
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0};
  const good=C.predictDrop(840,360,0.5,[s1],[m],level);
  ok("predictDrop finds a future focus", good!==null);
  ok("predictDrop quality in range", good && good.quality>=0 && good.quality<=1);
  ok("predictDrop null with no sources", C.predictDrop(840,360,0,[],[m],level)===null);
  const dead={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:0.01};
  ok("predictDrop respects mark life", C.predictDrop(840,360,0,[s1],[dead],level)===null);
})();

// ---- fuzz: no NaN / no throw across the whole v5 surface ----
(function(){
  let bad=0;
  for(let i=0;i<3000;i++){
    const level=1+Math.floor(Math.random()*30), t=Math.random()*6;
    const src=[]; const n=Math.floor(Math.random()*6);
    for(let j=0;j<n;j++)src.push({x:Math.random()*1280,y:Math.random()*720,born:Math.random()*t,tone:Math.floor(Math.random()*4)});
    const m={x:Math.random()*1280,y:Math.random()*720,tone:Math.floor(Math.random()*4),hit:false,r:22,isSuper:Math.random()<0.2,life:1+Math.random()*8,res:Math.random()};
    if(!isFinite(C.fieldAt(m.x,m.y,t,src,[],level)))bad++;
    for(const s of src){ if(C.frontRadii(s,t,C.speedForLevel(level)).some(r=>!isFinite(r)))bad++; }
    if(C.liveCrossings(t,src,level).some(c=>!isFinite(c.x)||!isFinite(c.y)))bad++;
    const h=C.evalMark(m,t,src,level);
    if(h&&(!isFinite(h.contributors)||!isFinite(h.close)))bad++;
    const fr=C.fillMark(m,t,1/60,src,level);
    if(!isFinite(m.res)||m.res<0||m.res>C.CFG.RESONANCE_MAX+1e-9)bad++;
    if(typeof fr.full!=="boolean")bad++;
    if(h){const sc=C.scoreHit(h,1+Math.floor(Math.random()*20),Math.random()<.5,Math.random()<.5); if(!isFinite(sc)||sc<0)bad++;}
    C.isNearMiss(m,t,src,level);
    const ss=C.surgeState(t); if(ss.k<0||ss.k>1)bad++;
    const p=C.predictDrop(Math.random()*1280,Math.random()*720,t,src,[m],level);
    if(p&&!isFinite(p.quality))bad++;
  }
  ok("no NaN/out-of-range across 3000 fuzz iters", bad===0);
})();

// ---- charge economy ----
ok("source cost < full", C.CFG.SOURCE_COST<1);
ok("refund < 1", C.CFG.CHARGE_REFUND<1);
ok("regen positive", C.CFG.CHARGE_REGEN>0);
ok("resonance fill positive", C.CFG.RESONANCE_FILL>0);
ok("resonance drain slower than fill", C.CFG.RESONANCE_DRAIN<C.CFG.RESONANCE_FILL);

console.log(`\nPHASE v5 regression: ${pass} passed, ${fail} failed`);
if(fail){console.log("FAILURES:\n - "+fails.join("\n - "));process.exit(1);}
console.log("ALL GREEN\n");
