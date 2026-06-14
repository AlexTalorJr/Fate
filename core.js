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
//
// MECHANIC: a focus exists wherever the *front circles* of two live sources currently
// intersect. (Front circle of a source = circle of radius age*speed centered at the source.)
// A mark is hit when such an intersection point lands within the mark's catch radius.
// This is achievable by hand: you place two sources, their expanding rings cross at two
// moving points, and you steer those crossing points through the mark — no frame-perfect
// timing required, because the crossing persists for as long as both rings overlap.

// front radius of a source at time t (>=0), or -1 if not emitting / expired
function frontRadius(s,t,spd){
  const age=t-s.born;
  if(age<0 || age>CFG.SOURCE_LIFE*0.95) return -1;
  return age*spd;
}
function sourceDecay(s,t){
  const age=t-s.born;
  return Math.max(0,1-age/CFG.SOURCE_LIFE);
}
// intersection points of two circles (c1,r1),(c2,r2). Returns array of {x,y} (0,1, or 2 pts).
function circleIntersections(x1,y1,r1,x2,y2,r2){
  const d=hypot(x1,y1,x2,y2);
  if(d===0) return [];
  if(d>r1+r2) return [];          // too far apart
  if(d<Math.abs(r1-r2)) return []; // one inside the other
  const a=(r1*r1-r2*r2+d*d)/(2*d);
  const h2=r1*r1-a*a;
  if(h2<0) return [];
  const h=Math.sqrt(h2);
  const xm=x1+a*(x2-x1)/d, ym=y1+a*(y2-y1)/d;
  const ox=-(y2-y1)/d*h, oy=(x2-x1)/d*h;
  if(h<1e-6) return [{x:xm,y:ym}];
  return [{x:xm+ox,y:ym+oy},{x:xm-ox,y:ym-oy}];
}

function evalMark(m,t,sources,level){
  if(m.hit) return null;
  const spd=speedForLevel(level);
  const catchR=m.r+CFG.FRONT_BAND;          // generous catch radius around the mark
  const need=m.isSuper?3:2;
  // collect live fronts
  const fronts=[];
  for(const s of sources){
    const r=frontRadius(s,t,spd);
    if(r<0) continue;
    if(sourceDecay(s,t)<=0.12) continue;
    fronts.push({s,r});
  }
  if(fronts.length<2) return null;
  // count how many distinct sources contribute a front-intersection near the mark
  const contributingSources=new Set();
  let sameTone=0; const sameToneSources=new Set();
  for(let i=0;i<fronts.length;i++){
    for(let j=i+1;j<fronts.length;j++){
      const A=fronts[i], B=fronts[j];
      const pts=circleIntersections(A.s.x,A.s.y,A.r, B.s.x,B.s.y,B.r);
      for(const p of pts){
        if(hypot(p.x,p.y,m.x,m.y)<=catchR){
          contributingSources.add(A.s); contributingSources.add(B.s);
          if(A.s.tone===m.tone) sameToneSources.add(A.s);
          if(B.s.tone===m.tone) sameToneSources.add(B.s);
        }
      }
    }
  }
  const contributors=contributingSources.size;
  if(contributors>=need && sameToneSources.size>=1){
    return {contributors, pure:(sameToneSources.size===contributors), amp:contributors};
  }
  return null;
}

// near miss: fronts cross close to (but not on) the mark, or only one front passes through it.
function isNearMiss(m,t,sources,level){
  if(m.hit) return false;
  const spd=speedForLevel(level);
  const catchR=m.r+CFG.FRONT_BAND;
  const nearR=catchR*2.2;
  const fronts=[];
  for(const s of sources){
    const r=frontRadius(s,t,spd);
    if(r<0||sourceDecay(s,t)<=0.12) continue;
    fronts.push({s,r});
  }
  // a single front sweeping through the mark
  let single=0;
  for(const f of fronts){ if(Math.abs(hypot(f.s.x,f.s.y,m.x,m.y)-f.r)<CFG.FRONT_BAND) single++; }
  if(single>=1 && fronts.length<2) return true;
  // crossing point just outside the catch radius
  for(let i=0;i<fronts.length;i++)for(let j=i+1;j<fronts.length;j++){
    const A=fronts[i],B=fronts[j];
    const pts=circleIntersections(A.s.x,A.s.y,A.r,B.s.x,B.s.y,B.r);
    for(const p of pts){const d=hypot(p.x,p.y,m.x,m.y); if(d>catchR && d<nearR) return true;}
  }
  return false;
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

// ---- prediction (the teaching UX) ----
// If a NEW source were dropped at (px,py) now, simulate forward and report whether/when
// its front will cross an existing source's front on top of a live mark -> a focus.
// Returns {mark, when, quality} (quality 0..1 = how soon / how clean) or null.
function predictDrop(px,py,t,sources,marks,level){
  const spd=speedForLevel(level);
  const fresh={x:px,y:py,born:t,tone:0};
  let best=null;
  const horizon=CFG.SOURCE_LIFE*0.9;
  const dtStep=0.04;
  for(const m of marks){
    if(m.hit) continue;
    const catchR=m.r+CFG.FRONT_BAND;
    for(let dtT=0.02; dtT<horizon; dtT+=dtStep){
      const tt=t+dtT;
      if(tt>t+m.life) break;             // mark gone by then
      const rNew=frontRadius(fresh,tt,spd);
      if(rNew<0) break;
      // does the fresh front pass within catchR of the mark right now? (necessary)
      if(Math.abs(hypot(px,py,m.x,m.y)-rNew)>catchR) continue;
      // is there an existing source whose front also passes the mark at tt?
      for(const s of sources){
        const rOld=frontRadius(s,tt,spd);
        if(rOld<0||sourceDecay(s,tt)<=0.12) continue;
        if(Math.abs(hypot(s.x,s.y,m.x,m.y)-rOld)<=catchR){
          const quality=Math.max(0,1-dtT/horizon);
          if(!best||quality>best.quality) best={mark:m,when:tt,quality,dt:dtT};
          break;
        }
      }
      if(best&&best.mark===m) break;     // earliest crossing for this mark is enough
    }
  }
  return best;
}

const API={TONES,CFG,hypot,speedForLevel,fieldAt,evalMark,isNearMiss,scoreHit,
  levelThreshold,tonesAtLevel,markLife,spawnEvery,
  frontRadius,sourceDecay,circleIntersections,predictDrop};

if(typeof module!=="undefined"&&module.exports) module.exports=API;
root.PHASE_CORE=API;
return API;
})(typeof globalThis!=="undefined"?globalThis:this);
