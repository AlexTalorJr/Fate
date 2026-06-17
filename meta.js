var PhaseMeta = (function(){
  // mulberry32 — tiny deterministic PRNG
  function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296; }; }

  // a curated pool of plausible "phaser" handles (neutral, gamer-ish, multi-culture)
  var NAMES = ["NovaPulse","K1rin","echo_77","Vortex","mira.s","glitchwave","ZenBeat","r0nin",
    "lumen","Phaze","KaiAtlas","s0nic_bloom","drift","Nebula","oksi","Tempo","Quark","viv4",
    "halcyon","b1tflux","Aria","Crater","n0 va","Pulsewidth","Marlow","Strobe","km.dev","Resa",
    "Onyx","wavelen","Cipher","Lyra_","toma","FluxCap","Andro","Skye","Zephyr","mox","Helix",
    "Vega","Cobalt","r1ft","Sable","Nyx","Orbit","kx9","Lumina","Dax","Prism"];
  var AVHEX = ["#39e6ff","#ff4fd8","#ffc24b","#9b7bff","#7fffd4","#ff9e7a"];

  function dayNum(now){
    var d = now? new Date(now) : new Date();
    return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);
  }

  // Build today's bot field. Count ~ 40. Scores follow a long-tail distribution so the
  // top is impressive but the mid-field is beatable by a real player (key for "I can climb").
  function dailyField(day, count){
    count = count||40;
    var rnd = mulberry(day*2654435761 + 101);
    // pick a stable subset + order of names for the day
    var pool = NAMES.slice();
    for(var i=pool.length-1;i>0;i--){ var j=Math.floor(rnd()*(i+1)); var t=pool[i];pool[i]=pool[j];pool[j]=t; }
    var names = pool.slice(0, count);
    var arr=[];
    // top score of the day: 1.6M..3.0M; long tail down to a few thousand so the
    // mid/lower field is realistically beatable by a learning player (the climb hook)
    var top = 1600000 + Math.floor(rnd()*1400000);
    for(var k=0;k<count;k++){
      // exponential-ish decay with jitter
      var frac = Math.pow(1 - k/count, 2.35);
      var jitter = 0.88 + rnd()*0.24;
      var sc = Math.max(800, Math.round(top*frac*jitter/10)*10);
      arr.push({ name:names[k], score:sc, av:AVHEX[Math.floor(rnd()*AVHEX.length)], bot:true });
    }
    arr.sort(function(a,b){return b.score-a.score;});
    return arr;
  }

  // Merge the player's entries (real past bests) into the field, dedupe by being "me".
  // meScore: the score to place RIGHT NOW (live or final). Returns {list, rank, total, justName}
  function standings(day, meScore, meName, pastBests){
    var field = dailyField(day);
    // include up to 3 of the player's own previous runs as ghosts (named "ты ·")
    var ghosts = (pastBests||[]).slice(0,3).map(function(s,i){
      return { name:"ты · заезд", score:s, av:"#39e6ff", me:false, ghost:true };
    });
    var all = field.concat(ghosts);
    all.push({ name: meName||"ТЫ", score: meScore||0, av:"#39e6ff", me:true });
    all.sort(function(a,b){return b.score-a.score;});
    var rank = all.findIndex(function(r){return r.me;})+1;
    return { list:all, rank:rank, total:all.length };
  }

  // Given previous score and new score, who did you pass? returns array of names passed.
  function passedBetween(day, prevScore, newScore, meName, pastBests){
    if(newScore<=prevScore) return [];
    var field = dailyField(day);
    var ghosts = (pastBests||[]).map(function(s){return {name:"твой прошлый заезд",score:s};});
    var pool = field.concat(ghosts);
    return pool.filter(function(r){ return r.score>prevScore && r.score<=newScore; })
               .sort(function(a,b){return a.score-b.score;});
  }

  /* ---- session goal (rotates, beatable, escalates with skill) ---- */
  function sessionGoal(day, best){
    var rnd = mulberry(day*40503 + 7);
    var kinds = [
      {id:"score", make:function(){ var base = best>0 ? Math.round(best*1.12/1000)*1000 : 80000;
        var tgt=Math.max(40000,base); return {id:"score", target:tgt, label:"Набей "+fmt(tgt), unit:"score"}; }},
      {id:"level", make:function(){ var L = best>300000?12:(best>80000?9:6);
        return {id:"level", target:L, label:"Дойди до уровня "+L, unit:"level"}; }},
      {id:"chain", make:function(){ var ch = best>300000?40:20;
        return {id:"chain", target:ch, label:"Собери цепь ×"+ch, unit:"chain"}; }},
      {id:"perfect", make:function(){ return {id:"perfect", target: 25, label:"25 PERFECT за заезд", unit:"perfect"}; }},
    ];
    return kinds[Math.floor(rnd()*kinds.length)].make();
  }
  function goalProgress(goal, G){
    if(!goal||!G) return 0;
    var v = goal.unit==="score"?G.score : goal.unit==="level"?G.level :
            goal.unit==="chain"?G.stats.maxChain : G.stats.perfect;
    return Math.min(1, v/goal.target);
  }

  /* ---- streak ---- */
  function updateStreak(store){
    var today = (function(){var d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);})();
    var last = +(store.get("streakDay")||0);
    var n = +(store.get("streakN")||0);
    if(last===today){ /* same day, keep */ }
    else if(last===today-1){ n=n+1; store.set("streakN",n); store.set("streakDay",today); }
    else { n=1; store.set("streakN",1); store.set("streakDay",today); }
    if(n<1){ n=1; store.set("streakN",1); store.set("streakDay",today); }
    return n;
  }

  /* ---- unlockables (cosmetic core themes) by lifetime milestones ---- */
  var THEMES = [
    {id:"aurora", name:"Aurora",  need:0,        core:"#39e6ff"},
    {id:"ember",  name:"Ember",   need:150000,   core:"#ffc24b"},
    {id:"orchid", name:"Orchid",  need:500000,   core:"#ff4fd8"},
    {id:"violet", name:"Singularity", need:1200000, core:"#9b7bff"},
  ];
  function unlockedThemes(best){ return THEMES.filter(function(t){return best>=t.need;}); }
  function nextTheme(best){ return THEMES.find(function(t){return best<t.need;})||null; }

  function fmt(n){ return (n||0).toLocaleString("ru-RU"); }

  return {
    _mulberry:mulberry, dailyField:dailyField, standings:standings,
    passedBetween:passedBetween, sessionGoal:sessionGoal, goalProgress:goalProgress,
    updateStreak:updateStreak, unlockedThemes:unlockedThemes, nextTheme:nextTheme,
    THEMES:THEMES, NAMES:NAMES, fmt:fmt,
    today:function(){var d=new Date();return Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);}
  };
})();
if(typeof module!=="undefined" && module.exports){ module.exports = (module.exports, PhaseMeta); }
