'use client';

import React, { useEffect, useRef } from 'react';

// ── Road network (SVG viewBox 0 0 900 1400) ──────────────────────────────────
// Vehicles travel on main arterials — kept in sync with the wider stroke lines below.
const VERT_X  = [75, 275, 475, 675, 875];
const HORIZ_Y = [90, 330, 570, 810, 1050, 1290];

const nid = (x: number, y: number) => `${x},${y}`;

const GRAPH: Record<string, Array<{ x: number; y: number }>> = {};
const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
  (GRAPH[nid(x1, y1)] ??= []).push({ x: x2, y: y2 });
  (GRAPH[nid(x2, y2)] ??= []).push({ x: x1, y: y1 });
};
const removeEdge = (x1: number, y1: number, x2: number, y2: number) => {
  const a = GRAPH[nid(x1, y1)];
  const b = GRAPH[nid(x2, y2)];
  if (a) GRAPH[nid(x1, y1)] = a.filter(n => !(n.x === x2 && n.y === y2));
  if (b) GRAPH[nid(x2, y2)] = b.filter(n => !(n.x === x1 && n.y === y1));
};
for (const x of VERT_X) {
  const ys = [0, ...HORIZ_Y, 1400];
  for (let i = 0; i < ys.length - 1; i++) addEdge(x, ys[i], x, ys[i + 1]);
}
for (const y of HORIZ_Y) {
  const xs = [0, ...VERT_X, 900];
  for (let i = 0; i < xs.length - 1; i++) addEdge(xs[i], y, xs[i + 1], y);
}

// ── Madison St — diagonal SW→NE arterial (slope -1 for clean integer crossings) ─
// Line: from (0, 1100) to (900, 200). Crosses each main avenue cleanly.
const MADISON_NODES: Array<{ x: number; y: number }> = [
  { x: 0,   y: 1100 },
  { x: 75,  y: 1025 },
  { x: 275, y: 825  },
  { x: 475, y: 625  },
  { x: 675, y: 425  },
  { x: 875, y: 225  },
  { x: 900, y: 200  },
];
const MADISON_EDGES = new Set<string>();
const edgeKey = (ax: number, ay: number, bx: number, by: number) =>
  `${nid(ax, ay)}|${nid(bx, by)}`;

// Split each avenue segment at the Madison crossing, then stitch Madison together.
for (let i = 1; i < MADISON_NODES.length - 1; i++) {
  const { x, y } = MADISON_NODES[i];
  const ys = [0, ...HORIZ_Y, 1400];
  for (let j = 0; j < ys.length - 1; j++) {
    if (ys[j] < y && y < ys[j + 1]) {
      removeEdge(x, ys[j], x, ys[j + 1]);
      addEdge(x, ys[j], x, y);
      addEdge(x, y, x, ys[j + 1]);
      break;
    }
  }
}
for (let i = 0; i < MADISON_NODES.length - 1; i++) {
  const a = MADISON_NODES[i];
  const b = MADISON_NODES[i + 1];
  addEdge(a.x, a.y, b.x, b.y);
  MADISON_EDGES.add(edgeKey(a.x, a.y, b.x, b.y));
  MADISON_EDGES.add(edgeKey(b.x, b.y, a.x, a.y));
}

// Entry points sit OUTSIDE the visible viewBox on the view edges (x=0/900, y=0/1400).
// First step targets the nearest main arterial intersection, so vehicles ride onto
// screen along a visible road instead of popping in.
interface EntryPoint { x: number; y: number; nx: number; ny: number; }
const ENTRY_POINTS: EntryPoint[] = [
  { x: 0,   y: 330,  nx: 75,  ny: 330  }, // west edge (upper) → enter east
  { x: 900, y: 810,  nx: 875, ny: 810  }, // east edge (lower) → enter west
  { x: 675, y: 0,    nx: 675, ny: 90   }, // north edge (right-of-center) → enter south
  { x: 275, y: 1400, nx: 275, ny: 1290 }, // south edge (left-of-center) → enter north
];

