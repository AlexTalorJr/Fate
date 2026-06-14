// regress.js — regression suite for PHASE core (front-intersection mechanic)
const C=require("./core.js");
let pass=0,fail=0; const fails=[];
function ok(name,cond){ if(cond){pass++;} else {fail++;fails.push(name);} }
function approx(a,b,e=1e-6){ return Math.abs(a-b)<e; }
globalThis.__FIELD_W=1280; globalThis.__FIELD_H=720;

// progression
ok("speed grows with level", C.speedForLevel(5)>C.speedForLevel(1));
ok("level1 speed is base", approx(C.speedForLevel(1),C.CFG.FIELD_SPEED));
ok("threshold monotonic", C.levelThreshold(3)>C.levelThreshold(2)&&C.levelThreshold(2)>C.levelThreshold(1));
ok("tones start at 1", C.tonesAtLevel(1)===1);
ok("tones unlock by 4", C.tonesAtLevel(4)===2);
ok("tones cap at 4", C.tonesAtLevel(50)===4);
ok("markLife shrinks", C.markLife(10)<C.markLife(1));
ok("markLife floored", C.markLife(100)>=3.0);
ok("spawnEvery shrinks", C.spawnEvery(10)<C.spawnEvery(1));
ok("spawnEvery floored", C.spawnEvery(100)>=0.85);

// field math (visual layer)
(function(){
  const t=1,spd=C.speedForLevel(1),s={x:0,y:0,born:0,tone:0};
  ok("front amplitude positive", C.fieldAt(spd,0,t,[s],[],1)>0);
  ok("ahead of front ~0", approx(C.fieldAt(spd+500,0,t,[s],[],1),0));
})();

// circle intersection geometry
(function(){
  ok("two overlapping circles -> 2 pts", C.circleIntersections(0,0,5,8,0,5).length===2);
  ok("far circles -> 0 pts", C.circleIntersections(0,0,5,100,0,5).length===0);
  ok("contained circle -> 0 pts", C.circleIntersections(0,0,10,1,0,2).length===0);
  const p=C.circleIntersections(0,0,5,8,0,5)[0];
  ok("intersection lies on both circles", approx(Math.hypot(p.x,p.y),5,1e-6)&&approx(Math.hypot(p.x-8,p.y),5,1e-6));
})();

// frontRadius / decay
(function(){
  const spd=C.speedForLevel(1), s={x:0,y:0,born:0,tone:0};
  ok("frontRadius grows", C.frontRadius(s,1,spd)>C.frontRadius(s,0.5,spd));
  ok("frontRadius -1 before born", C.frontRadius({x:0,y:0,born:2,tone:0},1,spd)===-1);
  ok("frontRadius -1 after life", C.frontRadius(s,C.CFG.SOURCE_LIFE+1,spd)===-1);
  ok("decay 1 at birth", approx(C.sourceDecay(s,0),1));
  ok("decay 0 at end", approx(C.sourceDecay(s,C.CFG.SOURCE_LIFE),0));
})();

// CORE MECHANIC: staggered-timing fronts still produce a hit
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0};
  const s2={x:840,y:360,born:0.5,tone:0};   // dropped later — realistic
  let hit=null;
  for(let t=0;t<3;t+=0.02){const h=C.evalMark(m,t,[s1,s2],level); if(h){hit=h;break;}}
  ok("staggered fronts produce a focus", hit!==null);
  ok("focus reports 2 contributors", hit && hit.contributors===2);
  ok("same-tone focus is pure", hit && hit.pure===true);
})();

// single source cannot score
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0};
  let any=false;
  for(let t=0;t<4;t+=0.02){ if(C.evalMark(m,t,[s1],level)) any=true; }
  ok("single source never scores", any===false);
})();

// hit mark returns null
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:true,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:0};
  ok("hit mark ignored", C.evalMark(m,1.5,[s1,s2],level)===null);
})();

// wrong tone only -> no score (need >=1 same tone)
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:1}, s2={x:840,y:360,born:0,tone:1};
  let any=false;
  for(let t=0;t<3;t+=0.02){ if(C.evalMark(m,t,[s1,s2],level)) any=true; }
  ok("all-wrong-tone never scores", any===false);
})();

// mixed tone -> scores but not pure
(function(){
  const level=1, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:false,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:1};
  let hit=null;
  for(let t=0;t<3;t+=0.02){const h=C.evalMark(m,t,[s1,s2],level); if(h){hit=h;break;}}
  ok("mixed tone scores", hit!==null);
  ok("mixed tone not pure", hit && hit.pure===false);
})();

// superposition needs 3 sources
(function(){
  const level=7, m={x:640,y:360,tone:0,hit:false,r:22,isSuper:true,life:10};
  const s1={x:440,y:360,born:0,tone:0}, s2={x:840,y:360,born:0,tone:0};
  let with2=false;
  for(let t=0;t<3;t+=0.02){ if(C.evalMark(m,t,[s1,s2],level)) with2=true; }
  ok("super needs 3 (2 insufficient)", with2===false);
  const s3={x:640,y:160,born:0,tone:0};
  let with3=false;
  for(let t=0;t<3;t+=0.02){ if(C.evalMark(m,t,[s1,s2,s3],level)) with3=true; }
  ok("super scores with 3", with3===true);
})();

// scoreHit
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

// prediction
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

// fuzz: no NaN / no throw
(function(){
  let bad=0;
  for(let i=0;i<3000;i++){
    const level=1+Math.floor(Math.random()*30), t=Math.random()*6;
    const src=[]; const n=Math.floor(Math.random()*6);
    for(let j=0;j<n;j++)src.push({x:Math.random()*1280,y:Math.random()*720,born:Math.random()*t,tone:Math.floor(Math.random()*4)});
    const m={x:Math.random()*1280,y:Math.random()*720,tone:Math.floor(Math.random()*4),hit:false,r:22,isSuper:Math.random()<0.2,life:1+Math.random()*8};
    if(!isFinite(C.fieldAt(m.x,m.y,t,src,[],level)))bad++;
    const h=C.evalMark(m,t,src,level);
    if(h&&(!isFinite(h.contributors)))bad++;
    if(h){const sc=C.scoreHit(h,1+Math.floor(Math.random()*20),Math.random()<.5,Math.random()<.5); if(!isFinite(sc)||sc<0)bad++;}
    C.isNearMiss(m,t,src,level);
    const p=C.predictDrop(Math.random()*1280,Math.random()*720,t,src,[m],level);
    if(p&&!isFinite(p.quality))bad++;
  }
  ok("no NaN across 3000 fuzz iters", bad===0);
})();

// charge economy
ok("source cost < full", C.CFG.SOURCE_COST<1);
ok("refund < 1", C.CFG.CHARGE_REFUND<1);
ok("regen positive", C.CFG.CHARGE_REGEN>0);

console.log(`\nPHASE regression: ${pass} passed, ${fail} failed`);
if(fail){console.log("FAILURES:\n - "+fails.join("\n - "));process.exit(1);}
console.log("ALL GREEN\n");
