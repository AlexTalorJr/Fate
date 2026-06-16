"use strict";
var PhaseCore = (function(){
  var CFG = {
    RMIN:0,            // ring starts at center
    RPAD:30,           // node ring sits this far inside the edge
    BEAT:1.05, BEAT_FLOOR:0.62, BEAT_STEP:0.035,   // seconds per ring pass
    WINDOW:28, WINDOW_FLOOR:15, WINDOW_STEP:0.9,    // px tolerance |r - nodeR|
    CRIT_FRAC:0.34,    // inner fraction of window that counts as PERFECT
    NODE_R:16,
    GRACE:0.16,
    NODE_LIFE:5.4, NODE_LIFE_FLOOR:2.9,             // seconds before a node decoheres
    SPAWN:1.55, SPAWN_FLOOR:0.78,                   // seconds between spawn attempts
    MAX_NODES:3,                                    // HARD cap — anti-cacophony
    CHAIN_MULT:0.15,                                // score = base*(1 + chain*mult)
    CHAIN_HOLD:3.2, CHAIN_HOLD_FLOOR:1.9,           // seconds before chain decays a step
    SCORE_BASE:100, CRIT_MULT:3, PURE_MULT:1.5,
    H_MAX:1.0, H_HIT:0.115, H_MISTAP:0.035,
    H_LOCK:0.022, H_REGEN:0.006,                    // per-event / per-second
  };
  var TONES = ["cyan","magenta","amber","violet"];

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lvlFloor(base,floor,step,level){ return Math.max(floor, base - step*(level-1)); }
  function levelThreshold(level){ return level*2200 + level*level*650; }
  function tonesForLevel(level){ return Math.min(4, 2 + Math.floor((level-1)/3)); }

  // Create a fresh game state. edgeR = playfield radius in px.
  function create(edgeR){
    return {
      edgeR: edgeR,
      nodeR: edgeR - CFG.RPAD,        // radius at which nodes live
      t:0,
      score:0,
      level:1,
      health:CFG.H_MAX,
      chain:0,
      chainTimer:0,
      ring:0,                          // current ring radius
      ringPrev:0,
      beatPhase:0,                     // 0..1 within current beat
      nodes:[],
      spawnTimer: 0.5,
      seed: 1234567,
      alive:true,
      stats:{perfect:0, good:0, pure:0, miss:0, decohered:0, maxChain:0, locks:0},
      // event log for the renderer to react to (consumed each frame)
      events:[],
    };
  }

  function rng(s){ s.seed = (s.seed*1103515245 + 12345) & 0x7fffffff; return s.seed/0x7fffffff; }

  function beatLen(s){ return lvlFloor(CFG.BEAT, CFG.BEAT_FLOOR, CFG.BEAT_STEP, s.level); }
  function windowPx(s){ return lvlFloor(CFG.WINDOW, CFG.WINDOW_FLOOR, CFG.WINDOW_STEP, s.level); }
  function nodeLife(s){ return lvlFloor(CFG.NODE_LIFE, CFG.NODE_LIFE_FLOOR, 0.42, s.level); }
  function spawnGap(s){ return lvlFloor(CFG.SPAWN, CFG.SPAWN_FLOOR, 0.16, s.level); }
  function chainHold(s){ return lvlFloor(CFG.CHAIN_HOLD, CFG.CHAIN_HOLD_FLOOR, 0.18, s.level); }

  function ringTone(s){
    // ring's current tone cycles each beat through available tones
    var n = tonesForLevel(s.level);
    var idx = Math.floor(s.t / beatLen(s)) % n;
    return TONES[idx];
  }

  function trySpawn(s){
    if(s.nodes.length >= CFG.MAX_NODES) return;
    var n = tonesForLevel(s.level);
    // place at an angle away from existing nodes for readability
    var ang, ok=false, tries=0;
    do{
      ang = rng(s)*Math.PI*2;
      ok = true;
      for(var i=0;i<s.nodes.length;i++){
        var d = Math.abs(((ang - s.nodes[i].ang + Math.PI)%(Math.PI*2)) - Math.PI);
        if(d < 0.9){ ok=false; break; }
      }
      tries++;
    } while(!ok && tries<8);
    s.nodes.push({
      ang: ang,
      tone: TONES[Math.floor(rng(s)*n)],
      life: nodeLife(s),
      maxLife: nodeLife(s),
      born: s.t,
      hit:false,
      // pop animation handled by renderer via events
    });
  }

  // advance simulation by dt seconds
  function step(s, dt){
    if(!s.alive) return;
    s.t += dt;
    s.events.length = 0;

    // --- ring travels center -> edge over one beat, then resets ---
    var bl = beatLen(s);
    s.beatPhase += dt / bl;
    var crossed = false;
    while(s.beatPhase >= 1){ s.beatPhase -= 1; crossed = true; }
    s.ringPrev = s.ring;
    s.ring = Math.max(0, s.beatPhase * s.edgeR);
    if(crossed){ s.events.push({type:"beat"}); }

    // --- chain decay ---
    if(s.chain > 0){
      s.chainTimer -= dt;
      if(s.chainTimer <= 0){
        s.chain = Math.max(0, s.chain - 1);
        s.chainTimer = chainHold(s);
        if(s.chain===0) s.events.push({type:"chainlost"});
      }
    }

    // --- nodes age / decohere ---
    for(var i=s.nodes.length-1;i>=0;i--){
      var nd = s.nodes[i];
      nd.life -= dt;
      if(nd.life <= 0){
        s.nodes.splice(i,1);
        s.stats.decohered++;
        s.chain = 0; s.chainTimer = 0;
        s.health = clamp(s.health - CFG.H_HIT, 0, CFG.H_MAX);
        s.events.push({type:"decohere", ang:nd.ang, tone:nd.tone});
        if(s.health<=0){ die(s); return; }
      }
    }

    // --- passive: tiny health drain so idling is fatal, small regen otherwise ---
    s.health = clamp(s.health + (CFG.H_REGEN - CFG.H_LOCK*0) * dt, 0, CFG.H_MAX);

    // --- spawn ---
    s.spawnTimer -= dt;
    if(s.spawnTimer <= 0){
      s.spawnTimer = spawnGap(s);
      trySpawn(s);
    }

    // --- level up by score ---
    while(s.score >= levelThreshold(s.level)){
      s.level++;
      s.events.push({type:"levelup", level:s.level});
    }
  }

  // How close (in px) is the ring to a node right now. lower = better.
  function nodeError(s, nd){ return Math.abs(s.ring - s.nodeR); }

  // Find the best resonating node for a Space press (closest to ideal, within window).
  function bestNode(s){
    var win = windowPx(s);
    var best=-1, bestErr=1e9;
    for(var i=0;i<s.nodes.length;i++){
      var e = nodeError(s, s.nodes[i]);
      if(e <= win && e < bestErr){ bestErr=e; best=i; }
    }
    return best;
  }

  // Resolve a hit on node index idx. Returns result object or null.
  function resolveHit(s, idx){
    var nd = s.nodes[idx];
    var win = windowPx(s);
    var err = nodeError(s, nd);
    if(err > win){
      // mistimed press on a node -> break chain, small penalty
      s.chain = 0; s.chainTimer = 0;
      s.health = clamp(s.health - CFG.H_MISTAP, 0, CFG.H_MAX);
      s.stats.miss++;
      s.events.push({type:"miss", ang:nd.ang});
      if(s.health<=0){ die(s); }
      return {result:"miss"};
    }
    // hit!
    var crit = err <= win*CFG.CRIT_FRAC;
    var pure = nd.tone === ringTone(s);
    var mult = 1;
    if(crit){ mult *= CFG.CRIT_MULT; s.stats.perfect++; }
    else { s.stats.good++; }
    if(pure){ mult *= CFG.PURE_MULT; s.stats.pure++; }

    var chainBonus = 1 + s.chain*CFG.CHAIN_MULT;
    var gained = Math.round(CFG.SCORE_BASE * mult * chainBonus);
    s.score += gained;
    s.chain++;
    s.chainTimer = chainHold(s);
    if(s.chain > s.stats.maxChain) s.stats.maxChain = s.chain;
    s.stats.locks++;
    s.health = clamp(s.health + CFG.H_LOCK, 0, CFG.H_MAX);

    s.nodes.splice(idx,1);
    s.events.push({type:"lock", ang:nd.ang, tone:nd.tone, crit:crit, pure:pure,
                   gained:gained, chain:s.chain});
    return {result: crit?"perfect":"good", pure:pure, gained:gained, chain:s.chain};
  }

  // Player pressed Space (auto-target). Returns result or null (empty press).
  function pressSpace(s){
    if(!s.alive) return null;
    var idx = bestNode(s);
    if(idx < 0){
      // space in empty space -> tiny penalty (anti-mash), softer than a real miss
      s.health = clamp(s.health - CFG.H_MISTAP*0.6, 0, CFG.H_MAX);
      if(s.chain >= 3){ s.chain = 0; s.chainTimer = 0; }
      s.events.push({type:"emptypress"});
      if(s.health<=0){ die(s); }
      return {result:"empty"};
    }
    return resolveHit(s, idx);
  }

  // Player tapped at screen angle `ang` (radians) within tap tolerance.
  // angTol in radians; if no node near that angle, it's an empty tap (no penalty).
  function pressAt(s, ang, angTol){
    if(!s.alive) return null;
    var best=-1, bestD=1e9;
    for(var i=0;i<s.nodes.length;i++){
      var d = Math.abs(((ang - s.nodes[i].ang + Math.PI)%(Math.PI*2)) - Math.PI);
      if(d < angTol && d < bestD){ bestD=d; best=i; }
    }
    if(best < 0){
      s.events.push({type:"emptytap"});   // clicking empty space is free
      return {result:"emptytap"};
    }
    return resolveHit(s, best);
  }

  function die(s){
    s.alive = false;
    s.events.push({type:"death"});
  }

  return {
    CFG:CFG, TONES:TONES,
    create:create, step:step, pressSpace:pressSpace, pressAt:pressAt,
    resolveHit:resolveHit, bestNode:bestNode, nodeError:nodeError,
    beatLen:beatLen, windowPx:windowPx, ringTone:ringTone,
    levelThreshold:levelThreshold, tonesForLevel:tonesForLevel,
    nodeLife:nodeLife, spawnGap:spawnGap, chainHold:chainHold,
    clamp:clamp,
  };
})();
module.exports = PhaseCore;