const isTerminal = (x: number, y: number) =>
  x === 0 || x === 900 || y === 0 || y === 1400;

// ── Map color scale (#E67E22 → #5C1276) ──────────────────────────────────────
const COLORS = ['#E67E22', '#E95C46', '#DC2C7E', '#C71F8F', '#A010B4', '#7F1AA3', '#5C1276'];

const PIXEL_SPEED    = 55;    // px / second — constant in screen space (no corner acceleration)
const MAX_VEHICLES   = 5;
const TRAIL_LEN      = 100;   // longer trail
const TRAIL_FADE_MS  = 1000;  // trail tail-out duration after vehicle exits the view
const INITIAL_DELAY  = 5000;  // ms before first vehicle spawns
const SPAWN_GAP_MIN  = 600;   // ms minimum gap between spawns (when under cap)
const SPAWN_GAP_MAX  = 2200;  // ms maximum gap between spawns

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

interface Vehicle {
  id: number;
  x: number; y: number;
  fromX: number; fromY: number;
  toX: number;   toY: number;
  distPx: number;     // distance traveled along segment in PIXELS
  segPxLen: number;   // total segment length in PIXELS
  color: string;
  trail: Array<{ x: number; y: number }>;
  exitedAt: number | null; // timestamp when head reached an outer edge; null while traveling
  done: boolean;
}

let _vid = 0;

