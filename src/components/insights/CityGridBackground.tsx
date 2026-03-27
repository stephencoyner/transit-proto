'use client';

import React, { useEffect, useRef } from 'react';

// ── Road network (SVG viewBox 0 0 900 1400) ──────────────────────────────────
const VERT_X  = [105, 230, 310, 460, 570, 680, 810];
const HORIZ_Y = [120, 260, 370, 430, 580, 700, 820, 980, 1100, 1260];

const nid = (x: number, y: number) => `${x},${y}`;

const GRAPH: Record<string, Array<{ x: number; y: number }>> = {};
const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
  (GRAPH[nid(x1, y1)] ??= []).push({ x: x2, y: y2 });
  (GRAPH[nid(x2, y2)] ??= []).push({ x: x1, y: y1 });
};
for (const x of VERT_X) {
  const ys = [0, ...HORIZ_Y, 1400];
  for (let i = 0; i < ys.length - 1; i++) addEdge(x, ys[i], x, ys[i + 1]);
}
for (const y of HORIZ_Y) {
  const xs = [0, ...VERT_X, 900];
  for (let i = 0; i < xs.length - 1; i++) addEdge(xs[i], y, xs[i + 1], y);
}

// Entry points at the visible panel boundary (panel ≈ SVG x:230-680, y:370-1100)
// Each entry has a forced first-step direction so vehicles move INTO the panel
interface EntryPoint { x: number; y: number; nx: number; ny: number; }
const VISIBLE_Y = [370, 430, 580, 700, 820, 980, 1100];
const VISIBLE_X = [230, 310, 460, 570, 680];
const ENTRY_POINTS: EntryPoint[] = [
  ...VISIBLE_Y.map(y => ({ x: 230, y, nx: 310, ny: y   })), // left edge → right
  ...VISIBLE_Y.map(y => ({ x: 680, y, nx: 570, ny: y   })), // right edge → left
  ...VISIBLE_X.map(x => ({ x, y: 370,  nx: x, ny: 430  })), // top edge → down
  ...VISIBLE_X.map(x => ({ x, y: 1100, nx: x, ny: 980  })), // bottom edge → up
];

const isTerminal = (x: number, y: number) =>
  x === 0 || x === 900 || y === 0 || y === 1400;

// ── Map color scale (#E67E22 → #5C1276) ──────────────────────────────────────
const COLORS = ['#E67E22', '#E95C46', '#DC2C7E', '#C71F8F', '#A010B4', '#7F1AA3', '#5C1276'];

const PIXEL_SPEED   = 55;    // px / second — constant in screen space (no corner acceleration)
const MAX_VEHICLES  = 4;
const TRAIL_LEN     = 100;   // longer trail
const MIN_AGE       = 10000; // ms
const MAX_AGE       = 12000; // ms
const FADE_START    = 0.78;  // start fading at 78% of lifetime
const INITIAL_DELAY = 5000;  // ms before first vehicle spawns

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
  born: number;
  maxAge: number;
  done: boolean;
}

let _vid = 0;

