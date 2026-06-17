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
    SPAWN:1.55, SPAWN_FLOOR:0.78,                   // seconds between spawn attempts (legacy)
    MAX_NODES:3,                                    // HARD cap — anti-cacophony
    TARGET_NODES:2, TARGET_NODES_FLOOR:2,           // keep ~this many on screen (≤ MAX_NODES)
    REFILL:0.55, REFILL_FLOOR:0.34,                 // seconds between refill checks
    RFRAC_MIN:0.5, RFRAC_MAX:1.0,                   // nodes live across this band of the orbit
    CHAIN_MULT:0.15,                                // score = base*(1 + chain*mult)
    CHAIN_HOLD:3.2, CHAIN_HOLD_FLOOR:1.9,           // seconds before chain decays a step
    SCORE_BASE:100, CRIT_MULT:3, PURE_MULT:1.5,
    H_MAX:1.0, H_HIT:0.14, H_MISTAP:0.045,
    H_LOCK:0.012, H_REGEN:0.004,                    // per-event / per-second
    // ---- v8 DEPTH LAYER (turns the reflex into a decision; core idea untouched) ----
    // (b) RISK/REWARD — "greedy" lock: ride the ring PAST dead-centre, out to the
    // trailing edge of the window, for up to +GREEDY_GAIN extra score. The reward
    // ramps toward the cliff; one px too far = a real miss. PERFECT (centre) stays
    // the clean ×3. So every lock is now a choice: safe ×3 vs risky ~×4.
    GREEDY_GAIN:3.0,                                // max extra mult at the very cliff (→ ~×4 vs ×1 base)
    GREEDY_NAME_FRAC:0.55,                           // gfrac above this is branded "GREEDY"
    // (a) CHOICE — charged nodes: worth ×2 but VOLATILE (short life). Grab the gold
    // before it decoheres, or defend a normal node that's dying — you can't always do both.
    CHARGE_CHANCE:0.17, CHARGE_MULT:2, CHARGE_LIFE:0.62,
    // (c) SKILL GROWTH — twin nodes: need TWO locks on two separate ring passes.
    // Appear from TWIN_LEVEL, so the action at 50s (juggling twins) ≠ 5s (single taps).
    TWIN_LEVEL:3, TWIN_CHANCE:0.24, TWIN_BONUS:2.2,
    // (d) SURPRISE — surge node (rare ✦): locking it flips the rules for a few seconds
    // — beat tightens, all score ×2. Big upside, but the faster ring can shatter your chain.
    SURGE_LEVEL:2, SURGE_CHANCE:0.05, SURGE_DUR:4.5, SURGE_SCORE_MULT:2, SURGE_BEAT_MULT:0.8,
  };
  var TONES = ["cyan","magenta","amber","violet"];

  function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
  function lvlFloor(base,floor,step,level){ return Math.max(floor, base - step*(level-1)); }
  // v10 "carrot" curve. perLevelCost(L) = score earned WITHIN level L to advance.
  // Piecewise so the first ~10 levels fly by (seconds each -> instant sense of growth),
  // the middle stretches gently, and the last ~50 levels get heavy (minutes each) so the
  // hidden word becomes legible right as each level costs more -> always almost there.
  // L200 ~ 9h for a strong player, ~16h average: "weeks of returns", not a weekend, not never.
  function perLevelCost(L){
    if(L<=10) return Math.round(500*L*1.15);
    if(L<=60) return Math.round(1400*Math.pow(L-9,1.30)+6000);
    return Math.round(4200*Math.pow(L-59,1.42) + (1400*Math.pow(51,1.30)+6000));
  }
  var _thrCache = [0];
  function levelThreshold(level){
    while(_thrCache.length <= level){
      var n = _thrCache.length;
      _thrCache[n] = _thrCache[n-1] + perLevelCost(n);
    }
    return _thrCache[level];
  }
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
      refillTimer: 0.25,
      seed: 1234567,
      alive:true,
      surge:0,                         // seconds of active "phase surge" (v8 surprise layer)
      stats:{perfect:0, good:0, pure:0, miss:0, decohered:0, maxChain:0, locks:0,
             greedy:0, twins:0, surges:0},
      // event log for the renderer to react to (consumed each frame)
      events:[],
    };
  }

  function rng(s){ s.seed = (s.seed*1103515245 + 12345) & 0x7fffffff; return s.seed/0x7fffffff; }

  function beatLen(s){
    var b = lvlFloor(CFG.BEAT, CFG.BEAT_FLOOR, CFG.BEAT_STEP, s.level);
    if(s.surge>0) b *= CFG.SURGE_BEAT_MULT;   // surge = faster ring, more pressure
    return b;
  }
  function windowPx(s){ return lvlFloor(CFG.WINDOW, CFG.WINDOW_FLOOR, CFG.WINDOW_STEP, s.level); }
  function nodeLife(s){ return lvlFloor(CFG.NODE_LIFE, CFG.NODE_LIFE_FLOOR, 0.42, s.level); }
  function spawnGap(s){ return lvlFloor(CFG.SPAWN, CFG.SPAWN_FLOOR, 0.16, s.level); }
  function chainHold(s){ return lvlFloor(CFG.CHAIN_HOLD, CFG.CHAIN_HOLD_FLOOR, 0.18, s.level); }
  function refillGap(s){ return lvlFloor(CFG.REFILL, CFG.REFILL_FLOOR, 0.03, s.level); }
  // how many nodes we WANT on screen now (grows slightly with level, capped < MAX_NODES+1)
  function targetNodes(s){
    var t = CFG.TARGET_NODES + Math.floor((s.level-1)/4); // 2 early, 3 from level 5+
    return Math.min(CFG.MAX_NODES, Math.max(CFG.TARGET_NODES_FLOOR, t));
  }
  // a node's individual orbit radius in px (nodes with rFrac sit inside the edge)
  function nodeRadius(s, nd){
    var f = (nd && nd.rFrac!=null) ? nd.rFrac : 1;
    return s.nodeR * f;
  }

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
    // pick a radius fraction spread away from existing nodes' radii, so the single
    // ring touches each node at a DIFFERENT phase of its sweep (rhythm, not a clump).
    var rf=1, rtries=0, rok=false;
    do{
      rf = CFG.RFRAC_MIN + rng(s)*(CFG.RFRAC_MAX-CFG.RFRAC_MIN);
      rok = true;
      for(var j=0;j<s.nodes.length;j++){
        var rfj = s.nodes[j].rFrac!=null ? s.nodes[j].rFrac : 1;
        if(Math.abs(rf - rfj) < 0.16){ rok=false; break; }
      }
      rtries++;
    } while(!rok && rtries<8);
    var life0 = nodeLife(s);
    var nd = {
      ang: ang,
      rFrac: rf,
      tone: TONES[Math.floor(rng(s)*n)],
      life: life0,
      maxLife: life0,
      born: s.t,
      hit:false,
      kind:"normal",        // "normal" | "twin" | "surge"
      charged:false,        // gold, ×2 but volatile
      locksNeeded:1,
      locksDone:0,
      // pop animation handled by renderer via events
    };
    // --- v8: assign a special role (mutually exclusive), then maybe charge a normal one ---
    var hasSurge=false;
    for(var k=0;k<s.nodes.length;k++){ if(s.nodes[k].kind==="surge"){ hasSurge=true; break; } }
    if(s.level>=CFG.SURGE_LEVEL && !hasSurge && s.surge<=0 && rng(s) < CFG.SURGE_CHANCE){
      nd.kind="surge";
    } else if(s.level>=CFG.TWIN_LEVEL && rng(s) < CFG.TWIN_CHANCE){
      nd.kind="twin"; nd.locksNeeded=2;
    } else if(rng(s) < CFG.CHARGE_CHANCE){
      nd.charged=true;                          // volatile: shorter fuse, bigger payout
      nd.life = life0*CFG.CHARGE_LIFE; nd.maxLife = nd.life;
    }
    s.nodes.push(nd);
  }

  // advance simulation by dt seconds
  function step(s, dt){
    if(!s.alive) return;
    s.t += dt;
    s.events.length = 0;

    // --- v8 surge timer: brief rule-flip after locking a surge node ---
    if(s.surge>0){
      s.surge -= dt;
      if(s.surge<=0){ s.surge=0; s.events.push({type:"surgeend"}); }
    }

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
        s.events.push({type:"decohere", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone});
        if(s.health<=0){ die(s); return; }
      }
    }

    // --- passive: tiny health drain so idling is fatal, small regen otherwise ---
    s.health = clamp(s.health + (CFG.H_REGEN - CFG.H_LOCK*0) * dt, 0, CFG.H_MAX);

    // --- keep the field populated: refill toward the target count (≤ MAX_NODES) ---
    // This is the anti-boredom fix: the old single-timer spawn left the screen empty
    // ~80% of the time. We top up to ~targetNodes so there's almost always something
    // to read and hit — while never exceeding the hard MAX_NODES cacophony cap.
    s.refillTimer -= dt;
    if(s.refillTimer <= 0){
      s.refillTimer = refillGap(s);
      if(s.nodes.length < targetNodes(s)) trySpawn(s);
    }
    // keep legacy spawnTimer ticking (harmless; some tests/poke at it)
    s.spawnTimer -= dt;
    if(s.spawnTimer <= 0){ s.spawnTimer = spawnGap(s); }

    // --- level up by score ---
    while(s.score >= levelThreshold(s.level)){
      s.level++;
      s.events.push({type:"levelup", level:s.level});
    }
  }

  // How close (in px) is the ring to a node right now. lower = better.
  // Uses the node's OWN orbit radius, so the single ring resonates with each node
  // at a different moment of its sweep (this is what makes the loop rhythmic).
  function nodeError(s, nd){ return Math.abs(s.ring - nodeRadius(s, nd)); }

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
    var nr = nodeRadius(s, nd);
    var d = s.ring - nr;             // signed: <0 ring still approaching, >0 ring already leaving
    var err = d<0 ? -d : d;
    if(err > win){
      // mistimed press on a node -> break chain, small penalty.
      // (a half-locked TWIN dies here too: gambling on the 2nd pass and whiffing costs you)
      s.chain = 0; s.chainTimer = 0;
      s.health = clamp(s.health - CFG.H_MISTAP, 0, CFG.H_MAX);
      s.stats.miss++;
      s.events.push({type:"miss", ang:nd.ang, rFrac:nd.rFrac});
      if(s.health<=0){ die(s); }
      return {result:"miss"};
    }
    // hit! --- v8 timing identity: centre = PERFECT (clean ×3),
    // trailing edge = GREEDY (ride past centre for up to ~×4, but the cliff = a miss),
    // approaching edge = plain lock (you jumped early; safe but only ×1).
    var critEdge = win*CFG.CRIT_FRAC;
    var crit = err <= critEdge;
    var pure = nd.tone === ringTone(s);
    var mult = 1, kindLabel = "good", greedyFrac = 0;
    if(crit){
      mult *= CFG.CRIT_MULT; s.stats.perfect++; kindLabel = "perfect";
    } else if(d > 0){
      greedyFrac = clamp((err - critEdge)/(win - critEdge), 0, 1);  // 0..1 toward the cliff
      mult *= 1 + CFG.GREEDY_GAIN*greedyFrac;
      if(greedyFrac >= CFG.GREEDY_NAME_FRAC){ s.stats.greedy++; kindLabel = "greedy"; }
    } // else: early lock on the approaching side -> ×1 "good"
    if(pure){ mult *= CFG.PURE_MULT; s.stats.pure++; }
    if(nd.charged){ mult *= CFG.CHARGE_MULT; }

    // --- TWIN, 1st lock: ARM it (kept alive for a second ring pass), pay a small advance ---
    if(nd.kind==="twin" && (nd.locksDone+1) < nd.locksNeeded){
      nd.locksDone++;
      nd.life = nodeLife(s); nd.maxLife = nd.life;          // refresh fuse for the 2nd pass
      var armBonus = 1 + s.chain*CFG.CHAIN_MULT;
      var armGain = Math.round(CFG.SCORE_BASE * mult * 0.5 * armBonus);
      if(s.surge>0) armGain = Math.round(armGain*CFG.SURGE_SCORE_MULT);
      s.score += armGain;
      s.chain++; s.chainTimer = chainHold(s);
      if(s.chain > s.stats.maxChain) s.stats.maxChain = s.chain;
      s.health = clamp(s.health + CFG.H_LOCK*0.5, 0, CFG.H_MAX);
      s.events.push({type:"twinarm", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone,
                     gained:armGain, chain:s.chain});
      return {result:"twinarm", gained:armGain, chain:s.chain};
    }

    // --- completing lock (normal / charged / surge / twin's 2nd lock) ---
    if(nd.kind==="twin"){ mult *= CFG.TWIN_BONUS; s.stats.twins++; }
    var chainBonus = 1 + s.chain*CFG.CHAIN_MULT;
    var gained = Math.round(CFG.SCORE_BASE * mult * chainBonus);
    if(s.surge>0) gained = Math.round(gained*CFG.SURGE_SCORE_MULT);
    s.score += gained;
    s.chain++;
    s.chainTimer = chainHold(s);
    if(s.chain > s.stats.maxChain) s.stats.maxChain = s.chain;
    s.stats.locks++;
    s.health = clamp(s.health + CFG.H_LOCK, 0, CFG.H_MAX);

    // --- SURGE node: locking it flips the rules for a few seconds (faster ring, ×2 score) ---
    var triggeredSurge = false;
    if(nd.kind==="surge"){
      s.surge = CFG.SURGE_DUR; s.stats.surges++; triggeredSurge = true;
      s.events.push({type:"surgestart", dur:CFG.SURGE_DUR});
    }

    s.nodes.splice(idx,1);
    s.events.push({type:"lock", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone, crit:crit, pure:pure,
                   gained:gained, chain:s.chain, label:kindLabel, greedy:greedyFrac,
                   charged:!!nd.charged, kind:nd.kind, surge:triggeredSurge});
    return {result: crit?"perfect":(kindLabel==="greedy"?"greedy":"good"),
            pure:pure, gained:gained, chain:s.chain, charged:!!nd.charged, kind:nd.kind};
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

  // Forgiving tap (mobile). Targets the lockable node nearest the finger angle;
  // if none near the finger is in its timing window, falls back to the best-timed
  // node anywhere (so a rhythm tap still lands). Only a true no-node press is
  // treated like an empty Space press (soft anti-mash penalty), never silently
  // dropped -- the renderer always shows feedback for the returned result.
  function pressNear(s, ang, angTol){
    if(!s.alive) return null;
    var win = windowPx(s);
    var pick=-1, pickD=1e9;
    for(var i=0;i<s.nodes.length;i++){
      var d = Math.abs(((ang - s.nodes[i].ang + Math.PI)%(Math.PI*2)) - Math.PI);
      if(d < angTol && nodeError(s, s.nodes[i]) <= win && d < pickD){ pickD=d; pick=i; }
    }
    if(pick < 0) pick = bestNode(s);
    if(pick < 0){
      s.health = clamp(s.health - CFG.H_MISTAP*0.6, 0, CFG.H_MAX);
      if(s.chain >= 3){ s.chain = 0; s.chainTimer = 0; }
      s.events.push({type:"emptypress"});
      if(s.health<=0){ die(s); }
      return {result:"empty"};
    }
    return resolveHit(s, pick);
  }

  function die(s){
    s.alive = false;
    s.events.push({type:"death"});
  }

  return {
    CFG:CFG, TONES:TONES,
    create:create, step:step, pressSpace:pressSpace, pressAt:pressAt, pressNear:pressNear,
    resolveHit:resolveHit, bestNode:bestNode, nodeError:nodeError,
    beatLen:beatLen, windowPx:windowPx, ringTone:ringTone,
    levelThreshold:levelThreshold, tonesForLevel:tonesForLevel,
    nodeLife:nodeLife, spawnGap:spawnGap, chainHold:chainHold,
    refillGap:refillGap, targetNodes:targetNodes, nodeRadius:nodeRadius,
    clamp:clamp,
  };
})();
if(typeof module!=="undefined" && module.exports){ module.exports = PhaseCore; }
