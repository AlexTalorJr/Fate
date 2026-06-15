// core.js — pure game logic for PHASE v5, no DOM. Shared by the game and the regression suite.
//
// DESIGN (v5): the v4 loop was "place two sources, wait ~1.5s for their rings to cross
// on a target." That wait is dead time — a planner, not a reflex. v5 makes sources into
// *pulsars*: each one re-emits a ring on a fixed period for as long as it lives, so the
// field is a continuous, rhythmic lattice of moving crossings. You don't place-and-wait;
// you keep a beat going and steer the live crossings through targets. Targets don't pop on
// one perfect frame — they soak "resonance" while a crossing sits on them and clear when
// full, so feedback is immediate and you can *see* a kill building.
(function(root){
"use strict";

const TONES=[
  {name:"cyan",    rgb:[39,224,208],  freq:392},
  {name:"magenta", rgb:[255,77,141],  freq:523},
  {name:"amber",   rgb:[255,193,77],  freq:659},
  {name:"violet",  rgb:[154,107,255], freq:784},
];

const CFG={
  FIELD_SPEED:150,
  SOURCE_COST:0.26,
  SOURCE_LIFE:5.4,       // pulsars live a bit longer so the beat sustains
  PULSE_PERIOD:0.92,     // a live source re-emits a ring this often (the heartbeat)
  WAVELENGTH:62,
  RING_WIDTH:46,
  FRONT_BAND:34,         // px tolerance for a front "passing" a mark
  CHARGE_REGEN:0.50,     // per second — faster so you can keep a beat going
  CHARGE_REFUND:0.16,    // per cleared mark
  HEALTH_REGEN:0.010,
  HEALTH_HIT:0.16,       // damage when a mark decoheres (per mark, scaled)
  HEALTH_REWARD:0.035,
  CHAIN_WINDOW:3.4,      // generous — the chain is the whole hook, it must be buildable
  CRIT_CHANCE:0.17,      // variable reward
  CRIT_MULT:3,
  OVERCHARGE_MULT:2.2,   // staking mode
  // resonance: a mark fills by the *proximity* of the nearest qualifying crossing (gaussian),
  // so even a fast sweep deposits energy on each pass and a few pulses clear the mark. This
  // turns a binary one-frame "hit" into a satisfying sweep-to-kill you can watch build.
  RESONANCE_FILL:8.0,    // resonance/sec at a dead-centre crossing (tuned: flank pair clears ~1.3-2s)
  RESONANCE_DRAIN:0.35,  // resonance/sec bleed when nothing qualifies (slow, so progress sticks)
  RESONANCE_CAPTURE:1.35,// crossing counts toward "contributing" out to catchR*this
  RESONANCE_MAX:1.0,
};

function hypot(ax,ay,bx,by){const dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy);}

function speedForLevel(level){ return CFG.FIELD_SPEED*(1+(level-1)*0.045); }

// amplitude of the wave field at a point and time (visual layer only)
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

// ---- pulsar fronts ----
// A source is a pulsar: while alive it emits a fresh expanding ring every PULSE_PERIOD.
// At time t it therefore has SEVERAL concentric live fronts (the current pulse plus the
// previous ones still expanding). We return all of their radii.
function sourceDecay(s,t){
  const age=t-s.born;
  return Math.max(0,1-age/CFG.SOURCE_LIFE);
}
function sourceAlive(s,t){
  const age=t-s.born;
  return age>=0 && age<=CFG.SOURCE_LIFE*0.985;
}
// All live front radii of a pulsar at time t, sorted large->small. A ring is "live" while
// its radius is below a cap (it fades once it has travelled a few wavelengths past its peak).
function frontRadii(s,t,spd){
  if(!sourceAlive(s,t)) return [];
  const out=[];
  const maxAge=CFG.SOURCE_LIFE*0.985;
  const ringMaxR=CFG.WAVELENGTH*5; // a single emitted ring is meaningful out to ~5 wavelengths
  // pulses are emitted at s.born + n*PULSE_PERIOD for n=0,1,2,...
  for(let n=0;;n++){
    const emit=s.born+n*CFG.PULSE_PERIOD;
    if(emit>t) break;
    if(emit>s.born+maxAge) break;
    const r=(t-emit)*spd;
    if(r<=ringMaxR) out.push(r);
  }
  return out.sort((a,b)=>b-a);
}
// Backwards-compatible single-front radius: the leading (current pulse) front, or -1.
function frontRadius(s,t,spd){
  if(!sourceAlive(s,t)) return -1;
  const phase=(t-s.born)%CFG.PULSE_PERIOD;
  return phase*spd;
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

// All live crossing points on the field right now: where any two pulsar fronts intersect.
// Returns [{x,y,a,b}] where a,b are the contributing source objects. Used by both the
// resolver and the renderer (the renderer draws these as the bright steerable sparks).
function liveCrossings(t,sources,level){
  const spd=speedForLevel(level);
  const fr=[];
  for(const s of sources){
    if(sourceDecay(s,t)<=0.10) continue;
    for(const r of frontRadii(s,t,spd)) fr.push({s,r});
  }
  const out=[];
  for(let i=0;i<fr.length;i++)for(let j=i+1;j<fr.length;j++){
    const A=fr[i],B=fr[j];
    if(A.s===B.s) continue; // don't cross a pulsar's own concentric rings
    const pts=circleIntersections(A.s.x,A.s.y,A.r,B.s.x,B.s.y,B.r);
    for(const p of pts) out.push({x:p.x,y:p.y,a:A.s,b:B.s});
  }
  return out;
}

// Evaluate the focus state of a mark right now. Returns null, or a descriptor of how many
// distinct sources are driving a crossing within the mark's (extended) capture zone, plus
// pureness and the closeness of the best crossing. Does NOT clear the mark — clearing is
// gated on resonance (see fillMark).
function evalMark(m,t,sources,level){
  if(m.hit) return null;
  const catchR=m.r+CFG.FRONT_BAND;
  const capR=catchR*CFG.RESONANCE_CAPTURE;
  const need=m.isSuper?3:2;
  const contributing=new Set();
  const sameTone=new Set();
  let best=0; // gaussian closeness in [0,1] of the nearest crossing
  const cx=liveCrossings(t,sources,level);
  for(const c of cx){
    const d=hypot(c.x,c.y,m.x,m.y);
    if(d<=capR){
      contributing.add(c.a); contributing.add(c.b);
      if(c.a.tone===m.tone) sameTone.add(c.a);
      if(c.b.tone===m.tone) sameTone.add(c.b);
      const w=Math.exp(-(d*d)/(2*catchR*catchR));
      if(w>best) best=w;
    }
  }
  const contributors=contributing.size;
  if(contributors>=need && sameTone.size>=1){
    return {contributors, pure:(sameTone.size===contributors), amp:contributors, close:best};
  }
  return null;
}

// Resonance integration for one mark over dt. Mutates m.res in [0,RESONANCE_MAX].
// Returns {full, focus} where full=true the instant the mark tops out, focus is the
// evalMark result (or null). This is the per-frame heartbeat of scoring.
function fillMark(m,t,dt,sources,level){
  if(m.hit) return {full:false,focus:null};
  if(m.res==null) m.res=0;
  const focus=evalMark(m,t,sources,level);
  if(focus){
    // fill by closeness of the nearest crossing; denser lattices (more contributors) fill faster
    m.res+=CFG.RESONANCE_FILL*dt*focus.close*(1+(focus.contributors-2)*0.45);
  }else{
    m.res-=CFG.RESONANCE_DRAIN*dt;
  }
  if(m.res<0)m.res=0;
  let full=false;
  if(m.res>=CFG.RESONANCE_MAX){ m.res=CFG.RESONANCE_MAX; full=true; }
  return {full, focus};
}

// near miss: a crossing is close to (but not on) the mark, or a single front sweeps it.
function isNearMiss(m,t,sources,level){
  if(m.hit) return false;
  const spd=speedForLevel(level);
  const catchR=m.r+CFG.FRONT_BAND;
  const nearR=catchR*2.2;
  const cx=liveCrossings(t,sources,level);
  for(const c of cx){const d=hypot(c.x,c.y,m.x,m.y); if(d>catchR && d<nearR) return true;}
  // a lone front sweeping through the mark (no crossing yet)
  let single=0;
  for(const s of sources){
    if(sourceDecay(s,t)<=0.10) continue;
    for(const r of frontRadii(s,t,spd)){
      if(Math.abs(hypot(s.x,s.y,m.x,m.y)-r)<CFG.FRONT_BAND){single++;break;}
    }
  }
  return single>=1 && cx.length===0;
}

// scoring for a confirmed clear
function scoreHit(hit, chain, overcharge, crit){
  let g=(90+hit.contributors*40);
  if(hit.pure) g*=1.6;
  g*=chain;
  if(overcharge) g*=CFG.OVERCHARGE_MULT;
  if(crit) g*=CFG.CRIT_MULT;
  return Math.round(g);
}

// score threshold to reach a given level (kept from v4 so progression pace is familiar)
function levelThreshold(level){ return level*900 + level*level*120; }

function tonesAtLevel(level){ return Math.min(TONES.length, 1+Math.floor((level-1)/3)); }

// mark lifetime shrinks with level but never below floor
function markLife(level){ return Math.max(2.8, 7.0-(level-1)*0.26); }

// base spawn cadence
function spawnEvery(level){ return Math.max(0.8, 2.4-(level-1)*0.12); }

// ---- surge rhythm (the "wave" pulse that makes the session breathe) ----
// The game alternates calm and surge windows. During a surge, marks spawn in bursts.
// Returns {phase:"calm"|"surge", k} where k in [0,1] is progress through the current window.
function surgeState(t){
  const CALM=11, SURGE=5, period=CALM+SURGE;
  const x=t%period;
  if(x<CALM) return {phase:"calm", k:x/CALM};
  return {phase:"surge", k:(x-CALM)/SURGE};
}

// ---- prediction (the teaching + aiming UX) ----
// If a NEW pulsar were dropped at (px,py) now, will its expanding rings cross an existing
// pulsar's rings on top of a live mark soon? Returns {mark,when,quality,dt} or null.
function predictDrop(px,py,t,sources,marks,level){
  const spd=speedForLevel(level);
  const fresh={x:px,y:py,born:t,tone:0};
  let best=null;
  const horizon=CFG.PULSE_PERIOD*1.6; // look ~one-and-a-bit beats ahead
  const dtStep=0.035;
  for(const m of marks){
    if(m.hit) continue;
    const catchR=m.r+CFG.FRONT_BAND;
    for(let dtT=0.02; dtT<horizon; dtT+=dtStep){
      const tt=t+dtT;
      if(tt>t+(m.life||horizon)) break;
      // does any fresh-pulsar front pass within catchR of the mark at tt?
      const freshR=frontRadii(fresh,tt,spd);
      let freshOn=false;
      for(const r of freshR){ if(Math.abs(hypot(px,py,m.x,m.y)-r)<=catchR){freshOn=true;break;} }
      if(!freshOn) continue;
      // is there an existing source whose front also passes the mark at tt?
      for(const s of sources){
        if(sourceDecay(s,tt)<=0.10) continue;
        let on=false;
        for(const r of frontRadii(s,tt,spd)){ if(Math.abs(hypot(s.x,s.y,m.x,m.y)-r)<=catchR){on=true;break;} }
        if(on){
          const quality=Math.max(0,1-dtT/horizon);
          if(!best||quality>best.quality) best={mark:m,when:tt,quality,dt:dtT};
          break;
        }
      }
      if(best&&best.mark===m) break;
    }
  }
  return best;
}

const API={TONES,CFG,hypot,speedForLevel,fieldAt,evalMark,fillMark,isNearMiss,scoreHit,
  levelThreshold,tonesAtLevel,markLife,spawnEvery,surgeState,
  frontRadius,frontRadii,sourceDecay,sourceAlive,circleIntersections,liveCrossings,predictDrop};

if(typeof module!=="undefined"&&module.exports) module.exports=API;
root.PHASE_CORE=API;
return API;
})(typeof globalThis!=="undefined"?globalThis:this);
