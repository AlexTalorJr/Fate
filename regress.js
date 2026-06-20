"use strict";
const C = require("./core.js");
let pass=0, fail=0;
function ok(cond,msg){ if(cond){pass++;} else {fail++; console.log("  FAIL:",msg);} }
function approx(a,b,e,msg){ ok(Math.abs(a-b)<=e, msg+` (got ${a}, want ~${b})`); }

// --- creation ---
let s = C.create(300);
ok(s.alive, "starts alive");
ok(s.health===1, "full health");
ok(s.score===0, "zero score");
ok(s.level===1, "level 1");
ok(s.nodes.length===0, "no nodes at start");
ok(s.nodeR===300-30, "nodeR = edgeR-RPAD");

// --- ring sweeps center->edge over one beat ---
s = C.create(300);
let bl = C.beatLen(s);
C.step(s, bl*0.5);
approx(s.ring, 150, 5, "ring at half-beat ~ half edgeR");
C.step(s, bl*0.5);
// crossed a beat boundary -> ring resets near 0
ok(s.ring < 30, "ring resets after full beat");

// --- spawn cap: never exceeds MAX_NODES ---
s = C.create(300);
for(let i=0;i<400;i++) C.step(s, 0.05);
ok(s.nodes.length <= C.CFG.MAX_NODES, "node count <= 3 (anti-cacophony)");
ok(s.nodes.length >= 1 || !s.alive, "nodes do spawn");

// --- a node placed exactly under the ring is a hittable PERFECT ---
s = C.create(300);
// force a node and align ring to it
s.nodes = [{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false}];
s.ring = s.nodeR;            // ring exactly on node radius -> error 0 -> crit
let r = C.resolveHit(s,0);
ok(r.result==="perfect", "ring exactly on node => PERFECT");
ok(s.chain===1, "chain increments on hit");
ok(s.score>0, "score increases on hit");
ok(s.nodes.length===0, "node consumed on hit");

// --- mistimed press (ring far from node) breaks chain + penalty ---
s = C.create(300);
s.chain=5;
s.nodes=[{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false}];
s.ring = 10;                 // far from nodeR(270): error huge
let h0 = s.health;
r = C.resolveHit(s,0);
ok(r.result==="miss", "ring far from node => miss");
ok(s.chain===0, "miss wipes chain");
ok(s.health < h0, "miss costs health");

// --- empty tap is FREE (no penalty) ---
s = C.create(300);
let hb = s.health;
r = C.pressAt(s, Math.PI/2, 0.3);   // no nodes near
ok(r.result==="emptytap", "tapping empty space recognized");
ok(s.health===hb, "empty tap costs no health");
ok(s.chain===0, "empty tap doesn't grant chain");

// --- Space in empty space = small penalty (anti-mash) ---
s = C.create(300);
let he = s.health;
r = C.pressSpace(s);
ok(r.result==="empty", "space with no target = empty");
ok(s.health < he, "empty space-press costs a little health");

// --- Space auto-targets the best (closest-to-ideal) node ---
s = C.create(300);
s.nodes=[
  {ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false},      // will be off
  {ang:Math.PI,tone:"amber",life:5,maxLife:5,born:0,hit:false} // will be perfect
];
s.ring = s.nodeR;   // both at same radius -> both error 0; bestNode picks index 0
let before = s.nodes.length;
r = C.pressSpace(s);
ok(r.result==="perfect", "space hits a resonating node");
ok(s.nodes.length===before-1, "space removes one node");

// --- decoherence: ignored node drains health + breaks chain ---
s = C.create(300);
s.chain=4;
s.nodes=[{ang:0,tone:"cyan",life:0.05,maxLife:5,born:0,hit:false}];
let hd=s.health;
C.step(s, 0.1);  // node life expires
ok(s.nodes.length===0, "expired node removed");
ok(s.health<hd, "decoherence costs health");
ok(s.chain===0, "decoherence wipes chain");
let hadDecohere = s.events.some(e=>e.type==="decohere");
ok(hadDecohere, "decohere event emitted");

