// core.js — pure game logic for PHASE v2, no DOM. Used by both the game and the regression tests.
(function(root){
"use strict";

const TONES=[
  {name:"cyan",    rgb:[39,224,208],  freq:392},
  {name:"magenta", rgb:[255,77,141],  freq:523},
  {name:"amber",   rgb:[255,193,77],  freq:659},
  {name:"violet",  rgb:[154,107,255], freq:784},
];

const CFG={
  FIELD_SPEED:130,
  SOURCE_COST:0.30,
  SOURCE_LIFE:4.2,
  WAVELENGTH:62,
  RING_WIDTH:46,
  FRONT_BAND:30,        // px tolerance for a front "passing" a mark
  CHARGE_REGEN:0.42,    // per second
  CHARGE_REFUND:0.20,   // per successful hit
  HEALTH_REGEN:0.018,
  HEALTH_HIT:0.16,      // damage when a mark decoheres
  HEALTH_REWARD:0.04,
  CHAIN_WINDOW:2.6,
  CRIT_CHANCE:0.16,     // variable reward
  CRIT_MULT:3,
  OVERCHARGE_MULT:2.2,  // staking mode
};

function hypot(ax,ay,bx,by){const dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy);}

function speedForLevel(level){ return CFG.FIELD_SPEED*(1+(level-1)*0.05); }

// amplitude of the wave field at a point and time, given sources & absorbers
function fieldAt(px,py,t,sources,absorbers,level){
  let sum=0;
  const spd=speedForLevel(level);
  const k=2*Math.PI/CFG.WAVELENGTH;
  const rw=CFG.RING_WIDTH;
  const W=root.__FIELD_W||1280, H=root.__FIELD_H||720;
  for(let s of sources){
    const age=t-s.born; if(age<0) continue;
    const dist=hypot(px,py,s.x,s.y);
    const frontR=age*spd;
    const dr=dist-frontR;
    if(dr>10 || dr<-260) continue;
    const envelope=Math.exp(-(dr*dr)/(2*rw*rw));
    const wave=Math.cos(k*dr);
    const decay=Math.max(0,1-age/CFG.SOURCE_LIFE)*Math.max(0,1-dist/Math.max(W,H));
    sum+=wave*envelope*decay;
  }
  for(let a of absorbers){
    const d=hypot(px,py,a.x,a.y);
    if(d<a.r) sum*=Math.max(0,d/a.r);
  }
  return sum;
}

// Evaluate whether a mark is currently struck. Returns null or a hit descriptor.
// Pure: takes explicit state, deterministic given rng() injected.
function evalMark(m,t,sources,level){
  if(m.hit) return null;
  const spd=speedForLevel(level);
  let contributors=0, amp=0, sameTone=0;
  for(let s of sources){
    const age=t-s.born; if(age<0) continue;
    const dist=hypot(m.x,m.y,s.x,s.y);
    const dr=dist-age*spd;
    if(Math.abs(dr)<CFG.FRONT_BAND){
      const decay=Math.max(0,1-age/CFG.SOURCE_LIFE);
      if(decay>0.12){
        contributors++;
        amp+=Math.cos(2*Math.PI*dr/CFG.WAVELENGTH)*decay;
        if(s.tone===m.tone) sameTone++;
      }
    }
  }
  if(contributors>=2 && amp>1.05 && sameTone>=1){
    return {contributors, pure:(sameTone===contributors), amp};
  }
  return null;
}

// near miss: exactly one strong front on the mark, or 2 fronts that are out of phase.
function isNearMiss(m,t,sources,level){
  if(m.hit) return false;
  const spd=speedForLevel(level);
  let contributors=0, amp=0;
  for(let s of sources){
    const age=t-s.born; if(age<0) continue;
    const dr=hypot(m.x,m.y,s.x,s.y)-age*spd;
    if(Math.abs(dr)<CFG.FRONT_BAND){
      const decay=Math.max(0,1-age/CFG.SOURCE_LIFE);
      if(decay>0.12){contributors++; amp+=Math.cos(2*Math.PI*dr/CFG.WAVELENGTH)*decay;}
    }
  }
  return (contributors>=2 && amp<=1.05 && amp>0.2) || (contributors===1 && amp>0.6);
}

// scoring for a confirmed hit
function scoreHit(hit, chain, overcharge, crit){
  let g=(90+hit.contributors*40);
  if(hit.pure) g*=1.6;
  g*=chain;
  if(overcharge) g*=CFG.OVERCHARGE_MULT;
  if(crit) g*=CFG.CRIT_MULT;
  return Math.round(g);
}

// score threshold to reach a given level
function levelThreshold(level){ return level*900 + level*level*120; }

// how many simultaneous tones are unlocked at a level
function tonesAtLevel(level){ return Math.min(TONES.length, 1+Math.floor((level-1)/3)); }

// mark lifetime shrinks with level but never below floor
function markLife(level){ return Math.max(3.0, 7.5-(level-1)*0.28); }

// spawn cadence
function spawnEvery(level){ return Math.max(0.85, 2.6-(level-1)*0.13); }

const API={TONES,CFG,hypot,speedForLevel,fieldAt,evalMark,isNearMiss,scoreHit,
  levelThreshold,tonesAtLevel,markLife,spawnEvery};

if(typeof module!=="undefined"&&module.exports) module.exports=API;
root.PHASE_CORE=API;
})(typeof globalThis!=="undefined"?globalThis:this);