// segPxLen is computed lazily in the animate loop once we have canvas dimensions
function makeVehicle(now: number): Vehicle | null {
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
    born: now,
    maxAge: MIN_AGE + Math.random() * (MAX_AGE - MIN_AGE),
    done: false,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CityGridBackground() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const vehiclesRef  = useRef<Vehicle[]>([]);
  const rafRef       = useRef<number>(0);
  const lastTimeRef  = useRef<number>(0);

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

    // First vehicles appear after INITIAL_DELAY, then stagger
    const spawnOne = (delay: number) =>
      setTimeout(() => {
        const v = makeVehicle(performance.now());
        if (v) vehiclesRef.current.push(v);
      }, delay);
    spawnOne(INITIAL_DELAY);
    spawnOne(INITIAL_DELAY + 1200);

    const spawnTimer = setInterval(() => {
      const active = vehiclesRef.current.filter(v => !v.done).length;
      if (active < MAX_VEHICLES) {
        const v = makeVehicle(performance.now());
        if (v) vehiclesRef.current.push(v);
      }
    }, 1000 + Math.random() * 3000);

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

      for (const v of vehiclesRef.current) {
        const age     = now - v.born;
        const ageRatio = age / v.maxAge;

        // Fade multiplier (1 until FADE_START, then linearly → 0)
        const fade = ageRatio < FADE_START
          ? 1
          : Math.max(0, 1 - (ageRatio - FADE_START) / (1 - FADE_START));

        if (ageRatio >= 1) { v.done = true; continue; }

        // Compute pixel segment length (lazy init + after each turn)
        const pxLen = (fx: number, fy: number, tx: number, ty: number) =>
          Math.hypot((tx - fx) * sx, (ty - fy) * sy);

        if (v.segPxLen < 0) v.segPxLen = pxLen(v.fromX, v.fromY, v.toX, v.toY);

        // Advance at constant PIXEL speed — no acceleration on corners
        let remainingPx = (PIXEL_SPEED / 1000) * dt;

        while (remainingPx > 0) {
          const gap = v.segPxLen - v.distPx;

          if (remainingPx < gap) {
            v.distPx += remainingPx;
            remainingPx = 0;
          } else {
            remainingPx -= gap;
            v.x = v.toX; v.y = v.toY;

            if (isTerminal(v.toX, v.toY)) { v.done = true; break; }

            const neighbors = (GRAPH[nid(v.toX, v.toY)] ?? [])
              .filter(n => nid(n.x, n.y) !== nid(v.fromX, v.fromY) && !isTerminal(n.x, n.y));

            if (!neighbors.length) { v.done = true; break; }

            const next    = neighbors[Math.floor(Math.random() * neighbors.length)];
            v.fromX       = v.toX;
            v.fromY       = v.toY;
            v.toX         = next.x;
            v.toY         = next.y;
            v.segPxLen    = pxLen(v.fromX, v.fromY, v.toX, v.toY);
            v.distPx      = 0;
          }
        }
        if (v.done) continue;

        // Position along current segment
        const t = v.segPxLen > 0 ? v.distPx / v.segPxLen : 0;
        v.x = v.fromX + (v.toX - v.fromX) * t;
        v.y = v.fromY + (v.toY - v.fromY) * t;

        v.trail.push({ x: v.x, y: v.y });
        if (v.trail.length > TRAIL_LEN) v.trail.shift();

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

        // Draw vehicle dot — perfect 4px circle in pixel space
        ctx.beginPath();
        ctx.arc(v.x * sx, v.y * sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(v.color, 0.9 * fade);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(spawnTimer);
      ro.disconnect();
    };
  }, []);

  const sharedStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '-40%',
    width: '180%',
    height: '180%',
    transform: 'rotate(-14deg)',
    pointerEvents: 'none',
    zIndex: 0,
  };

  return (
    <>
      {/* Static grid */}
      <svg style={{ ...sharedStyle, opacity: 0.95 }} viewBox="0 0 900 1400" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="var(--bg-secondary)" strokeWidth="1.5" opacity="0.9">
          <line x1="0"   y1="0" x2="0"   y2="1400" /><line x1="105" y1="0" x2="105" y2="1400" />
          <line x1="230" y1="0" x2="230" y2="1400" /><line x1="310" y1="0" x2="310" y2="1400" />
          <line x1="460" y1="0" x2="460" y2="1400" /><line x1="570" y1="0" x2="570" y2="1400" />
          <line x1="680" y1="0" x2="680" y2="1400" /><line x1="810" y1="0" x2="810" y2="1400" />
          <line x1="900" y1="0" x2="900" y2="1400" />
          <line x1="0" y1="0"    x2="900" y2="0"    /><line x1="0" y1="120"  x2="900" y2="120"  />
          <line x1="0" y1="260"  x2="900" y2="260"  /><line x1="0" y1="370"  x2="900" y2="370"  />
          <line x1="0" y1="430"  x2="900" y2="430"  /><line x1="0" y1="580"  x2="900" y2="580"  />
          <line x1="0" y1="700"  x2="900" y2="700"  /><line x1="0" y1="820"  x2="900" y2="820"  />
          <line x1="0" y1="980"  x2="900" y2="980"  /><line x1="0" y1="1100" x2="900" y2="1100" />
          <line x1="0" y1="1260" x2="900" y2="1260" /><line x1="0" y1="1400" x2="900" y2="1400" />
        </g>
        <g stroke="var(--bg-secondary)" strokeWidth="0.5" opacity="0.6">
          <line x1="35"  y1="0" x2="35"  y2="1400" /><line x1="72"  y1="0" x2="72"  y2="1400" />
          <line x1="148" y1="0" x2="148" y2="1400" /><line x1="188" y1="0" x2="188" y2="1400" />
          <line x1="268" y1="0" x2="268" y2="1400" /><line x1="290" y1="0" x2="290" y2="1400" />
          <line x1="358" y1="0" x2="358" y2="1400" /><line x1="400" y1="0" x2="400" y2="1400" />
          <line x1="432" y1="0" x2="432" y2="1400" /><line x1="510" y1="0" x2="510" y2="1400" />
          <line x1="545" y1="0" x2="545" y2="1400" /><line x1="618" y1="0" x2="618" y2="1400" />
          <line x1="650" y1="0" x2="650" y2="1400" /><line x1="730" y1="0" x2="730" y2="1400" />
          <line x1="775" y1="0" x2="775" y2="1400" /><line x1="855" y1="0" x2="855" y2="1400" />
          <line x1="882" y1="0" x2="882" y2="1400" />
          <line x1="0" y1="45"   x2="900" y2="45"   /><line x1="0" y1="88"   x2="900" y2="88"   />
          <line x1="0" y1="165"  x2="900" y2="165"  /><line x1="0" y1="210"  x2="900" y2="210"  />
          <line x1="0" y1="242"  x2="900" y2="242"  /><line x1="0" y1="305"  x2="900" y2="305"  />
          <line x1="0" y1="338"  x2="900" y2="338"  /><line x1="0" y1="398"  x2="900" y2="398"  />
          <line x1="0" y1="415"  x2="900" y2="415"  /><line x1="0" y1="500"  x2="900" y2="500"  />
          <line x1="0" y1="535"  x2="900" y2="535"  /><line x1="0" y1="558"  x2="900" y2="558"  />
          <line x1="0" y1="638"  x2="900" y2="638"  /><line x1="0" y1="672"  x2="900" y2="672"  />
          <line x1="0" y1="758"  x2="900" y2="758"  /><line x1="0" y1="795"  x2="900" y2="795"  />
          <line x1="0" y1="870"  x2="900" y2="870"  /><line x1="0" y1="910"  x2="900" y2="910"  />
          <line x1="0" y1="948"  x2="900" y2="948"  /><line x1="0" y1="1030" x2="900" y2="1030" />
          <line x1="0" y1="1065" x2="900" y2="1065" /><line x1="0" y1="1140" x2="900" y2="1140" />
          <line x1="0" y1="1185" x2="900" y2="1185" /><line x1="0" y1="1220" x2="900" y2="1220" />
          <line x1="0" y1="1310" x2="900" y2="1310" /><line x1="0" y1="1355" x2="900" y2="1355" />
        </g>
        <g stroke="var(--bg-secondary)" strokeWidth="1.2" opacity="0.7">
          <line x1="0"   y1="300"  x2="900" y2="900"  />
          <line x1="150" y1="0"    x2="900" y2="1050" />
          <line x1="0"   y1="800"  x2="600" y2="1400" />
          <line x1="500" y1="0"    x2="900" y2="560"  />
        </g>
      </svg>

      {/* Vehicle canvas — pixel-space circles, no SVG distortion */}
      <canvas ref={canvasRef} style={sharedStyle} />
    </>
  );
}