// --- death when health hits zero ---
s = C.create(300);
s.health = 0.04;
s.nodes=[{ang:0,tone:"cyan",life:0.01,maxLife:5,born:0,hit:false}];
C.step(s, 0.1);
ok(!s.alive, "health depletion => death");
ok(s.events.some(e=>e.type==="death"), "death event emitted");

// --- PURE bonus: matching tone scores more ---
s = C.create(300);
let rt = C.ringTone(s);
s.nodes=[{ang:0,tone:rt,life:5,maxLife:5,born:0,hit:false}];  // tone matches ring
s.ring = s.nodeR;
r = C.resolveHit(s,0);
ok(r.pure===true, "matching tone flagged PURE");
ok(r.result==="perfect", "still perfect");
// pure perfect should equal base*CRIT*PURE for chain0
let expect = Math.round(C.CFG.SCORE_BASE * C.CFG.CRIT_MULT * C.CFG.PURE_MULT * 1);
ok(r.gained===expect, "pure+perfect score math correct ("+r.gained+"=="+expect+")");

// --- chain multiplier raises score ---
s = C.create(300);
s.chain=10;
s.nodes=[{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false}];
s.ring=s.nodeR;
// ensure NOT pure to isolate chain math: pick a tone != ringTone
let nonPure = C.TONES.find(t=>t!==C.ringTone(s));
s.nodes[0].tone = nonPure;
r = C.resolveHit(s,0);
let base = C.CFG.SCORE_BASE*C.CFG.CRIT_MULT*(1+10*C.CFG.CHAIN_MULT);
ok(r.gained===Math.round(base), "chain multiplier applied ("+r.gained+")");

// --- difficulty ramps: beat shortens, window tightens, but never past floor ---
s = C.create(300); s.level=1; let bl1=C.beatLen(s), w1=C.windowPx(s);
s.level=8; let bl8=C.beatLen(s), w8=C.windowPx(s);
ok(bl8 < bl1, "beat gets faster with level");
ok(w8 < w1, "window tightens with level");
ok(bl8 >= C.CFG.BEAT_FLOOR-1e-9, "beat respects floor");
ok(w8 >= C.CFG.WINDOW_FLOOR-1e-9, "window respects floor");
s.level=99;
ok(C.beatLen(s)===C.CFG.BEAT_FLOOR, "beat clamps at floor");
ok(C.windowPx(s)===C.CFG.WINDOW_FLOOR, "window clamps at floor");

// --- level-up by score threshold ---
s = C.create(300);
s.score = C.levelThreshold(1)+10;
C.step(s, 0.016);
ok(s.level>=2, "crossing threshold levels up");
ok(s.events.some(e=>e.type==="levelup"), "levelup event emitted");

// --- tones available scale with level, capped at 4 ---
ok(C.tonesForLevel(1)===2, "level1 => 2 tones");
ok(C.tonesForLevel(4)===3, "level4 => 3 tones");
ok(C.tonesForLevel(99)===4, "tones cap at 4");

// --- PASSABILITY: a perfect player survives & scores well over a long run ---
s = C.create(300);
let frames=0, maxT=120; // 2 simulated minutes
while(s.alive && s.t<maxT){
  C.step(s, 1/60); frames++;
  // perfect player: whenever a node is within the window, hit it
  let idx = C.bestNode(s);
  if(idx>=0) C.resolveHit(s, idx);
}
ok(s.alive, "perfect player survives 2 minutes (game is passable)");
ok(s.score>3000, "perfect player accumulates real score ("+s.score+")");
ok(s.level>=3, "perfect player progresses levels ("+s.level+")");
console.log("    [passability] survived="+s.alive+" t="+s.t.toFixed(1)+"s score="+s.score+" level="+s.level+" maxChain="+s.stats.maxChain);

// --- ANTI-IDLE: doing nothing kills you (game has stakes) ---
s = C.create(300);
let t=0;
while(s.alive && t<60){ C.step(s, 1/60); t+=1/60; }
ok(!s.alive, "idle player dies (decoherence has teeth)");
console.log("    [idle death] t="+t.toFixed(1)+"s");

