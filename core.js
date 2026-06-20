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

  // ============================================================================
  //  UPGRADE TREE  —  ~30 nodes, EVERY ONE mechanical (no % filler, no cosmetics)
  // ----------------------------------------------------------------------------
  //  Decision locked in handoff: a small tree of REAL forks beats a big tree of
  //  padding. Each node here changes HOW you play (a new node type, a new rule, a
  //  new trade-off), not just a number. Bought with "phase" — a lifetime currency
  //  minted from cumulative score across all runs (ties level-ups <-> the tree).
  //
  //  Activation in the sim is data-only: a run carries s.up = Set of owned ids.
  //  Core stays pure/deterministic (tests pass a fixed Set). The renderer owns the
  //  tree UI + persistence. Anti-cacophony invariants are NEVER touched by an
  //  upgrade: MAX_NODES stays 3, there is still ONE ring (the "twin ring" upgrade
  //  is a brief cosmetic-of-the-rule echo on perfects, it does not add a 2nd
  //  scoring ring), and no upgrade spawns a burst of nodes.
  //
  //  Branches (read as "places to grow" in the tree):
  //   RHYTHM  — when/how the timing windows & ring behave
  //   GREED   — push the risk/reward (greedy lock) layer further
  //   CHAIN   — the combo economy: keep it, grow it, cash it
  //   TYPES   — unlock & bias the special node types (twin/charge/surge/new ones)
  //   FLOW    — surge & tempo: the rule-flip layer
  //  Each branch is a short chain (earlier node gates the next), so the tree has
  //  visible depth without breaching ≤3 nodes / one ring.
  // ============================================================================
  var UPGRADES = [
    // ---- RHYTHM ---------------------------------------------------------------
    {id:"r1", br:"rhythm", name:"Широкое окно",      cost:    8000, need:[],         lvl:1,
      desc:"Окно тайминга +18%. Лочить легче — но PERFECT-ядро тоже шире, меньше «жадных» обрывов."},
    {id:"r2", br:"rhythm", name:"Острый перфект",    cost:   45000, need:["r1"],     lvl:4,
      desc:"PERFECT-зона уже (×1.5 строже), но PERFECT теперь ×4 вместо ×3. Платишь точностью."},
    {id:"r3", br:"rhythm", name:"Длинная жизнь",     cost:  140000, need:["r1"],     lvl:6,
      desc:"Узлы живут на +20% дольше до декогеренции. Больше времени выбрать, что брать."},
    {id:"r4", br:"rhythm", name:"Замедление на перфекте", cost: 400000, need:["r2","r3"], lvl:11,
      desc:"Каждый PERFECT даёт ~0.4с лёгкого slow-mo (кольцо медленнее). Окно мастерства."},
    {id:"r5", br:"rhythm", name:"Реверс-кольцо",     cost: 1100000, need:["r4"],     lvl:20,
      desc:"Иногда кольцо идёт от края к центру. Тот же лок, перевёрнутое чтение — новый навык."},
    // ---- GREED ----------------------------------------------------------------
    {id:"g1", br:"greed",  name:"Жадная рука",        cost:   12000, need:[],         lvl:2,
      desc:"Greedy-множитель тянется выше: кап ×4 → ×4.8 у самого обрыва."},
    {id:"g2", br:"greed",  name:"Край прощения",      cost:   60000, need:["g1"],     lvl:5,
      desc:"Самый край окна больше не мгновенный промах: 1 «обрыв» за заезд прощается."},
    {id:"g3", br:"greed",  name:"Risk mode",          cost:  220000, need:["g2"],     lvl:9,
      desc:"Greedy-кап до ×6. Жадность становится главным источником очков для смелых."},
    {id:"g4", br:"greed",  name:"Знак за риск",       cost:  650000, need:["g3"],     lvl:14,
      desc:"Цепочка из 3+ подряд GREEDY-локов даёт растущий бонус-стек (агрессивный стиль)."},
    {id:"g5", br:"greed",  name:"Чистая жадность",    cost: 1600000, need:["g4"],     lvl:22,
      desc:"GREEDY-лок на узле в тон кольца удваивается (PURE×GREEDY стакается полностью)."},
    // ---- CHAIN ----------------------------------------------------------------
    {id:"c1", br:"chain",  name:"Держатель цепи",     cost:   15000, need:[],         lvl:2,
      desc:"Цепочка держится на +25% дольше до распада. Меньше мёртвых обрывов между узлами."},
    {id:"c2", br:"chain",  name:"Хранитель комбо",    cost:   80000, need:["c1"],     lvl:6,
      desc:"Один промах за заезд НЕ сбрасывает цепочку (combo keeper)."},
    {id:"c3", br:"chain",  name:"Жирная цепь",        cost:  260000, need:["c1"],     lvl:8,
      desc:"Множитель цепочки растёт быстрее (за-лок вклад ×1.4)."},
    {id:"c4", br:"chain",  name:"Касса цепи",         cost:  700000, need:["c2","c3"], lvl:13,
      desc:"Можно «обналичить» цепочку: на 10+ цепи следующий лок даёт ×(цепь/8) разово, цепь сгорает."},
    {id:"c5", br:"chain",  name:"Двойной банк",       cost: 1700000, need:["c4"],     lvl:21,
      desc:"После обнала цепочка не падает в 0, а сохраняет половину. Серийный кэш-аут."},
    // ---- TYPES ----------------------------------------------------------------
    {id:"t1", br:"types",  name:"Ранние твины",       cost:   18000, need:[],         lvl:3,
      desc:"Твин-узлы появляются с 1-го уровня (а не с 3-го) и чуть чаще."},
    {id:"t2", br:"types",  name:"Щедрый заряд",       cost:   70000, need:[],         lvl:4,
      desc:"Заряженные (золотые ×2) узлы чаще и живут чуть дольше — успеть схватить золото."},
    {id:"t3", br:"types",  name:"HOLD-узлы",          cost:  300000, need:["t1"],     lvl:10,
      desc:"Новый тип: HOLD — лочится дважды по одному проходу кольца (взвод→добор в окне). ×2.6."},
    {id:"t4", br:"types",  name:"ECHO-узлы",          cost:  520000, need:["t2"],     lvl:12,
      desc:"Новый тип: ECHO — после лока оставляет эхо-узел на том же месте (мгновенный второй шанс на очки)."},
    {id:"t5", br:"types",  name:"Твин твинов",        cost: 1400000, need:["t3"],     lvl:18,
      desc:"Редкие 4-лок узлы (твин твинов): четыре прохода, жирный финал ×3.4."},
    {id:"t6", br:"types",  name:"Цепь-линк",          cost: 1900000, need:["t4","t5"], lvl:24,
      desc:"Новый тип: CHAIN-LINK — пара A→B, лочить по порядку; за порядок крупный бонус."},
    // ---- FLOW -----------------------------------------------------------------
    {id:"f1", br:"flow",   name:"Ранний всплеск",     cost:   25000, need:[],         lvl:3,
      desc:"Узлы-всплеск (✦) появляются с 1-го уровня и чуть чаще."},
    {id:"f2", br:"flow",   name:"Долгий всплеск",     cost:  110000, need:["f1"],     lvl:7,
      desc:"Фаза-всплеск длится дольше (+40%). Больше времени в режиме ×2."},
    {id:"f3", br:"flow",   name:"Мягкий всплеск",     cost:  330000, need:["f2"],     lvl:11,
      desc:"В фазе-всплеск кольцо ускоряется слабее — рвать цепочку проще не стало, очки те же."},
    {id:"f4", br:"flow",   name:"Стек всплесков",     cost:  900000, need:["f3"],     lvl:16,
      desc:"Лок всплеска во время всплеска продлевает и поднимает множитель (×2→×2.5→×3)."},
    {id:"f5", br:"flow",   name:"Двойное кольцо",     cost: 2100000, need:["f4"],     lvl:25,
      desc:"На пике всплеска ~2с идёт второе кольцо-эхо как доп. цель тайминга (одно ядро, кап ≤3 цел)."},
    // ---- extra mechanical forks (round the tree to ~30, still no filler) -------
    {id:"r6", br:"rhythm", name:"Запас грации",       cost:  240000, need:["r3"],     lvl:9,
      desc:"Узел перед декогеренцией даёт короткое «окно спасения» — лочится даже на последних мгновениях."},
    {id:"c6", br:"chain",  name:"Зерно цепи",          cost:  300000, need:["c3"],     lvl:9,
      desc:"PERFECT не просто +1 к цепи, а +2 — мастерский тайминг быстрее растит множитель."},
    {id:"t7", br:"types",  name:"Заряженный твин",     cost:  820000, need:["t2","t3"], lvl:15,
      desc:"Твины могут быть заряженными (золотыми): редкий жирный узел, который ещё и двойной."},
    {id:"f6", br:"flow",   name:"Всплеск-щедрость",    cost:  560000, need:["f2"],     lvl:13,
      desc:"Лок узла-всплеска сразу подкидывает один бонус-узел в поле (в рамках капа ≤3)."},
  ];
  function upHas(s, id){ return s && s.up && s.up.indexOf(id) >= 0; }

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
  // up = array of owned upgrade ids (empty by default; renderer injects from store).
  function create(edgeR, up){
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
      ringDir:1,                       // +1 center->edge, -1 edge->center (r5 reverse-ring)
      nodes:[],
      spawnTimer: 0.5,
      refillTimer: 0.25,
      seed: 1234567,
      alive:true,
      surge:0,                         // seconds of active "phase surge" (v8 surprise layer)
      surgeMult:1,                     // current surge score mult (f4 stack lets this grow)
      slowmo:0,                        // seconds of perfect slow-mo remaining (r4)
      up: up ? up.slice() : [],        // owned upgrade ids for this run
      forgiveLeft: (up && up.indexOf("g2")>=0) ? 1 : 0,   // greedy cliff forgiveness (g2)
      keeperLeft:  (up && up.indexOf("c2")>=0) ? 1 : 0,   // combo-keeper: 1 miss survives (c2)
      greedyRun:0,                     // consecutive greedy locks (g4 stack)
      stats:{perfect:0, good:0, pure:0, miss:0, decohered:0, maxChain:0, locks:0,
             greedy:0, twins:0, surges:0, holds:0, echoes:0, links:0, cashouts:0},
      // event log for the renderer to react to (consumed each frame)
      events:[],
    };
  }

  function rng(s){ s.seed = (s.seed*1103515245 + 12345) & 0x7fffffff; return s.seed/0x7fffffff; }

  function beatLen(s){
    var b = lvlFloor(CFG.BEAT, CFG.BEAT_FLOOR, CFG.BEAT_STEP, s.level);
    if(s.surge>0){
      // f3 "soft surge": ring accelerates less during a surge
      b *= upHas(s,"f3") ? (CFG.SURGE_BEAT_MULT + (1-CFG.SURGE_BEAT_MULT)*0.5) : CFG.SURGE_BEAT_MULT;
    }
    if(s.slowmo>0) b *= 1.6;           // r4 perfect slow-mo: ring eases for a beat-ish
    return b;
  }
  function windowPx(s){
    var w = lvlFloor(CFG.WINDOW, CFG.WINDOW_FLOOR, CFG.WINDOW_STEP, s.level);
    if(upHas(s,"r1")) w *= 1.18;       // r1 wider timing window
    return w;
  }
  function nodeLife(s){
    var l = lvlFloor(CFG.NODE_LIFE, CFG.NODE_LIFE_FLOOR, 0.42, s.level);
    if(upHas(s,"r3")) l *= 1.20;       // r3 longer node life
    return l;
  }
  function spawnGap(s){ return lvlFloor(CFG.SPAWN, CFG.SPAWN_FLOOR, 0.16, s.level); }
  function chainHold(s){
    var h = lvlFloor(CFG.CHAIN_HOLD, CFG.CHAIN_HOLD_FLOOR, 0.18, s.level);
    if(upHas(s,"c1")) h *= 1.25;       // c1 chain holds longer
    return h;
  }
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
      kind:"normal",        // "normal"|"twin"|"surge"|"hold"|"echo"|"link"|"twin4"
      charged:false,        // gold, ×2 but volatile
      locksNeeded:1,
      locksDone:0,
      linkOrder:0,          // for CHAIN-LINK: 1 = A (lock first), 2 = B
      // pop animation handled by renderer via events
    };
    // --- role assignment (mutually exclusive). Upgrades shift levels/chances and
    //     unlock new kinds. Order matters: rarer/structural kinds checked first. ---
    var hasSurge=false, hasLink=false;
    for(var k=0;k<s.nodes.length;k++){
      if(s.nodes[k].kind==="surge"){ hasSurge=true; }
      if(s.nodes[k].kind==="link"){ hasLink=true; }
    }
    var surgeLvl  = upHas(s,"f1") ? 1 : CFG.SURGE_LEVEL;
    var surgeChc  = CFG.SURGE_CHANCE * (upHas(s,"f1") ? 1.5 : 1);
    var twinLvl   = upHas(s,"t1") ? 1 : CFG.TWIN_LEVEL;
    var twinChc   = CFG.TWIN_CHANCE * (upHas(s,"t1") ? 1.2 : 1);
    var chargeChc = CFG.CHARGE_CHANCE * (upHas(s,"t2") ? 1.5 : 1);
    var chargeLife= CFG.CHARGE_LIFE * (upHas(s,"t2") ? 1.25 : 1);

    if(upHas(s,"t6") && !hasLink && !hasSurge && s.level>=CFG.TWIN_LEVEL && rng(s) < 0.06){
      // CHAIN-LINK: spawn the A node now; its partner B spawns paired (below)
      nd.kind="link"; nd.linkOrder=1;
    } else if(s.level>=surgeLvl && !hasSurge && s.surge<=0 && rng(s) < surgeChc){
      nd.kind="surge";
    } else if(upHas(s,"t5") && s.level>=6 && rng(s) < 0.05){
      nd.kind="twin4"; nd.locksNeeded=4;                  // twin-of-twins (t5)
    } else if(upHas(s,"t3") && rng(s) < 0.14){
      nd.kind="hold"; nd.locksNeeded=2; nd.holdSamePass=true;  // HOLD (t3): 2 locks, one pass
    } else if(s.level>=twinLvl && rng(s) < twinChc){
      nd.kind="twin"; nd.locksNeeded=2;
      if(upHas(s,"t7") && rng(s) < 0.30){          // t7: twins can be charged (gold + double)
        nd.charged=true; nd.life=nd.maxLife;       // keep full life (twin needs two passes)
      }
    } else if(upHas(s,"t4") && rng(s) < 0.16){
      nd.kind="echo";                                     // ECHO (t4): leaves an echo on lock
    } else if(rng(s) < chargeChc){
      nd.charged=true;
      nd.life = life0*chargeLife; nd.maxLife = nd.life;
    }
    s.nodes.push(nd);

    // CHAIN-LINK partner B (only if we just made an A and there's room under the cap)
    if(nd.kind==="link" && s.nodes.length < CFG.MAX_NODES){
      var ang2 = ang + (rng(s)<0.5?1:-1)*(1.0+rng(s)*0.8);
      var rf2  = clamp(rf + (rng(s)<0.5?-1:1)*0.25, CFG.RFRAC_MIN, CFG.RFRAC_MAX);
      s.nodes.push({ang:ang2, rFrac:rf2, tone:TONES[Math.floor(rng(s)*n)],
        life:life0, maxLife:life0, born:s.t, hit:false, kind:"link", charged:false,
        locksNeeded:1, locksDone:0, linkOrder:2});
    }
  }

  // advance simulation by dt seconds
  function step(s, dt){
    if(!s.alive) return;
    s.t += dt;
    s.events.length = 0;

    // --- r4 perfect slow-mo timer ---
    if(s.slowmo>0){ s.slowmo -= dt; if(s.slowmo<0) s.slowmo=0; }

    // --- v8 surge timer: brief rule-flip after locking a surge node ---
    if(s.surge>0){
      s.surge -= dt;
      if(s.surge<=0){ s.surge=0; s.surgeMult=1; s.events.push({type:"surgeend"}); }
    }

    // --- ring travels center -> edge over one beat, then resets ---
    // r5 reverse-ring: when owned, the ring occasionally sweeps edge->center for a
    // beat (chosen deterministically per beat). Same lock rule, mirrored reading.
    var bl = beatLen(s);
    s.beatPhase += dt / bl;
    var crossed = false;
    while(s.beatPhase >= 1){
      s.beatPhase -= 1; crossed = true;
      if(upHas(s,"r5")){ s.ringDir = (rng(s) < 0.30) ? -1 : 1; }
      else s.ringDir = 1;
    }
    s.ringPrev = s.ring;
    var ph = s.ringDir>0 ? s.beatPhase : (1 - s.beatPhase);
    s.ring = Math.max(0, ph * s.edgeR);
    if(crossed){ s.events.push({type:"beat", dir:s.ringDir}); }

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
    // r6 "запас грации": a node on the verge of decohering gets a wider catch window,
    // so a last-instant lock can still save it (rewards reading dying nodes).
    if(upHas(s,"r6") && nd.maxLife>0 && (nd.life/nd.maxLife) < 0.25){ win *= 1.45; }
    var nr = nodeRadius(s, nd);
    var d = s.ring - nr;             // signed: <0 ring still approaching, >0 ring already leaving
    var err = d<0 ? -d : d;

    // CHAIN-LINK (t6): a B node can't be locked before its A partner is gone.
    if(nd.kind==="link" && nd.linkOrder===2){
      var aAlive=false;
      for(var li=0;li<s.nodes.length;li++){ if(s.nodes[li].kind==="link" && s.nodes[li].linkOrder===1){ aAlive=true; break; } }
      if(aAlive){
        // pressing B first = a fumble: small penalty, no progress (teaches the order)
        s.health = clamp(s.health - CFG.H_MISTAP*0.5, 0, CFG.H_MAX);
        s.events.push({type:"linkwrong", ang:nd.ang, rFrac:nd.rFrac});
        return {result:"linkwrong"};
      }
    }

    if(err > win){
      var overBy = err - win;                  // how far past the window the press landed
      // g2 "край прощения": forgives ONE narrow overshoot just past the GREEDY cliff
      // (rode the greedy lock a hair too far). Tight: only d>0 and a small overshoot.
      if(s.chain>0 && s.forgiveLeft>0 && d>0 && overBy <= win*0.5){
        s.forgiveLeft--;
        s.health = clamp(s.health - CFG.H_MISTAP*0.5, 0, CFG.H_MAX);
        s.stats.miss++;
        s.events.push({type:"forgive", ang:nd.ang, rFrac:nd.rFrac, chain:s.chain});
        if(s.health<=0){ die(s); }
        return {result:"keepersave", chain:s.chain, forgive:true};
      }
      // c2 combo-keeper can save the chain once per run on ANY miss.
      if(s.chain>0 && s.keeperLeft>0){
        s.keeperLeft--;
        s.health = clamp(s.health - CFG.H_MISTAP, 0, CFG.H_MAX);
        s.stats.miss++;
        s.events.push({type:"keepersave", ang:nd.ang, rFrac:nd.rFrac, chain:s.chain});
        if(s.health<=0){ die(s); }
        return {result:"keepersave", chain:s.chain};
      }
      s.chain = 0; s.chainTimer = 0; s.greedyRun = 0;
      s.health = clamp(s.health - CFG.H_MISTAP, 0, CFG.H_MAX);
      s.stats.miss++;
      s.events.push({type:"miss", ang:nd.ang, rFrac:nd.rFrac});
      if(s.health<=0){ die(s); }
      return {result:"miss"};
    }

    // timing identity. r2 sharpens the PERFECT zone but raises its multiplier.
    var critFrac = CFG.CRIT_FRAC * (upHas(s,"r2") ? (1/1.5) : 1);
    var critMult = upHas(s,"r2") ? 4 : CFG.CRIT_MULT;
    var critEdge = win*critFrac;
    var crit = err <= critEdge;
    var pure = nd.tone === ringTone(s);
    var mult = 1, kindLabel = "good", greedyFrac = 0, isGreedy=false;
    if(crit){
      mult *= critMult; s.stats.perfect++; kindLabel = "perfect";
      if(upHas(s,"r4")) s.slowmo = Math.max(s.slowmo, 0.4);   // r4 slow-mo on perfect
      if(upHas(s,"c6")) s.chain += 1;                         // c6: PERFECT seeds +1 extra chain
    } else if(d > 0){
      greedyFrac = clamp((err - critEdge)/(win - critEdge), 0, 1);
      var gain = CFG.GREEDY_GAIN;
      if(upHas(s,"g3")) gain = 5.0;          // risk mode: cap ~×6
      else if(upHas(s,"g1")) gain = 3.8;     // greedy hand: cap ~×4.8
      mult *= 1 + gain*greedyFrac;
      if(greedyFrac >= CFG.GREEDY_NAME_FRAC){ s.stats.greedy++; kindLabel = "greedy"; isGreedy=true; }
    }
    if(pure){
      mult *= CFG.PURE_MULT; s.stats.pure++;
      if(isGreedy && upHas(s,"g5")) mult *= 2;   // g5: pure×greedy doubles
    }
    if(nd.charged){ mult *= CFG.CHARGE_MULT; }

    // g4 greedy stack: consecutive greedy locks build a growing bonus
    if(upHas(s,"g4")){
      if(isGreedy){ s.greedyRun++; if(s.greedyRun>=3) mult *= 1 + Math.min(0.6, (s.greedyRun-2)*0.12); }
      else s.greedyRun = 0;
    }

    var chainStep = CFG.CHAIN_MULT * (upHas(s,"c3") ? 1.4 : 1);   // c3 fat chain

    // --- multi-lock ARM phase (twin / hold / twin4): not the final lock yet ---
    if(nd.locksNeeded>1 && (nd.locksDone+1) < nd.locksNeeded){
      nd.locksDone++;
      // HOLD stays in the SAME ring pass (don't refresh life); twin/twin4 refuel for next pass
      if(!nd.holdSamePass){ nd.life = nodeLife(s); nd.maxLife = nd.life; }
      var armBonus = 1 + s.chain*chainStep;
      var armGain = Math.round(CFG.SCORE_BASE * mult * 0.5 * armBonus);
      if(s.surge>0) armGain = Math.round(armGain*s.surgeMult);
      s.score += armGain;
      s.chain++; s.chainTimer = chainHold(s);
      if(s.chain > s.stats.maxChain) s.stats.maxChain = s.chain;
      s.health = clamp(s.health + CFG.H_LOCK*0.5, 0, CFG.H_MAX);
      s.events.push({type:"twinarm", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone,
                     gained:armGain, chain:s.chain, kind:nd.kind,
                     left:nd.locksNeeded-nd.locksDone});
      return {result:"twinarm", gained:armGain, chain:s.chain, kind:nd.kind};
    }

    // --- completing lock ---
    if(nd.kind==="twin"){ mult *= CFG.TWIN_BONUS; s.stats.twins++; }
    else if(nd.kind==="hold"){ mult *= 2.6; s.stats.holds++; }
    else if(nd.kind==="twin4"){ mult *= 3.4; s.stats.twins++; }
    else if(nd.kind==="link"){ mult *= 1.8; s.stats.links++; }

    var chainBonus = 1 + s.chain*chainStep;
    var gained = Math.round(CFG.SCORE_BASE * mult * chainBonus);

    // c4 chain cash-out: at chain>=10, this lock pays a one-shot ×(chain/8), then chain burns.
    var cashedOut=false;
    if(upHas(s,"c4") && s.chain>=10){
      gained = Math.round(gained * (s.chain/8));
      cashedOut=true; s.stats.cashouts++;
    }
    if(s.surge>0) gained = Math.round(gained*s.surgeMult);
    s.score += gained;

    if(cashedOut){
      // c5 double-bank keeps half the chain instead of dropping to 0
      s.chain = upHas(s,"c5") ? Math.floor(s.chain/2) : 0;
      s.chainTimer = s.chain>0 ? chainHold(s) : 0;
    } else {
      s.chain++;
      s.chainTimer = chainHold(s);
    }
    if(s.chain > s.stats.maxChain) s.stats.maxChain = s.chain;
    s.stats.locks++;
    s.health = clamp(s.health + CFG.H_LOCK, 0, CFG.H_MAX);

    // SURGE node: flips the rules for a few seconds. f2 longer, f4 stacks the mult.
    var triggeredSurge = false;
    if(nd.kind==="surge"){
      var dur = CFG.SURGE_DUR * (upHas(s,"f2") ? 1.4 : 1);
      if(s.surge>0 && upHas(s,"f4")){
        s.surge = Math.max(s.surge, dur);
        s.surgeMult = Math.min(3, s.surgeMult + 0.5);   // ×2 -> ×2.5 -> ×3
      } else {
        s.surge = dur; s.surgeMult = CFG.SURGE_SCORE_MULT;
      }
      s.stats.surges++; triggeredSurge = true;
      // f6: locking a surge tosses one bonus node into the field (respecting the cap)
      if(upHas(s,"f6") && s.nodes.length < CFG.MAX_NODES-1){
        var bn=nodeLife(s);
        var bang=nd.ang + (rng(s)<0.5?1:-1)*(1.0+rng(s)*0.7);
        var brf=clamp((nd.rFrac||1)+(rng(s)<0.5?-1:1)*0.22, CFG.RFRAC_MIN, CFG.RFRAC_MAX);
        s.nodes.push({ang:bang, rFrac:brf, tone:TONES[Math.floor(rng(s)*tonesForLevel(s.level))],
          life:bn, maxLife:bn, born:s.t, hit:false, kind:"normal", charged:true,
          locksNeeded:1, locksDone:0, fromSurge:true});
      }
      s.events.push({type:"surgestart", dur:dur, mult:s.surgeMult, doublering:upHas(s,"f5")});
    }

    s.nodes.splice(idx,1);

    // ECHO (t4): leaving behind an echo node at the same spot = instant 2nd chance
    if(nd.kind==="echo"){
      s.stats.echoes++;
      var el = nodeLife(s)*0.7;
      s.nodes.push({ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone, life:el, maxLife:el,
        born:s.t, hit:false, kind:"normal", charged:false, locksNeeded:1, locksDone:0,
        fromEcho:true});
      s.events.push({type:"echospawn", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone});
    }

    s.events.push({type:"lock", ang:nd.ang, rFrac:nd.rFrac, tone:nd.tone, crit:crit, pure:pure,
                   gained:gained, chain:s.chain, label:kindLabel, greedy:greedyFrac,
                   charged:!!nd.charged, kind:nd.kind, surge:triggeredSurge, cashout:cashedOut});
    return {result: crit?"perfect":(kindLabel==="greedy"?"greedy":"good"),
            pure:pure, gained:gained, chain:s.chain, charged:!!nd.charged, kind:nd.kind,
            cashout:cashedOut};
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
    CFG:CFG, TONES:TONES, UPGRADES:UPGRADES, upHas:upHas,
    create:create, step:step, pressSpace:pressSpace, pressAt:pressAt, pressNear:pressNear,
    resolveHit:resolveHit, bestNode:bestNode, nodeError:nodeError,
    beatLen:beatLen, windowPx:windowPx, ringTone:ringTone,
    levelThreshold:levelThreshold, tonesForLevel:tonesForLevel,
    nodeLife:nodeLife, spawnGap:spawnGap, chainHold:chainHold,
    refillGap:refillGap, targetNodes:targetNodes, nodeRadius:nodeRadius,
    clamp:clamp,
  };
})();
module.exports = PhaseCore;