// segPxLen is computed lazily in the animate loop once we have canvas dimensions
function makeVehicle(): Vehicle {
  const entry = ENTRY_POINTS[Math.floor(Math.random() * ENTRY_POINTS.length)];
  return {
    id: _vid++,
    x: entry.x, y: entry.y,
    fromX: entry.x, fromY: entry.y,
    toX: entry.nx, toY: entry.ny,
    distPx: 0,
    segPxLen: -1, // sentinel: will be computed on first frame
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    trail: [{ x: entry.x, y: entry.y }],
    exitedAt: null,
    done: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CityGridBackground() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const vehiclesRef   = useRef<Vehicle[]>([]);
  const rafRef        = useRef<number>(0);
  const lastTimeRef   = useRef<number>(0);
  const nextSpawnRef  = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  || canvas.clientWidth;
      canvas.height = canvas.offsetHeight || canvas.clientHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    nextSpawnRef.current = performance.now() + INITIAL_DELAY;

    const animate = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const dt = Math.min(now - lastTimeRef.current, 50);
      lastTimeRef.current = now;

      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(animate); return; }

      const W  = canvas.width;
      const H  = canvas.height;
      const sx = W / 900;
      const sy = H / 1400;

      ctx.clearRect(0, 0, W, H);

      vehiclesRef.current = vehiclesRef.current.filter(v => !v.done);

      // Is a segment already occupied by another active vehicle (either direction)?
      const segmentOccupied = (excludeId: number, ax: number, ay: number, bx: number, by: number) => {
        for (const o of vehiclesRef.current) {
          if (o.id === excludeId || o.exitedAt !== null) continue;
          if ((o.fromX === ax && o.fromY === ay && o.toX === bx && o.toY === by) ||
              (o.fromX === bx && o.fromY === by && o.toX === ax && o.toY === ay)) {
            return true;
          }
        }
        return false;
      };

      // Demand-driven spawn: only when under the cap, paced by a randomized gap.
      // Skip if the chosen entry's first segment is already in use (avoids head-on spawns).
      if (vehiclesRef.current.length < MAX_VEHICLES && now >= nextSpawnRef.current) {
        const candidate = makeVehicle();
        if (!segmentOccupied(candidate.id, candidate.fromX, candidate.fromY, candidate.toX, candidate.toY)) {
          vehiclesRef.current.push(candidate);
          nextSpawnRef.current = now + SPAWN_GAP_MIN + Math.random() * (SPAWN_GAP_MAX - SPAWN_GAP_MIN);
        } else {
          // Try again soon without a full gap
          nextSpawnRef.current = now + 200;
        }
      }

      for (const v of vehiclesRef.current) {
        // Compute pixel segment length (lazy init + after each turn)
        const pxLen = (fx: number, fy: number, tx: number, ty: number) =>
          Math.hypot((tx - fx) * sx, (ty - fy) * sy);

        if (v.segPxLen < 0) v.segPxLen = pxLen(v.fromX, v.fromY, v.toX, v.toY);

        // Only advance the head while the vehicle is still in view
        if (v.exitedAt === null) {
          let remainingPx = (PIXEL_SPEED / 1000) * dt;

          while (remainingPx > 0) {
            const gap = v.segPxLen - v.distPx;

            if (remainingPx < gap) {
              v.distPx += remainingPx;
              remainingPx = 0;
            } else {
              remainingPx -= gap;
              v.x = v.toX; v.y = v.toY;

              if (isTerminal(v.toX, v.toY)) {
                // Head reached the view edge — stop advancing, start trail tail-out
                v.exitedAt = now;
                v.trail.push({ x: v.x, y: v.y });
                break;
              }

              const neighbors = (GRAPH[nid(v.toX, v.toY)] ?? [])
                .filter(n => nid(n.x, n.y) !== nid(v.fromX, v.fromY) && !isTerminal(n.x, n.y));

              if (!neighbors.length) {
                // Dead end — treat like exit
                v.exitedAt = now;
                break;
              }

              // Weighted pick: Madison turns 3× more likely than grid turns;
              // segments already in use by another vehicle get near-zero weight
              // to avoid collisions (still picked if it's the only option).
              const weights = neighbors.map(n => {
                const base = MADISON_EDGES.has(edgeKey(v.toX, v.toY, n.x, n.y)) ? 3 : 1;
                return segmentOccupied(v.id, v.toX, v.toY, n.x, n.y) ? 0.05 : base;
              });
              const totalW = weights.reduce((a, b) => a + b, 0);
              let r = Math.random() * totalW;
              let chosenIdx = 0;
              for (let i = 0; i < weights.length; i++) {
                r -= weights[i];
                if (r <= 0) { chosenIdx = i; break; }
              }
              const next    = neighbors[chosenIdx];
              v.fromX       = v.toX;
              v.fromY       = v.toY;
              v.toX         = next.x;
              v.toY         = next.y;
              v.segPxLen    = pxLen(v.fromX, v.fromY, v.toX, v.toY);
              v.distPx      = 0;
            }
          }

          if (v.exitedAt === null) {
            // Position along current segment
            const t = v.segPxLen > 0 ? v.distPx / v.segPxLen : 0;
            v.x = v.fromX + (v.toX - v.fromX) * t;
            v.y = v.fromY + (v.toY - v.fromY) * t;

            v.trail.push({ x: v.x, y: v.y });
            if (v.trail.length > TRAIL_LEN) v.trail.shift();
          }
        }

        // Compute fade: full opacity while in view, linearly to 0 over TRAIL_FADE_MS after exit
        let fade = 1;
        if (v.exitedAt !== null) {
          fade = 1 - (now - v.exitedAt) / TRAIL_FADE_MS;
          if (fade <= 0) { v.done = true; continue; }
        }

        if (v.trail.length < 2) continue;

        // Draw trail as a single path with a linear gradient from transparent → solid at the head
        const tail = v.trail[0];
        const head = v.trail[v.trail.length - 1];
        const x0 = tail.x * sx, y0 = tail.y * sy;
        const x1 = head.x * sx, y1 = head.y * sy;

        // Gradient runs from tail (transparent) to head (full color)
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0,    hexToRgba(v.color, 0));
        grad.addColorStop(0.55, hexToRgba(v.color, 0));
        grad.addColorStop(1,    hexToRgba(v.color, 0.75 * fade));

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let i = 1; i < v.trail.length; i++) {
          ctx.lineTo(v.trail[i].x * sx, v.trail[i].y * sy);
        }
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // Head dot — only while still in view
        if (v.exitedAt === null) {
          ctx.beginPath();
          ctx.arc(v.x * sx, v.y * sy, 4, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(v.color, 0.9);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: 0,
  };

  return (
    <>
      {/* Static grid */}
      <svg style={{ ...sharedStyle, opacity: 0.95 }} viewBox="0 0 900 1400" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cityGridStroke" x1="0" y1="0" x2="0" y2="1400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E5E0CF" />
            <stop offset="100%" stopColor="#D1C9B2" />
          </linearGradient>
          <style>{`line { vector-effect: non-scaling-stroke; }`}</style>
        </defs>
        {/* Capitol Hill–inspired grid */}
        {/* Minor streets (thinner) */}
        <g stroke="url(#cityGridStroke)" strokeWidth="0.8" opacity="0.2" vectorEffect="non-scaling-stroke">
          <line x1="25"  y1="0" x2="25"  y2="1400" />
          <line x1="125" y1="0" x2="125" y2="1400" />
          <line x1="175" y1="0" x2="175" y2="1400" />
          <line x1="225" y1="0" x2="225" y2="1400" />
          <line x1="325" y1="0" x2="325" y2="1400" />
          <line x1="375" y1="0" x2="375" y2="1400" />
          <line x1="425" y1="0" x2="425" y2="1400" />
          <line x1="525" y1="0" x2="525" y2="1400" />
          <line x1="575" y1="0" x2="575" y2="1400" />
          <line x1="625" y1="0" x2="625" y2="1400" />
          <line x1="725" y1="0" x2="725" y2="1400" />
          <line x1="775" y1="0" x2="775" y2="1400" />
          <line x1="825" y1="0" x2="825" y2="1400" />
          <line x1="0" y1="30"   x2="900" y2="30"   />
          <line x1="0" y1="150"  x2="900" y2="150"  />
          <line x1="0" y1="210"  x2="900" y2="210"  />
          <line x1="0" y1="270"  x2="900" y2="270"  />
          <line x1="0" y1="390"  x2="900" y2="390"  />
          <line x1="0" y1="450"  x2="900" y2="450"  />
          <line x1="0" y1="510"  x2="900" y2="510"  />
          <line x1="0" y1="630"  x2="900" y2="630"  />
          <line x1="0" y1="690"  x2="900" y2="690"  />
          <line x1="0" y1="750"  x2="900" y2="750"  />
          <line x1="0" y1="870"  x2="900" y2="870"  />
          <line x1="0" y1="930"  x2="900" y2="930"  />
          <line x1="0" y1="990"  x2="900" y2="990"  />
          <line x1="0" y1="1110" x2="900" y2="1110" />
          <line x1="0" y1="1170" x2="900" y2="1170" />
          <line x1="0" y1="1230" x2="900" y2="1230" />
          <line x1="0" y1="1350" x2="900" y2="1350" />
        </g>
        {/* Main arterials (wider) — Broadway, 12th, 15th, 19th, 23rd + major E-W (Pike, Union, Madison, Cherry, Yesler) + Madison diagonal */}
        <g stroke="url(#cityGridStroke)" strokeWidth="1.6" opacity="0.2" vectorEffect="non-scaling-stroke">
          <line x1="75"  y1="0" x2="75"  y2="1400" />
          <line x1="275" y1="0" x2="275" y2="1400" />
          <line x1="475" y1="0" x2="475" y2="1400" />
          <line x1="675" y1="0" x2="675" y2="1400" />
          <line x1="875" y1="0" x2="875" y2="1400" />
          <line x1="0" y1="90"   x2="900" y2="90"   />
          <line x1="0" y1="330"  x2="900" y2="330"  />
          <line x1="0" y1="570"  x2="900" y2="570"  />
          <line x1="0" y1="810"  x2="900" y2="810"  />
          <line x1="0" y1="1050" x2="900" y2="1050" />
          <line x1="0" y1="1290" x2="900" y2="1290" />
          {/* Madison St — diagonal cutting SW → NE */}
          <line x1="0" y1="1100" x2="900" y2="200" />
        </g>
      </svg>

      {/* Vehicle canvas — pixel-space circles, no SVG distortion */}
      <canvas ref={canvasRef} style={sharedStyle} />
    </>
  );
}