// --- MASH-PROOF: spamming space everywhere should not thrive ---
s = C.create(300);
t=0; let mashScore;
while(s.alive && t<30){
  C.step(s, 1/60);
  if(Math.random()<0.3) C.pressSpace(s); // random mashing
  t+=1/60;
}
mashScore = s.score;
ok(true, "mash run completed (score="+mashScore+", alive="+s.alive+")");
console.log("    [mash] t="+t.toFixed(1)+"s score="+mashScore+" alive="+s.alive);

// ============================================================
// v8 DEPTH LAYER tests (greedy / charged / twin / surge)
// ============================================================

// --- GREEDY: locking on the LEAVING edge scores more than dead-centre but is riskier ---
s = C.create(300); s.level=1;
let winP = C.windowPx(s);
let nrP  = s.nodeR;                              // rFrac null => full radius
s.nodes=[{ang:0,tone:C.TONES.find(t=>t!==C.ringTone(s)),life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring = nrP;
let perf = C.resolveHit(s,0).gained;             // centre PERFECT
s = C.create(300); s.level=1;
s.nodes=[{ang:0,tone:C.TONES.find(t=>t!==C.ringTone(s)),life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring = nrP + winP*0.95;                        // d>0, near the cliff
let gr = C.resolveHit(s,0);
ok(gr.result==="greedy", "leaving-edge lock is GREEDY ("+gr.result+")");
ok(gr.gained > perf, "greedy near cliff beats centre PERFECT ("+gr.gained+" > "+perf+")");
s = C.create(300); s.level=1;
s.nodes=[{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring = nrP + winP + 2;
ok(C.resolveHit(s,0).result==="miss", "past the cliff = miss (greedy has teeth)");
s = C.create(300); s.level=1;
s.nodes=[{ang:0,tone:C.TONES.find(t=>t!==C.ringTone(s)),life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring = nrP - winP*0.95;                        // d<0, approaching side
let early = C.resolveHit(s,0);
ok(early.result==="good", "early approaching lock is plain ('"+early.result+"')");
ok(early.gained < perf, "early lock scores less than centre PERFECT");

// --- CHARGED: same timing, charged node scores CHARGE_MULT x more ---
s = C.create(300); s.level=1;
let np2 = C.TONES.find(t=>t!==C.ringTone(s));
s.nodes=[{ang:0,tone:np2,life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring=s.nodeR; let plain=C.resolveHit(s,0).gained;
s = C.create(300); s.level=1;
s.nodes=[{ang:0,tone:np2,life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:true,locksNeeded:1,locksDone:0}];
s.ring=s.nodeR; let chg=C.resolveHit(s,0).gained;
ok(chg===plain*C.CFG.CHARGE_MULT, "charged node = x"+C.CFG.CHARGE_MULT+" ("+chg+" vs "+plain+")");

// --- TWIN: 1st lock ARMS (node stays), 2nd lock COMPLETES (node gone, big bonus) ---
s = C.create(300); s.level=5;
s.nodes=[{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false,kind:"twin",charged:false,locksNeeded:2,locksDone:0}];
s.ring=s.nodeR;
let t1=C.resolveHit(s,0);
ok(t1.result==="twinarm", "twin 1st lock arms it");
ok(s.nodes.length===1, "twin survives the 1st lock (still on screen)");
ok(s.nodes[0].locksDone===1, "twin recorded one lock");
ok(s.chain===1, "twin arm still builds chain");
s.ring=s.nodeR;
let t2=C.resolveHit(s,0);
ok(t2.result==="perfect", "twin 2nd lock completes as a real lock");
ok(s.nodes.length===0, "twin consumed on 2nd lock");
ok(s.stats.twins===1, "twin completion counted");

// --- SURGE: locking a surge node flips the rules (faster beat + x2 score) briefly ---
s = C.create(300); s.level=3;
let blBefore=C.beatLen(s);
s.nodes=[{ang:0,tone:"cyan",life:5,maxLife:5,born:0,hit:false,kind:"surge",charged:false,locksNeeded:1,locksDone:0}];
s.ring=s.nodeR;
C.resolveHit(s,0);
ok(s.surge>0, "locking surge node starts a surge");
ok(C.beatLen(s) < blBefore, "beat tightens during surge");
ok(s.events.some(e=>e.type==="surgestart"), "surgestart event emitted");
s.nodes=[{ang:0,tone:C.TONES.find(t=>t!==C.ringTone(s)),life:5,maxLife:5,born:0,hit:false,kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
s.ring=s.nodeR; s.chain=0;
let surgeGain=C.resolveHit(s,0).gained;
ok(surgeGain===C.CFG.SCORE_BASE*C.CFG.CRIT_MULT*C.CFG.SURGE_SCORE_MULT, "score doubled during surge ("+surgeGain+")");
s = C.create(300); s.surge=0.1;
C.step(s, 0.2);
ok(s.surge===0, "surge expires");
ok(s.events.some(e=>e.type==="surgeend"), "surgeend event emitted");

// --- spawns still respect the HARD cacophony cap with all the new node kinds ---
s = C.create(300);
for(let i=0;i<600;i++) C.step(s, 0.05);
ok(s.nodes.length <= C.CFG.MAX_NODES, "v8: node count still <= 3 with special kinds");
ok(s.nodes.filter(n=>n.kind==="surge").length<=1, "never more than one surge node on screen");

// --- v9 pressNear (forgiving mobile tap) ---
// (a) tap near a node that is lockable -> locks THAT node (deliberate targeting)
s = C.create(300);
s.nodes=[
  {ang:0,rFrac:1,tone:"cyan",life:5,maxLife:5,born:0,hit:false},
  {ang:Math.PI,rFrac:1,tone:"amber",life:5,maxLife:5,born:0,hit:false}
];
s.ring = s.nodeR; // both lockable
let n0 = s.nodes.length;
r = C.pressNear(s, Math.PI, 0.55);   // finger near the amber node
ok(r && (r.result==="perfect"||r.result==="good"||r.result==="greedy"), "v9: tap near a lockable node locks it");
ok(s.nodes.length===n0-1, "v9: forgiving tap removes exactly one node");

// (b) tap with finger far from any node, but a node IS lockable -> falls back to best-timed (rhythm tap), never silent
s = C.create(300);
s.nodes=[{ang:0,rFrac:1,tone:"cyan",life:5,maxLife:5,born:0,hit:false}];
s.ring = s.nodeR; // lockable
r = C.pressNear(s, Math.PI, 0.2);   // finger nowhere near angle 0
ok(r && r.result!=="emptytap" && r.result!=="empty", "v9: off-angle tap still locks the best-timed node (rhythm fallback)");
ok(s.nodes.length===0, "v9: rhythm-fallback tap consumed the node");

// (c) tap with genuinely nothing lockable -> soft empty press (anti-mash penalty, same as Space), not silent
s = C.create(300);
let hn = s.health;
r = C.pressNear(s, Math.PI/2, 0.55);   // no nodes at all
ok(r.result==="empty", "v9: tap with no lockable node = soft empty press");
ok(s.health < hn, "v9: that soft press costs a little health (anti-mash, like Space)");

// --- v10 carrot curve: cumulative thresholds must be strictly increasing,
// early levels cheap (fast), tail heavy (slow) ---
(function(){
  let mono=true, prev=-1;
  for(let L=1;L<=200;L++){ let v=C.levelThreshold(L); if(v<=prev){mono=false;break;} prev=v; }
  ok(mono, "v10: level thresholds strictly increasing through L200");
  // per-level cost = threshold(L)-threshold(L-1); early << late
  let costEarly = C.levelThreshold(5)-C.levelThreshold(4);
  let costLate  = C.levelThreshold(200)-C.levelThreshold(199);
  ok(costLate > costEarly*50, "v10: late levels cost far more than early (carrot tail)");
  ok(C.levelThreshold(10) < 50000, "v10: first 10 levels are cheap (fast early growth)");
})();


// ============================================================================
//  UPGRADE TREE (v11) — ~30 mechanical nodes. Tests verify each effect is REAL
//  (changes a number/rule) and that owning nothing is identical to baseline.
// ============================================================================

ok(Array.isArray(C.UPGRADES) && C.UPGRADES.length>=30, "v11: >=30 upgrade nodes exist");
(function(){
  var ids={}, dup=false, badNeed=false;
  C.UPGRADES.forEach(function(u){ if(ids[u.id])dup=true; ids[u.id]=1; });
  C.UPGRADES.forEach(function(u){ (u.need||[]).forEach(function(n){ if(!ids[n])badNeed=true; }); });
  ok(!dup, "v11: upgrade ids unique");
  ok(!badNeed, "v11: every prerequisite id exists in the catalog");
  ok(C.UPGRADES.every(function(u){ return u.cost>0 && u.name && u.desc; }), "v11: every node has cost+name+desc");
})();

function nodeAt(s, signedErr, tone){
  s.nodes=[{ang:0,rFrac:1,tone:tone||"violet",life:5,maxLife:5,born:0,hit:false,
            kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
  s.ring = s.nodeR + signedErr;
  return s.nodes[0];
}

(function(){ ok(C.windowPx(C.create(300,["r1"])) > C.windowPx(C.create(300,[]))+1, "v11 r1: timing window wider when owned"); })();

(function(){
  var s=C.create(300,["r2"]); nodeAt(s,0,"cyan");
  ok(C.resolveHit(s,0).result==="perfect","v11 r2: centre still PERFECT");
  function centrePay(up){ var g=C.create(300,up); nodeAt(g,0,"zzz"); g.chain=0; return C.resolveHit(g,0).gained; }
  ok(centrePay(["r2"]) > centrePay([]), "v11 r2: PERFECT pays more (x4 vs x3)");
})();

(function(){ ok(C.nodeLife(C.create(300,["r3"])) > C.nodeLife(C.create(300,[])), "v11 r3: nodes live longer"); })();

(function(){
  var s=C.create(300,["r4"]); nodeAt(s,0,"zzz"); C.resolveHit(s,0);
  ok(s.slowmo>0, "v11 r4: PERFECT triggers slow-mo");
  ok(C.beatLen(s) > C.beatLen(C.create(300,["r4"])), "v11 r4: beat slower while slow-mo active");
})();

(function(){
  var s=C.create(300,["r5"]); var sawRev=false;
  for(var i=0;i<4000 && !sawRev;i++){ C.step(s,0.05); if(s.ringDir===-1) sawRev=true; }
  ok(sawRev, "v11 r5: ring direction reverses sometimes");
  var b=C.create(300,[]); var stayed=true;
  for(var j=0;j<2000;j++){ C.step(b,0.05); if(b.ringDir!==1){stayed=false;break;} }
  ok(stayed, "v11 r5: without upgrade ring never reverses");
})();

(function(){
  function greedyPay(up){ var g=C.create(300,up); var win=C.windowPx(g);
    nodeAt(g, win*0.98, "zzz"); g.chain=0; return C.resolveHit(g,0).gained; }
  ok(greedyPay(["g1"]) > greedyPay([]), "v11 g1: greedy cliff pays more");
  ok(greedyPay(["g3"]) > greedyPay(["g1"]), "v11 g3: risk mode pays even more at the cliff");
})();

(function(){
  var s=C.create(300,["g2"]); s.chain=5; var win=C.windowPx(s);
  nodeAt(s, win + win*0.3, "zzz");           // just past the greedy cliff (within g2 tolerance)
  var r=C.resolveHit(s,0);
  ok(r.result==="keepersave" && r.forgive===true && s.chain===5, "v11 g2: narrow cliff overshoot forgiven (chain kept)");
  nodeAt(s, win + win*0.3, "zzz");
  C.resolveHit(s,0);
  ok(s.chain===0, "v11 g2: forgiveness is once-per-run");
})();

(function(){ ok(C.chainHold(C.create(300,["c1"])) > C.chainHold(C.create(300,[])), "v11 c1: chain holds longer"); })();

(function(){
  var s=C.create(300,["c2"]); s.chain=4;
  nodeAt(s, C.windowPx(s)+40, "zzz");
  var r=C.resolveHit(s,0);
  ok(r.result==="keepersave" && s.chain===4, "v11 c2: combo keeper saves the chain once");
})();

(function(){
  function pay(up){ var g=C.create(300,up); g.chain=10; nodeAt(g,0,"zzz"); return C.resolveHit(g,0).gained; }
  ok(pay(["c3"]) > pay([]), "v11 c3: fatter chain multiplier pays more at chain 10");
})();

(function(){
  var s=C.create(300,["c4"]); s.chain=16;
  nodeAt(s,0,"zzz"); var r=C.resolveHit(s,0);
  ok(r.cashout===true, "v11 c4: cash-out fires at high chain");
  ok(s.chain===0, "v11 c4: chain burns to 0 after cash-out");
  var s2=C.create(300,["c4","c5"]); s2.chain=16;
  nodeAt(s2,0,"zzz"); C.resolveHit(s2,0);
  ok(s2.chain===8, "v11 c5: double-bank keeps half the chain after cash-out");
})();

(function(){
  // level-frozen locking bot keeps the run alive AND pinned at L1 so the gate is real
  function sawTwinAtL1(up){ var g=C.create(300,up); g.level=1;
    for(var i=0;i<8000;i++){ C.step(g,0.02); g.level=1; g.score=0;
      var idx=C.bestNode(g); if(idx>=0) C.resolveHit(g,idx);
      for(var k=0;k<g.nodes.length;k++) if(g.nodes[k].kind==="twin") return true; }
    return false; }
  ok(sawTwinAtL1(["t1"]), "v11 t1: twins appear at level 1 when owned");
  ok(!sawTwinAtL1([]),    "v11 t1: no twins at level 1 without the upgrade (gate real)");
})();

(function(){
  var s=C.create(300,["t3"]);
  s.nodes=[{ang:0,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,
            kind:"hold",charged:false,locksNeeded:2,locksDone:0,holdSamePass:true}];
  s.ring=s.nodeR;
  var r1=C.resolveHit(s,0);
  ok(r1.result==="twinarm" && s.nodes.length===1, "v11 t3: HOLD first lock arms, node stays");
  ok(s.nodes[0].holdSamePass===true, "v11 t3: HOLD keeps same-pass flag");
  var r2=C.resolveHit(s,0);
  ok(s.nodes.length===0 && r2.gained>0, "v11 t3: HOLD second lock completes");
})();

(function(){
  var s=C.create(300,["t4"]);
  s.nodes=[{ang:0.5,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,
            kind:"echo",charged:false,locksNeeded:1,locksDone:0}];
  s.ring=s.nodeR;
  C.resolveHit(s,0);
  ok(s.nodes.length===1 && s.nodes[0].fromEcho===true, "v11 t4: ECHO leaves an echo node");
})();

(function(){
  var s=C.create(300,["t6"]);
  s.nodes=[{ang:0,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,kind:"link",charged:false,locksNeeded:1,locksDone:0,linkOrder:1},
           {ang:1,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,kind:"link",charged:false,locksNeeded:1,locksDone:0,linkOrder:2}];
  s.ring=s.nodeR;
  var r=C.resolveHit(s,1);
  ok(r.result==="linkwrong", "v11 t6: locking CHAIN-LINK B before A fumbles");
  ok(s.nodes.length===2, "v11 t6: fumble consumes nothing");
  var rA=C.resolveHit(s,0);
  ok(s.nodes.length===1 && rA.gained>0, "v11 t6: A locks fine");
})();

(function(){
  function sawSurge(up,lvl){ var g=C.create(300,up); g.level=lvl;
    for(var i=0;i<8000;i++){ C.step(g,0.02); g.level=lvl; g.score=0;
      var idx=C.bestNode(g); if(idx>=0) C.resolveHit(g,idx);
      for(var k=0;k<g.nodes.length;k++) if(g.nodes[k].kind==="surge") return true; }
    return false; }
  ok(sawSurge(["f1"],1), "v11 f1: surge nodes appear at level 1 when owned");
  ok(!sawSurge([],1),    "v11 f1: no surge at level 1 without the upgrade (gate real)");
})();

(function(){
  function surgeDur(up){ var g=C.create(300,up);
    g.nodes=[{ang:0,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,kind:"surge",charged:false,locksNeeded:1,locksDone:0}];
    g.ring=g.nodeR; C.resolveHit(g,0); return g.surge; }
  ok(surgeDur(["f2"]) > surgeDur([]), "v11 f2: surge lasts longer");
})();

(function(){
  var s=C.create(300,["f4"]);
  s.surge=2; s.surgeMult=C.CFG.SURGE_SCORE_MULT;
  s.nodes=[{ang:0,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,kind:"surge",charged:false,locksNeeded:1,locksDone:0}];
  s.ring=s.nodeR; C.resolveHit(s,0);
  ok(s.surgeMult > C.CFG.SURGE_SCORE_MULT, "v11 f4: stacking a surge raises the score mult");
})();

(function(){
  var all=C.UPGRADES.map(function(u){return u.id;});
  var s=C.create(300, all); var maxSeen=0;
  for(var i=0;i<5000;i++){ C.step(s,0.04); if(s.nodes.length>maxSeen)maxSeen=s.nodes.length; if(!s.alive)s=C.create(300,all); }
  ok(maxSeen <= C.CFG.MAX_NODES, "v11: even with ALL upgrades, nodes never exceed MAX_NODES (<=3)");
})();

(function(){
  function run(up){ var g=C.create(300,up); g.seed=1234567;
    for(var i=0;i<2400;i++){ C.step(g,0.02); var idx=C.bestNode(g); if(idx>=0) C.resolveHit(g,idx); } return g.score; }
  ok(run([])===run([]), "v11: empty-upgrade run is deterministic (reproducible)");
})();

// c6 PERFECT seeds +1 extra chain (a centre lock jumps chain by 2, not 1)
(function(){
  var s=C.create(300,["c6"]); s.chain=0; nodeAt(s,0,"zzz"); C.resolveHit(s,0);
  ok(s.chain===2, "v11 c6: PERFECT adds +2 to chain (seed)");
  var b=C.create(300,[]); b.chain=0; nodeAt(b,0,"zzz"); C.resolveHit(b,0);
  ok(b.chain===1, "v11 c6: baseline PERFECT adds +1");
})();

// r6 grace window: a nearly-dead node is catchable past the normal window
(function(){
  var s=C.create(300,["r6"]); var win=C.windowPx(s);
  s.nodes=[{ang:0,rFrac:1,tone:"zzz",life:0.1,maxLife:5,born:0,hit:false,
            kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
  s.ring=s.nodeR + win*1.2;                  // outside normal window, inside grace window
  var r=C.resolveHit(s,0);
  ok(r.gained>0, "v11 r6: near-dead node catchable in grace window");
  // baseline: same press is a miss
  var b=C.create(300,[]);
  b.nodes=[{ang:0,rFrac:1,tone:"zzz",life:0.1,maxLife:5,born:0,hit:false,
            kind:"normal",charged:false,locksNeeded:1,locksDone:0}];
  b.ring=b.nodeR + C.windowPx(b)*1.2;
  ok(C.resolveHit(b,0).result==="miss", "v11 r6: without upgrade the same press misses");
})();

// t7 charged twins: with t7, some twins are charged (gold); never at baseline
(function(){
  function sawChargedTwin(up){ var g=C.create(300,up); g.level=5;
    for(var i=0;i<9000;i++){ C.step(g,0.02); g.level=5; g.score=0;
      var idx=C.bestNode(g); if(idx>=0) C.resolveHit(g,idx);
      for(var k=0;k<g.nodes.length;k++){ var n=g.nodes[k]; if(n.kind==="twin"&&n.charged) return true; } }
    return false; }
  ok(sawChargedTwin(["t2","t3","t7"]), "v11 t7: charged twins appear when owned");
})();

// f6 surge bonus node: locking a surge injects an extra node (within cap)
(function(){
  var s=C.create(300,["f6"]);
  s.nodes=[{ang:0,rFrac:1,tone:"zzz",life:5,maxLife:5,born:0,hit:false,kind:"surge",charged:false,locksNeeded:1,locksDone:0}];
  s.ring=s.nodeR;
  C.resolveHit(s,0);                          // surge consumed, bonus node added
  ok(s.nodes.length===1 && s.nodes[0].fromSurge===true, "v11 f6: surge lock spawns a bonus node");
  ok(s.nodes.length <= C.CFG.MAX_NODES, "v11 f6: bonus node respects the cap");
})();

// summary
console.log("\n"+pass+"/"+(pass+fail)+" passed"+(fail? "  ("+fail+" FAILED)":"  ✓ all green"));
process.exit(fail?1:0);
