"use client";

/**
 * Cocktail Pour. Adapted for "Au Bar de ce Soir" from the Coffee Pour Menu
 * designed & built by Aakash Mehra (see ./coffee-pour-menu.tsx).
 *
 * Same idea and same hand-rolled physics (gravity, springs, damped waves):
 * picking a drink knocks the current glass off the stage, springs the next
 * glass in and pours its recipe. Differences: bar glassware (coupe, martini,
 * rocks, highball, copper mug), any number of coloured liquids that blend by
 * colour and opacity, ice, garnishes and an egg-white foam cap.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type CocktailVessel = "coupe" | "martini" | "rocks" | "highball" | "copper-mug";
export type CocktailGarnish = "none" | "lemon" | "twist" | "orange" | "mint" | "basil" | "cherry";

export interface PourLayer {
  /** Liquid colour, "#rrggbb". */
  color: string;
  /** Opacity of the liquid, 0 (clear spirit) to 1 (Campari, coffee liqueur). */
  alpha: number;
  /** How much, as a fraction (0 to 1) of the vessel's inner height. */
  amount: number;
}

export interface CocktailPourItem {
  id: string;
  name: string;
  /** Small line under the name in the menu. */
  subtitle?: string;
  /** Spoken by screen readers when the drink is shown. */
  description?: string;
  vessel: CocktailVessel;
  /** Pours, in order. */
  layers: PourLayer[];
  /** How completely the pours blend, 0 (stay layered) to 1 (fully mixed). Default 1. */
  blend?: number;
  /** Ice cubes in the glass before the pour. */
  ice?: boolean;
  /** Egg-white style foam cap, as a fraction of the inner height. */
  foam?: number;
  garnish?: CocktailGarnish;
}

/* -------------------------------------------------------------------------- */
/*                                  Geometry                                  */
/* -------------------------------------------------------------------------- */

const W = 360;
const H = 400;
const FLOOR = 336;
const CX = 180;
const SRC = -FLOOR - 10;
const P = 0.34;
const N = 14;
const MAXL = 8; // liquids per glass

type Profile = { top: number; r: number; bot: number; rb: number; c: number };
type Geo = {
  outer: Profile;
  inner: Profile;
  glass: boolean;
  stem?: { top: number; w: number; foot: number };
  handle?: string;
  handleW?: number;
  height: number;
  shadowR: number;
  streamX: number;
  streamW: number;
  ice?: [number, number, number, number][]; // x, y, size, rotation (deg)
};

const GEO: Record<CocktailVessel, Geo> = {
  coupe: {
    outer: { top: -206, r: 84, bot: -134, rb: 9, c: 88 },
    inner: { top: -206, r: 80, bot: -138, rb: 5, c: 81 },
    glass: true,
    stem: { top: -134, w: 5, foot: 54 },
    height: 206,
    shadowR: 56,
    streamX: 0.1,
    streamW: 3.6,
  },
  martini: {
    outer: { top: -222, r: 90, bot: -126, rb: 6, c: 48 },
    inner: { top: -222, r: 86, bot: -132, rb: 2, c: 44 },
    glass: true,
    stem: { top: -126, w: 5, foot: 56 },
    height: 222,
    shadowR: 58,
    streamX: 0.1,
    streamW: 3.6,
  },
  rocks: {
    outer: { top: -126, r: 64, bot: 0, rb: 60, c: 62 },
    inner: { top: -126, r: 59.5, bot: -22, rb: 55, c: 57.5 },
    glass: true,
    height: 128,
    shadowR: 66,
    streamX: 0.16,
    streamW: 4,
    ice: [[-22, -52, 34, -8], [20, -60, 32, 12], [-2, -86, 30, 4]],
  },
  highball: {
    outer: { top: -236, r: 47, bot: 0, rb: 44, c: 45.5 },
    inner: { top: -236, r: 43.5, bot: -20, rb: 40.5, c: 42 },
    glass: true,
    height: 238,
    shadowR: 50,
    streamX: 0.14,
    streamW: 4,
    ice: [[-12, -48, 30, -6], [12, -84, 29, 10], [-10, -120, 28, 3], [10, -156, 27, -12]],
  },
  "copper-mug": {
    outer: { top: -150, r: 60, bot: 0, rb: 56, c: 67 },
    // opaque mug: only the liquid near the rim shows
    inner: { top: -150, r: 55, bot: -112, rb: 53, c: 58 },
    glass: false,
    handle: "M62 -126C102 -128 106 -100 106 -78C106 -50 98 -34 60 -34",
    handleW: 10,
    height: 152,
    shadowR: 64,
    streamX: 0.15,
    streamW: 4,
    ice: [[-16, -128, 26, -10], [18, -132, 24, 14]],
  },
};

const f1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mid = (p: Profile) => (p.top + p.bot) / 2;
const wallR = (p: Profile, t: number) =>
  (1 - t) * (1 - t) * p.r + 2 * t * (1 - t) * p.c + t * t * p.rb;

function silhouette(p: Profile) {
  const m = mid(p);
  return `M${-p.r} ${p.top}A${p.r} ${f1(p.r * P)} 0 0 1 ${p.r} ${p.top}Q${p.c} ${m} ${p.rb} ${p.bot}A${p.rb} ${f1(p.rb * P)} 0 0 1 ${-p.rb} ${p.bot}Q${-p.c} ${m} ${-p.r} ${p.top}Z`;
}
function bodyPath(p: Profile) {
  const m = mid(p);
  return `M${-p.r} ${p.top}Q${-p.c} ${m} ${-p.rb} ${p.bot}A${p.rb} ${f1(p.rb * P)} 0 0 0 ${p.rb} ${p.bot}Q${p.c} ${m} ${p.r} ${p.top}A${p.r} ${f1(p.r * P)} 0 0 1 ${-p.r} ${p.top}Z`;
}
function frontBand(r1: number, y1: number, r2: number, y2: number) {
  return `M${-r1} ${y1}A${r1} ${f1(r1 * P)} 0 0 0 ${r1} ${y1}L${r2} ${y2}A${r2} ${f1(r2 * P)} 0 0 1 ${-r2} ${y2}Z`;
}
function wallLine(p: Profile, k: number, t0: number, t1: number) {
  const y0 = lerp(p.top, p.bot, t0);
  const y1 = lerp(p.top, p.bot, t1);
  const ym = (y0 + y1) / 2;
  return `M${f1(k * wallR(p, t0))} ${f1(y0)}Q${f1(k * wallR(p, (t0 + t1) / 2) * 1.02)} ${f1(ym)} ${f1(k * wallR(p, t1))} ${f1(y1)}`;
}

/* -------------------------------------------------------------------------- */
/*                                   Colour                                   */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number];
function hex(c: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [238, 236, 228];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const CLEAR: RGB = [236, 236, 230];

type Liquid = { rgb: RGB; a: number; css: string };

/** Colour and opacity of one cell: an opacity-weighted mix of its liquids. */
function shade(cells: Float32Array, o: number, L: Liquid[]): [RGB, number] {
  let s = 0;
  let wa = 0;
  const rgb: RGB = [0, 0, 0];
  for (let j = 0; j < L.length; j++) {
    const f = cells[o + j];
    if (f <= 0) continue;
    s += f;
    const w = f * (0.06 + L[j].a);
    wa += w;
    rgb[0] += L[j].rgb[0] * w;
    rgb[1] += L[j].rgb[1] * w;
    rgb[2] += L[j].rgb[2] * w;
  }
  if (s <= 0 || wa <= 0) return [CLEAR, 0.15];
  let a = 0;
  for (let j = 0; j < L.length; j++) a += (cells[o + j] / s) * L[j].a;
  return [[rgb[0] / wa, rgb[1] / wa, rgb[2] / wa], clamp(0.14 + a * 0.86, 0.14, 1)];
}

/* -------------------------------------------------------------------------- */
/*                                  Physics                                   */
/* -------------------------------------------------------------------------- */

const G_STREAM = 3000;
const G_FALL = 2600;
const V0 = 220;
const PARTS = 26;
const RIPPLES = 6;
const TENDRILS = 3;
const SPILLS = 32;
const PEN = 0.2;
const JET = 0.7;

type Pour = {
  T: number;
  amount: number;
  rate: number;
  poured: number;
  x: number;
  w: number;
  phase: "fall" | "flow" | "tail" | "drips" | "done";
  timer: number;
  head: number;
  headV: number;
  tail: number;
  tailV: number;
  drips: number;
  rippleT: number;
  slot: number;
};
type Particle = { x: number; y: number; vx: number; vy: number; r: number; col: string; drop: boolean };
type Tendril = { x: number; age: number; dir: number; ph: number; col: string };

type Els = {
  root: SVGGElement;
  shadow: SVGGElement;
  body: SVGGElement;
  liquid: SVGGElement;
  liq: SVGPathElement;
  depth: SVGPathElement | null;
  foam: SVGPathElement;
  surf: SVGPathElement;
  sclip: SVGPathElement;
  decor: SVGGElement;
  foamTop: SVGGElement | null;
  base: SVGPathElement | null;
  stops: SVGStopElement[];
  swirl: SVGPathElement[];
  tendrils: SVGPathElement[];
  ripples: SVGEllipseElement[];
  streams: { path: SVGPathElement; hi: SVGPathElement; stops: SVGStopElement[] }[];
  parts: SVGCircleElement[];
};

type Glass = {
  key: number;
  item: CocktailPourItem;
  geo: Geo;
  L: Liquid[];
  mode: "wait" | "enter" | "rest" | "fall" | "fadeIn" | "fadeOut";
  wait: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  pivot: number;
  opacity: number;
  fallT: number;
  level: number;
  cells: Float32Array;
  pours: Pour[];
  next: number;
  pourT: number;
  parts: Particle[];
  ripples: { x: number; age: number }[];
  tendrils: Tendril[];
  w1: number;
  v1: number;
  w2: number;
  v2: number;
  w3: number;
  mix: number;
  swirlCol: string;
  foam: number;
  spill: number;
  dirty: boolean;
  el?: Els;
};

function liquidsOf(item: CocktailPourItem): Liquid[] {
  return item.layers.slice(0, MAXL).map((l) => {
    const rgb = hex(l.color);
    return { rgb, a: clamp(l.alpha, 0, 1), css: css(rgb) };
  });
}

function makeGlass(key: number, item: CocktailPourItem): Glass {
  const geo = GEO[item.vessel] ?? GEO.rocks;
  return {
    key, item, geo, L: liquidsOf(item),
    mode: "wait", wait: 0, x: W + 160, y: FLOOR, vx: 0, vy: 0, a: 0, va: 0, pivot: 0,
    opacity: 1, fallT: 0, level: 0, cells: new Float32Array(N * MAXL), pours: [], next: 0, pourT: 0,
    parts: [], ripples: [], tendrils: [], w1: 0, v1: 0, w2: 0, v2: 0, w3: 0, mix: 0,
    swirlCol: "rgb(240,236,226)", foam: 0, spill: 0, dirty: true,
  };
}

const layersOf = (it: CocktailPourItem) => it.layers.slice(0, MAXL);
const levelY = (g: Geo, f: number) => lerp(g.inner.bot, g.inner.top, f);
const levelR = (g: Geo, f: number) => wallR(g.inner, 1 - f);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function deposit(c: Glass, T: number, dv: number) {
  const L0 = c.level;
  const L1 = Math.min(0.96, L0 + dv);
  const cells = c.cells;
  for (let i = 0; i < N; i++) {
    if (i / N >= L1) break;
    const o = i * MAXL;
    const a0 = clamp(L0 * N - i, 0, 1);
    const a1 = clamp(L1 * N - i, 0, 1);
    if (a1 > a0) {
      const k = (a1 - a0) / a1;
      for (let j = 0; j < MAXL; j++) cells[o + j] *= 1 - k;
      cells[o + T] += k;
    }
    if (a0 > 0) {
      const d = Math.max(0, L1 - (i + 0.5) / N);
      const k = Math.min(0.4, JET * dv * N * 0.5 * Math.exp(-d / PEN));
      for (let j = 0; j < MAXL; j++) cells[o + j] *= 1 - k;
      cells[o + T] += k;
    }
  }
  c.level = L1;
  c.dirty = true;
}

function stir(c: Glass, k: number) {
  const cells = c.cells;
  let tot = 0;
  const m = new Array(MAXL).fill(0);
  for (let i = 0; i < N; i++) {
    const f = clamp(c.level * N - i, 0, 1);
    if (f <= 0) break;
    tot += f;
    for (let j = 0; j < MAXL; j++) m[j] += cells[i * MAXL + j] * f;
  }
  if (tot <= 0) return;
  for (let i = 0; i < N; i++) {
    if (i / N >= c.level) break;
    for (let j = 0; j < MAXL; j++) cells[i * MAXL + j] += (m[j] / tot - cells[i * MAXL + j]) * k;
  }
  c.dirty = true;
}

function diffuse(c: Glass, k: number) {
  const cells = c.cells;
  const top = Math.min(N - 1, Math.ceil(c.level * N) - 1);
  for (let i = 0; i < top; i++) {
    for (let j = 0; j < MAXL; j++) {
      const f = (cells[(i + 1) * MAXL + j] - cells[i * MAXL + j]) * k;
      cells[i * MAXL + j] += f;
      cells[(i + 1) * MAXL + j] -= f;
    }
  }
}

function share(c: Glass, T: number) {
  let tot = 0;
  let x = 0;
  for (let i = 0; i < N; i++) {
    const f = clamp(c.level * N - i, 0, 1);
    if (f <= 0) break;
    tot += f;
    x += c.cells[i * MAXL + T] * f;
  }
  return tot ? x / tot : 1;
}

const topCell = (c: Glass) => Math.max(0, Math.min(N - 1, Math.ceil(c.level * N) - 1));
const wave = (c: Glass, u: number, t: number) =>
  c.w1 * u + c.w2 * Math.cos(Math.PI * u) + c.w3 * Math.sin(3 * Math.PI * u - t * 9);

function kick(c: Glass, u: number, s: number) {
  c.v1 += s * u * 40;
  c.v2 -= s * 50;
  c.w3 = Math.min(2.2, c.w3 + s * 0.9);
}

function fillInstantly(c: Glass) {
  layersOf(c.item).forEach((l, T) => {
    for (let v = 0; v < l.amount; v += 0.01) deposit(c, T, Math.min(0.01, l.amount - v));
  });
  stir(c, 1 - Math.exp(-(c.item.blend ?? 1) * 5.4));
  for (let i = 0; i < 40; i++) diffuse(c, 0.1);
  c.foam = 1;
  c.next = layersOf(c.item).length;
}

function startPour(c: Glass, T: number) {
  const l = layersOf(c.item)[T];
  const r = c.geo.inner.r;
  const side = T % 2 === 0 ? -1 : 1;
  c.pours.push({
    T,
    amount: l.amount,
    rate: l.amount / clamp(l.amount * 2.6, 0.45, 1.3),
    poured: 0,
    x: side * c.geo.streamX * r,
    w: c.geo.streamW * (l.amount > 0.25 ? 1.5 : 1.15),
    phase: "fall",
    timer: 0, head: SRC, headV: V0, tail: SRC, tailV: V0,
    drips: 1, rippleT: 0,
    slot: c.pours.filter((p) => p.phase !== "done").length > 0 ? (c.pours[c.pours.length - 1].slot + 1) % 2 : 0,
  });
}

function spawnDrop(c: Glass, p: Pour) {
  c.parts.push({ x: p.x + (Math.random() - 0.5), y: SRC + 10, vx: 0, vy: V0 * 0.6, r: p.w * 0.5 + 0.6, col: c.L[p.T].css, drop: true });
}

function splash(c: Glass, x: number, y: number, col: string, n: number, s: number) {
  for (let k = 0; k < n && c.parts.length < PARTS; k++) {
    c.parts.push({
      x: x + (Math.random() - 0.5) * 4, y: y - 1,
      vx: (Math.random() - 0.5) * 150 * s, vy: -(80 + Math.random() * 180) * s,
      r: 0.8 + Math.random() * 1.5, col, drop: false,
    });
  }
  if (c.ripples.length >= RIPPLES) c.ripples.shift();
  c.ripples.push({ x, age: 0 });
}

function stepGlass(c: Glass, dt: number, t: number, spills: Particle[]): boolean {
  const g = c.geo;
  const it = c.item;
  const layers = layersOf(it);
  let busy = false;

  if (c.mode === "wait") {
    c.wait -= dt;
    if (c.wait <= 0) c.mode = "enter";
    return true;
  }
  if (c.mode === "enter" || c.mode === "rest") {
    const ax = -130 * (c.x - CX) - 15.5 * c.vx;
    c.vx += ax * dt;
    c.x += c.vx * dt;
    const target = clamp(-ax * 0.00011, -0.14, 0.14);
    c.va += (-240 * (c.a - target) - 15 * c.va) * dt;
    c.a += c.va * dt;
    if (c.mode === "enter") {
      busy = true;
      if (Math.abs(c.x - CX) < 0.4 && Math.abs(c.vx) < 8 && Math.abs(c.a) < 0.003 && Math.abs(c.va) < 0.04) {
        c.x = CX; c.vx = 0; c.a = 0; c.va = 0; c.mode = "rest";
      }
    }
  } else if (c.mode === "fall") {
    c.fallT += dt;
    c.vy += G_FALL * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.a += c.va * dt;
    busy = true;
    if (c.level > 0.2 && Math.abs(c.a) > 0.3 && spills.length < SPILLS) {
      c.spill += dt * 60 * c.level;
      while (c.spill > 1 && spills.length < SPILLS) {
        c.spill -= 1;
        const side = Math.sign(c.a) || -1;
        const qx = side < 0 ? -g.inner.r : g.inner.r;
        const qy = g.inner.top + c.pivot;
        const cs = Math.cos(c.a);
        const sn = Math.sin(c.a);
        const rx = cs * qx - sn * qy;
        const ry = sn * qx + cs * qy;
        const [col] = shade(c.cells, topCell(c) * MAXL, c.L);
        spills.push({
          x: c.x + rx, y: c.y - c.pivot + ry,
          vx: c.vx - c.va * ry + side * (30 + Math.random() * 60),
          vy: c.vy + c.va * rx - 60 - Math.random() * 80,
          r: 1.2 + Math.random() * 2.2, col: css(col), drop: true,
        });
        c.level = Math.max(0.05, c.level - 0.004);
      }
    }
  } else if (c.mode === "fadeIn") {
    c.opacity = Math.min(1, c.opacity + dt / 0.3);
    if (c.opacity >= 1) c.mode = "rest";
    busy = true;
  } else if (c.mode === "fadeOut") {
    c.opacity = Math.max(0, c.opacity - dt / 0.25);
    busy = true;
  }

  const arrived = c.mode === "rest" || (c.mode === "enter" && Math.abs(c.x - CX) < 16);
  if (arrived && c.next < layers.length) {
    c.pourT += dt;
    const prev = c.pours[c.pours.length - 1];
    // a short pour (a syrup, a dash) follows the previous one closely
    const ready = !prev ? c.pourT > 0.02 : prev.poured >= prev.amount * 0.7 || prev.phase === "drips" || prev.phase === "done";
    if (ready) startPour(c, c.next++);
    busy = true;
  }

  const foamH = (it.foam ?? 0) * easeOut(c.foam);
  const fTop = c.level + foamH;
  const yS = levelY(g, fTop);
  const rS = levelR(g, fTop);

  let flowing = false;
  for (const p of c.pours) {
    if (p.phase === "done") continue;
    busy = true;
    p.timer += dt;
    const surfY = yS + wave(c, p.x / Math.max(1, rS), t);
    const col = c.L[p.T].css;
    if (p.phase === "fall") {
      p.headV += G_STREAM * dt;
      p.head += p.headV * dt;
      if (p.head >= surfY) {
        p.phase = "flow";
        splash(c, p.x, surfY, col, c.level > 0.02 ? 6 : 3, 1);
        kick(c, p.x / Math.max(1, rS), c.level > 0.02 ? 1 : 0.3);
        if (c.level > 0.02) c.swirlCol = col;
      }
    }
    if (p.phase === "flow" || p.phase === "tail") {
      if (p.poured < p.amount) {
        const dv = Math.min(p.rate * dt, p.amount - p.poured);
        const differs = c.level > 0.03 && share(c, p.T) < 0.8;
        deposit(c, p.T, dv);
        p.poured += dv;
        if (differs) {
          c.mix = Math.min(1, c.mix + dt * 3);
          c.swirlCol = col;
          if (g.glass && c.L[p.T].a > 0.3 && c.tendrils.length < TENDRILS && Math.random() < dt * 3.2) {
            c.tendrils.push({ x: p.x, age: 0, dir: Math.random() < 0.5 ? -1 : 1, ph: Math.random() * 6, col });
          }
        }
        flowing = true;
      }
      p.rippleT += dt;
      if (p.rippleT > 0.085) {
        p.rippleT = 0;
        splash(c, p.x, surfY, col, 1, 0.7);
        kick(c, p.x / Math.max(1, rS), 0.12);
      }
      if (p.phase === "flow" && p.poured >= p.amount) p.phase = "tail";
    }
    if (p.phase === "tail") {
      p.tailV += G_STREAM * dt;
      p.tail += p.tailV * dt;
      if (p.tail >= surfY) {
        p.phase = "drips";
        p.timer = 0;
      }
    }
    if (p.phase === "drips") {
      if (p.drips > 0 && p.timer > 0.12 + Math.random() * 0.1) {
        spawnDrop(c, p);
        p.drips--;
        p.timer = 0;
      } else if (p.drips === 0 && p.timer > 0.1) {
        p.phase = "done";
      }
    }
  }

  for (let i = c.parts.length - 1; i >= 0; i--) {
    const q = c.parts[i];
    q.vy += G_STREAM * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    const sy = yS + wave(c, clamp(q.x / Math.max(1, rS), -1, 1), t);
    if (q.vy > 0 && q.y >= sy) {
      if (q.drop) {
        splash(c, q.x, sy, q.col, 3, 0.6);
        kick(c, q.x / Math.max(1, rS), 0.35);
      } else if (c.ripples.length < RIPPLES && Math.random() < 0.3) {
        c.ripples.push({ x: q.x, age: 0 });
      }
      c.parts.splice(i, 1);
    }
  }
  if (c.parts.length) busy = true;
  for (let i = c.ripples.length - 1; i >= 0; i--) {
    c.ripples[i].age += dt;
    if (c.ripples[i].age > 0.7) c.ripples.splice(i, 1);
  }
  for (let i = c.tendrils.length - 1; i >= 0; i--) {
    c.tendrils[i].age += dt;
    if (c.tendrils[i].age > 1.8) c.tendrils.splice(i, 1);
  }
  if (c.ripples.length || c.tendrils.length) busy = true;

  const tiltTarget = clamp(-Math.tan(c.a), -0.9, 0.9) * rS * (c.mode === "fall" ? 0.8 : 1);
  c.v1 += (-70 * (c.w1 - tiltTarget) - 3.2 * c.v1) * dt;
  c.w1 += c.v1 * dt;
  c.v2 += (-190 * c.w2 - 5 * c.v2) * dt;
  c.w2 += c.v2 * dt;
  c.w3 *= Math.exp(-2.6 * dt);
  if (c.mode !== "fall") {
    const m = rS * P * 0.8;
    c.w2 = clamp(c.w2, -m, m);
  }
  if (Math.abs(c.w1 - tiltTarget) + Math.abs(c.v1) * 0.1 + Math.abs(c.w2) + Math.abs(c.v2) * 0.1 + c.w3 > 0.02) busy = true;

  const pouring = c.next < layers.length || c.pours.some((p) => p.phase !== "done");
  if (!flowing) c.mix = Math.max(0, c.mix - dt * 0.85);
  if (c.mix > 0) {
    stir(c, 1 - Math.exp(-(it.blend ?? 1) * c.mix * 3.2 * dt));
    diffuse(c, Math.min(0.25, c.mix * dt * 6 * Math.sqrt(it.blend ?? 1)));
    busy = true;
  }
  if (!pouring && c.level > 0 && c.foam < 1 && c.mode !== "fall" && it.foam) {
    c.foam = Math.min(1, c.foam + dt / 0.75);
    busy = true;
  }
  return busy;
}

/* -------------------------------------------------------------------------- */
/*                                  Rendering                                 */
/* -------------------------------------------------------------------------- */

const K = 36;
const COS = Array.from({ length: K + 1 }, (_, i) => Math.cos((i / K) * Math.PI * 2 + Math.PI));
const SIN = Array.from({ length: K + 1 }, (_, i) => Math.sin((i / K) * Math.PI * 2 + Math.PI));

function streamPath(p: Pour, yBot: number, t: number) {
  const yTop = p.phase === "tail" ? p.tail : SRC;
  if (p.phase === "drips" || p.phase === "done" || yBot - yTop < 1) return ["", ""];
  const L: string[] = [];
  const R: string[] = [];
  const n = 12;
  let hiTop = "";
  for (let i = 0; i <= n; i++) {
    const y = lerp(yTop, yBot, i / n);
    const v = Math.sqrt(V0 * V0 + 2 * G_STREAM * Math.max(0, y - SRC));
    const hw = (p.w / 2) * Math.max(0.62, Math.pow(V0 / v, 0.3));
    const wob = Math.sin(y * 0.045 + t * 14) * 0.5 * (i / n);
    L.push(`${f1(p.x - hw + wob)} ${f1(y)}`);
    R.unshift(`${f1(p.x + hw + wob)} ${f1(y)}`);
    if (i === 1) hiTop = `M${f1(p.x - hw * 0.35 + wob)} ${f1(y)}`;
  }
  const cap = p.phase === "fall" ? `A1 1 0 0 0 ${R[0]}` : `L${R[0]}`;
  const d = `M${L.join("L")}${cap}L${R.slice(1).join("L")}Z`;
  const hwB = (p.w / 2) * 0.55;
  return [d, `${hiTop}L${f1(p.x - hwB * 0.35)} ${f1(yBot - 2)}`];
}

function renderGlass(c: Glass, t: number) {
  const e = c.el;
  if (!e) return;
  const g = c.geo;
  const it = c.item;
  e.root.setAttribute("opacity", c.opacity.toFixed(3));
  e.body.setAttribute("transform", `translate(${f1(c.x)} ${f1(c.y)}) rotate(${((c.a * 180) / Math.PI).toFixed(2)} 0 ${-c.pivot})`);
  const sh = c.mode === "fall" ? Math.max(0, 1 - c.fallT * 6) : 1;
  e.shadow.setAttribute("transform", `translate(${f1(c.x)} ${FLOOR})`);
  e.shadow.setAttribute("opacity", sh.toFixed(3));

  const foamH = (it.foam ?? 0) * easeOut(c.foam);
  const fTop = c.level + foamH;
  const yS = levelY(g, fTop);
  const rS = levelR(g, fTop) * 1.02;
  const ry = rS * P;
  e.liquid.setAttribute("opacity", clamp(c.level * 50, 0, 1).toFixed(3));
  if (c.level <= 0) return;

  const pts: string[] = [];
  let back = "";
  for (let i = 0; i <= K; i++) {
    const u = COS[i];
    const pt = `${f1(rS * u)} ${f1(yS + ry * SIN[i] + wave(c, u, t))}`;
    pts.push(pt);
    if (i <= K / 2) back += (i ? "L" : "M") + pt;
  }
  const surf = `M${pts.join("L")}Z`;
  e.surf.setAttribute("d", surf);
  e.sclip.setAttribute("d", surf);
  const body = `${back}L${f1(rS + 40)} ${g.inner.bot + 40}L${f1(-rS - 40)} ${g.inner.bot + 40}Z`;
  e.liq.setAttribute("d", body);
  e.depth?.setAttribute("d", body);

  if (g.glass && foamH > 0.002) {
    const yL = levelY(g, c.level);
    const rL = levelR(g, c.level) * 1.02;
    let front = "";
    for (let i = K / 2; i <= K; i++) {
      const u = COS[i];
      front += `L${f1(rL * u)} ${f1(yL + rL * P * SIN[i] + wave(c, u, t))}`;
    }
    e.foam.setAttribute("d", `${back}${front}Z`);
  } else {
    e.foam.setAttribute("d", "");
  }

  if (c.dirty) {
    c.dirty = false;
    for (let i = 0; i < N; i++) {
      const [rgb, a] = shade(c.cells, i * MAXL, c.L);
      e.stops[i].setAttribute("stop-color", css(rgb));
      e.stops[i].setAttribute("stop-opacity", a.toFixed(3));
    }
    const [top, ta] = shade(c.cells, topCell(c) * MAXL, c.L);
    e.surf.setAttribute("fill", css(top));
    e.surf.setAttribute("fill-opacity", Math.min(1, ta + 0.1).toFixed(3));
    e.depth?.setAttribute("opacity", (ta * 0.7).toFixed(3));
    if (e.base) {
      const [b, ba] = shade(c.cells, 0, c.L);
      e.base.setAttribute("fill", css(b));
      e.base.setAttribute("fill-opacity", (ba * 0.45).toFixed(3));
    }
  }

  e.decor.setAttribute("transform", `matrix(${f1(rS)} ${(c.w1 / 1).toFixed(2)} 0 ${f1(ry)} 0 ${f1(yS + c.w2)})`);
  e.foamTop?.setAttribute("opacity", easeOut(c.foam).toFixed(3));

  const sa = clamp(c.mix * 1.2, 0, 1) * 0.8;
  for (let k = 0; k < e.swirl.length; k++) {
    if (sa < 0.01) {
      e.swirl[k].setAttribute("d", "");
      continue;
    }
    let d = "";
    const rot = t * 2.6 + k * Math.PI;
    for (let i = 0; i <= 22; i++) {
      const s = i / 22;
      const th = rot + s * Math.PI * 2.4;
      const rad = (0.12 + 0.72 * s) * 0.9;
      const u = Math.cos(th) * rad;
      d += `${i ? "L" : "M"}${f1(rS * u)} ${f1(yS + ry * Math.sin(th) * rad + wave(c, u, t))}`;
    }
    e.swirl[k].setAttribute("d", d);
    e.swirl[k].setAttribute("stroke", c.swirlCol);
    e.swirl[k].setAttribute("opacity", sa.toFixed(3));
  }

  for (let k = 0; k < e.tendrils.length; k++) {
    const td = c.tendrils[k];
    if (!td) {
      e.tendrils[k].setAttribute("d", "");
      continue;
    }
    const grow = easeOut(td.age / 0.7);
    const depth = (yS - g.inner.bot) * 0.85 * grow;
    let d = "";
    for (let i = 0; i <= 10; i++) {
      const s = i / 10;
      const x = td.x + td.dir * s * s * rS * 0.6 * grow + Math.sin(s * 5 + td.age * 3.5 + td.ph) * s * 8;
      d += `${i ? "L" : "M"}${f1(x)} ${f1(yS + 2 + s * depth)}`;
    }
    e.tendrils[k].setAttribute("d", d);
    e.tendrils[k].setAttribute("stroke", td.col);
    e.tendrils[k].setAttribute("opacity", (0.6 * (1 - td.age / 1.8)).toFixed(3));
  }

  for (let k = 0; k < RIPPLES; k++) {
    const rp = c.ripples[k];
    const el = e.ripples[k];
    if (!rp) {
      el.setAttribute("opacity", "0");
      continue;
    }
    const rx = 2 + rp.age * rS * 1.3;
    el.setAttribute("cx", f1(rp.x).toString());
    el.setAttribute("cy", f1(yS + wave(c, clamp(rp.x / rS, -1, 1), t)).toString());
    el.setAttribute("rx", f1(rx).toString());
    el.setAttribute("ry", f1(rx * P).toString());
    el.setAttribute("opacity", (0.55 * (1 - rp.age / 0.7)).toFixed(3));
  }

  for (let k = 0; k < 2; k++) {
    const p = c.pours.find((q) => q.slot === k && q.phase !== "done" && q.phase !== "drips");
    const s = e.streams[k];
    if (!p || c.mode === "fall") {
      s.path.setAttribute("d", "");
      s.hi.setAttribute("d", "");
      continue;
    }
    const yBot = p.phase === "fall" ? p.head : yS + wave(c, p.x / rS, t) + 1;
    const [d, hi] = streamPath(p, yBot, t);
    const lq = c.L[p.T];
    s.path.setAttribute("d", d);
    s.hi.setAttribute("d", hi);
    s.hi.setAttribute("stroke-opacity", (lq.a > 0.6 ? 0.4 : 0.9).toFixed(2));
    s.stops[0].setAttribute("stop-color", lq.css);
    s.stops[1].setAttribute("stop-color", lq.css);
    s.stops[1].setAttribute("stop-opacity", clamp(0.35 + lq.a, 0.45, 1).toFixed(2));
  }

  for (let k = 0; k < PARTS; k++) {
    const q = c.parts[k];
    const el = e.parts[k];
    if (!q) {
      el.setAttribute("r", "0");
      continue;
    }
    el.setAttribute("cx", f1(q.x).toString());
    el.setAttribute("cy", f1(q.y).toString());
    el.setAttribute("r", q.r.toFixed(2));
    el.setAttribute("fill", q.col);
  }
}

function cacheEls(root: SVGGElement): Els {
  const q = <T extends Element>(k: string) => root.querySelector(`[data-k="${k}"]`) as T | null;
  const all = <T extends Element>(k: string) => Array.from(root.querySelectorAll(`[data-k="${k}"]`)) as T[];
  return {
    root,
    shadow: q("shadow") as SVGGElement,
    body: q("body") as SVGGElement,
    liquid: q("liquid") as SVGGElement,
    liq: q("liq") as SVGPathElement,
    depth: q("depth") as SVGPathElement | null,
    foam: q("foam") as SVGPathElement,
    surf: q("surf") as SVGPathElement,
    sclip: q("sclip") as SVGPathElement,
    decor: q("decor") as SVGGElement,
    foamTop: q("foamtop") as SVGGElement | null,
    base: q("base") as SVGPathElement | null,
    stops: all("stop") as SVGStopElement[],
    swirl: all("swirl") as SVGPathElement[],
    tendrils: all("tendril") as SVGPathElement[],
    ripples: all("ripple") as SVGEllipseElement[],
    streams: [0, 1].map((i) => ({
      path: q(`stream${i}`) as SVGPathElement,
      hi: q(`streamhi${i}`) as SVGPathElement,
      stops: all(`sstop${i}`) as SVGStopElement[],
    })),
    parts: all("part") as SVGCircleElement[],
  };
}

/* -------------------------------------------------------------------------- */
/*                               Glassware art                                */
/* -------------------------------------------------------------------------- */

const INK = "rgba(28,26,23,";

function Stem({ g, id }: { g: Geo; id: (s: string) => string }) {
  if (!g.stem) return null;
  const { top, w, foot } = g.stem;
  return (
    <g>
      {/* foot: a thin glass disc */}
      <path d={frontBand(foot, -4, foot * 0.98, 1)} fill={`url(#${id("glassBase")})`} />
      <ellipse cx={0} cy={-4} rx={foot} ry={foot * P} fill="rgba(255,255,255,0.28)" stroke={`${INK}0.35)`} strokeWidth={0.9} />
      <ellipse cx={0} cy={-4.6} rx={foot * 0.9} ry={foot * P * 0.9} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={1} />
      {/* stem */}
      <path d={`M${-w} ${top}C${-w * 0.6} ${top + 30} ${-w * 0.7} -40 ${-w * 1.6} -6L${w * 1.6} -6C${w * 0.7} -40 ${w * 0.6} ${top + 30} ${w} ${top}Z`} fill="rgba(255,255,255,0.55)" stroke={`${INK}0.32)`} strokeWidth={0.8} />
      <path d={`M${-w * 0.3} ${top + 6}L${-w * 0.4} -12`} stroke="white" strokeOpacity={0.9} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

function Ice({ g }: { g: Geo }) {
  if (!g.ice) return null;
  return (
    <g>
      {g.ice.map(([x, y, s, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
          <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * 0.22} fill="rgba(255,255,255,0.34)" stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} />
          <rect x={-s / 2 + 3} y={-s / 2 + 3} width={s * 0.42} height={s * 0.18} rx={2} fill="rgba(255,255,255,0.6)" />
          <path d={`M${-s / 2 + 2} ${s / 2 - 3}L${s / 2 - 3} ${s / 2 - 3}`} stroke={`${INK}0.12)`} strokeWidth={1} />
        </g>
      ))}
    </g>
  );
}

function VesselBack({ g, id }: { g: Geo; id: (s: string) => string }) {
  const o = g.outer;
  const i = g.inner;
  if (g.glass) {
    return (
      <g>
        <Stem g={g} id={id} />
        <path d={silhouette(i)} fill="rgba(255,252,246,0.24)" />
        <path d={`M${-i.r} ${i.top}A${i.r} ${f1(i.r * P)} 0 0 1 ${i.r} ${i.top}`} fill="none" stroke={`${INK}0.3)`} strokeWidth={1} />
        <path d={wallLine(i, -0.97, 0.04, 0.95)} fill="none" stroke={`${INK}0.1)`} strokeWidth={1.4} />
        <path d={wallLine(i, 0.97, 0.04, 0.95)} fill="none" stroke={`${INK}0.1)`} strokeWidth={1.4} />
      </g>
    );
  }
  // copper mug
  return (
    <g>
      {g.handle && (
        <g>
          <path d={g.handle} fill="none" stroke={`url(#${id("handleCopper")})`} strokeWidth={g.handleW} strokeLinecap="round" />
          <path d={g.handle} fill="none" stroke="rgba(255,230,200,0.55)" strokeWidth={g.handleW! * 0.22} strokeLinecap="round" transform="translate(-0.6 -1.6)" filter={`url(#${id("blur1")})`} />
        </g>
      )}
      <ellipse cx={0} cy={o.top} rx={o.r} ry={o.r * P} fill="#e8b48a" />
      <ellipse cx={0} cy={i.top + 0.8} rx={i.r} ry={i.r * P} fill={`url(#${id("innerCopper")})`} />
    </g>
  );
}

function VesselFront({ g, id }: { g: Geo; id: (s: string) => string }) {
  const o = g.outer;
  const i = g.inner;
  const h = o.bot - o.top;
  if (g.glass) {
    return (
      <g>
        <path d={`${silhouette(o)}${silhouette(i)}`} fillRule="evenodd" fill={`url(#${id("glassWall")})`} />
        <path data-k="base" d={frontBand(i.rb, i.bot, o.rb, o.bot)} fill="transparent" />
        <path d={frontBand(i.rb, i.bot, o.rb, o.bot)} fill={`url(#${id("glassBase")})`} />
        <path d={`M${-o.rb} ${o.bot}A${o.rb} ${f1(o.rb * P)} 0 0 0 ${o.rb} ${o.bot}`} fill="none" stroke={`${INK}0.4)`} strokeWidth={0.9} />
        <path d={bodyPath(o)} fill={`url(#${id("glassFace")})`} />
        {/* the house line: a fine ink outline */}
        <path d={bodyPath(o)} fill="none" stroke={`${INK}0.55)`} strokeWidth={1} />
        <path d={wallLine(o, -0.78, 0.05, 0.86)} fill="none" stroke="white" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" filter={`url(#${id("blur2")})`} />
        <path d={wallLine(o, -0.8, 0.07, 0.8)} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={1.1} strokeLinecap="round" />
        <path d={wallLine(o, 0.84, 0.08, 0.42)} fill="none" stroke="white" strokeOpacity={0.6} strokeWidth={1.6} strokeLinecap="round" />
        <ellipse cx={0} cy={o.top} rx={o.r} ry={o.r * P} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={1.4} />
        <ellipse cx={0} cy={o.top} rx={o.r} ry={o.r * P} fill="none" stroke={`${INK}0.6)`} strokeWidth={0.9} />
      </g>
    );
  }
  return (
    <g>
      <path d={bodyPath(o)} fill={`url(#${id("cerCopper")})`} />
      <path d={bodyPath(o)} fill={`url(#${id("aoCopper")})`} />
      <path d={wallLine(o, -0.6, 0.12, 0.78)} fill="none" stroke="#ffe2c4" strokeOpacity={0.75} strokeWidth={h * 0.08} strokeLinecap="round" filter={`url(#${id("blur3")})`} />
      <path d={wallLine(o, -0.62, 0.16, 0.5)} fill="none" stroke="white" strokeOpacity={0.8} strokeWidth={1.4} strokeLinecap="round" filter={`url(#${id("blur05")})`} />
      {/* hammered dimples */}
      {[[-30, -110], [10, -96], [36, -70], [-18, -62], [22, -34], [-40, -30]].map(([x, y], k) => (
        <ellipse key={k} cx={x} cy={y} rx={6} ry={4} fill="rgba(255,220,190,0.18)" />
      ))}
      <path d={frontBand(o.r, o.top, i.r, i.top + 0.8)} fill="#f0c49c" />
      <path d={bodyPath(o)} fill="none" stroke={`${INK}0.6)`} strokeWidth={1} />
    </g>
  );
}

function Garnish({ g, kind }: { g: Geo; kind?: CocktailGarnish }) {
  if (!kind || kind === "none") return null;
  const o = g.outer;
  const rx = o.r * 0.82;
  const ry = o.top + 2;
  if (kind === "lemon" || kind === "orange") {
    const peel = kind === "lemon" ? "#f2cf3b" : "#ee8a2a";
    const flesh = kind === "lemon" ? "#fbe98a" : "#f9b45e";
    return (
      <g transform={`translate(${rx} ${ry}) rotate(18)`}>
        <circle r={19} fill={peel} stroke={`${INK}0.55)`} strokeWidth={1} />
        <circle r={15.5} fill={flesh} />
        {Array.from({ length: 8 }, (_, k) => (
          <path key={k} d={`M0 0L${f1(14 * Math.cos((k / 8) * Math.PI * 2))} ${f1(14 * Math.sin((k / 8) * Math.PI * 2))}`} stroke="rgba(255,255,255,0.85)" strokeWidth={1.2} />
        ))}
        <circle r={2.4} fill="rgba(255,255,255,0.9)" />
        {/* the slit that sits on the rim */}
        <rect x={-1.5} y={4} width={3} height={16} fill="#f7f3ec" />
      </g>
    );
  }
  if (kind === "twist") {
    return (
      <path d={`M${rx - 28} ${ry - 4}C${rx - 10} ${ry - 26} ${rx + 10} ${ry - 4} ${rx + 4} ${ry + 14}C${rx} ${ry + 26} ${rx + 14} ${ry + 34} ${rx + 22} ${ry + 30}`}
        fill="none" stroke="#f2cf3b" strokeWidth={6} strokeLinecap="round" />
    );
  }
  if (kind === "cherry") {
    return (
      <g transform={`translate(${-o.r * 0.25} ${o.top - 4})`}>
        <path d="M0 0C4 -18 14 -30 26 -36" fill="none" stroke="#5b3a1e" strokeWidth={2} strokeLinecap="round" />
        <circle cx={0} cy={4} r={10} fill="#a3121f" stroke={`${INK}0.55)`} strokeWidth={1} />
        <circle cx={-3} cy={1} r={2.6} fill="rgba(255,255,255,0.7)" />
      </g>
    );
  }
  // mint or basil: a few leaves standing above the rim
  const leaf = kind === "mint" ? "#4f9a3e" : "#3f8a35";
  const light = kind === "mint" ? "#79c25c" : "#62b04f";
  const leaves: [number, number, number, number][] = [[-14, -10, -30, 1], [4, -22, 8, 1.15], [20, -8, 34, 0.95], [-2, -2, -6, 0.85]];
  return (
    <g transform={`translate(${-o.r * 0.28} ${o.top + 2})`}>
      <path d="M0 6L-2 -24" stroke="#3d6e2c" strokeWidth={2} strokeLinecap="round" />
      {leaves.map(([x, y, r, s], k) => (
        <g key={k} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
          <path d="M0 0C-9 -6 -9 -20 0 -28C9 -20 9 -6 0 0Z" fill={k % 2 ? light : leaf} stroke={`${INK}0.45)`} strokeWidth={0.8} />
          <path d="M0 -2L0 -24" stroke="rgba(255,255,255,0.45)" strokeWidth={0.8} />
        </g>
      ))}
    </g>
  );
}

function Shadow({ g, id }: { g: Geo; id: (s: string) => string }) {
  const r = g.shadowR;
  return (
    <g data-k="shadow">
      <ellipse cx={10} cy={4} rx={r * 1.25} ry={r * P * 1.3} fill={`url(#${id("shadow")})`} opacity={0.55} />
      <ellipse cx={2} cy={1} rx={r * 0.98} ry={r * P * 0.9} fill="rgba(62,44,24,0.3)" filter={`url(#${id("blur3")})`} opacity={0.6} />
    </g>
  );
}

const BUBBLES: [number, number, number][] = [
  [-0.82, -0.3, 0.035], [-0.88, 0.1, 0.028], [-0.7, 0.55, 0.03], [0.86, -0.2, 0.03], [0.8, 0.4, 0.036],
  [0.55, 0.72, 0.026], [-0.4, -0.84, 0.024], [0.3, -0.88, 0.028], [-0.2, 0.9, 0.025],
];

const GlassView = React.memo(function GlassView({
  glass, id, register,
}: {
  glass: { key: number; item: CocktailPourItem };
  id: (s: string) => string;
  register: (key: number, el: SVGGElement | null) => void;
}) {
  const it = glass.item;
  const g = GEO[it.vessel] ?? GEO.rocks;
  const k = glass.key;
  const liqId = id(`liq${k}`);
  const clip = id(`clip-${it.vessel}`);
  const sclip = id(`sclip${k}`);
  return (
    <g ref={(el) => register(k, el)}>
      <defs>
        <linearGradient id={liqId} gradientUnits="userSpaceOnUse" x1={0} y1={g.inner.bot} x2={0} y2={g.inner.top}>
          {Array.from({ length: N }, (_, i) => (
            <stop key={i} data-k="stop" offset={(i + 0.5) / N} stopColor="#eee" />
          ))}
        </linearGradient>
        {[0, 1].map((s) => (
          <linearGradient key={s} id={id(`st${k}-${s}`)} gradientUnits="userSpaceOnUse" x1={0} y1={-FLOOR} x2={0} y2={-FLOOR + 70}>
            <stop data-k={`sstop${s}`} offset={0} stopOpacity={0} stopColor="#eee" />
            <stop data-k={`sstop${s}`} offset={1} stopColor="#eee" />
          </linearGradient>
        ))}
        <clipPath id={sclip}>
          <path data-k="sclip" />
        </clipPath>
      </defs>
      <Shadow g={g} id={id} />
      <g data-k="body" transform={`translate(${W + 160} ${FLOOR})`}>
        <VesselBack g={g} id={id} />
        <g data-k="liquid" opacity={0} clipPath={`url(#${clip})`}>
          <path data-k="liq" fill={`url(#${liqId})`} />
          {g.glass && <path data-k="depth" fill={`url(#${id("liqDepth")})`} />}
          {g.glass && (
            <g filter={`url(#${id("blur3")})`} fill="none" strokeLinecap="round">
              {Array.from({ length: TENDRILS }, (_, i) => (
                <path key={i} data-k="tendril" strokeWidth={6 - i} />
              ))}
            </g>
          )}
          <path data-k="foam" fill={`url(#${id("foamBand")})`} />
          <path data-k="surf" fill="#eee" />
          <g clipPath={`url(#${sclip})`}>
            <g data-k="decor">
              <circle r={1.1} fill={`url(#${id("sheen")})`} />
              {!!it.foam && (
                <g data-k="foamtop" opacity={0}>
                  <circle r={1.1} fill={`url(#${id("foamTop")})`} />
                  {BUBBLES.map(([x, y, r], j) => (
                    <circle key={j} cx={x * 0.95} cy={y} r={r * 0.8} fill="rgba(200,180,150,0.35)" />
                  ))}
                </g>
              )}
            </g>
          </g>
          <g fill="none" strokeLinecap="round" filter={`url(#${id("blur1")})`}>
            <path data-k="swirl" strokeWidth={3.2} />
            <path data-k="swirl" strokeWidth={2.2} />
          </g>
          <g fill="none" stroke="rgba(255,250,240,1)" strokeWidth={0.9}>
            {Array.from({ length: RIPPLES }, (_, i) => (
              <ellipse key={i} data-k="ripple" opacity={0} />
            ))}
          </g>
        </g>
        {it.ice && (
          <g clipPath={`url(#${clip})`}>
            <Ice g={g} />
          </g>
        )}
        {[0, 1].map((s) => (
          <g key={s}>
            <path data-k={`stream${s}`} fill={`url(#${id(`st${k}-${s}`)})`} />
            <path data-k={`streamhi${s}`} fill="none" stroke="white" strokeWidth={0.9} strokeLinecap="round" />
          </g>
        ))}
        <g>
          {Array.from({ length: PARTS }, (_, i) => (
            <circle key={i} data-k="part" r={0} />
          ))}
        </g>
        <VesselFront g={g} id={id} />
        <Garnish g={g} kind={it.garnish} />
      </g>
    </g>
  );
});

function Defs({ id }: { id: (s: string) => string }) {
  const lin = (name: string, stops: [number, string][]) => (
    <linearGradient id={id(name)} x1={0} y1={0} x2={1} y2={0}>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  const rad = (name: string, stops: [number, string][], cx = 0.5, cy = 0.5, r = 0.5) => (
    <radialGradient id={id(name)} cx={cx} cy={cy} r={r}>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </radialGradient>
  );
  const blur = (name: string, s: number) => (
    <filter id={id(name)} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation={s} />
    </filter>
  );
  return (
    <defs>
      {blur("blur05", 0.5)}
      {blur("blur1", 1)}
      {blur("blur2", 2)}
      {blur("blur3", 3.2)}
      {lin("cerCopper", [[0, "#7a3a1c"], [0.12, "#a5532a"], [0.32, "#d98a55"], [0.44, "#efb487"], [0.64, "#c46d3d"], [0.86, "#9a4c26"], [1, "#6e3318"]])}
      {lin("handleCopper", [[0, "#e7a173"], [0.5, "#b8622f"], [1, "#7c3c1c"]])}
      <linearGradient id={id("aoCopper")} x1={0} y1={0} x2={0} y2={1}>
        <stop offset={0} stopColor="rgb(70,30,12)" stopOpacity={0} />
        <stop offset={0.55} stopColor="rgb(70,30,12)" stopOpacity={0} />
        <stop offset={1} stopColor="rgb(70,30,12)" stopOpacity={0.35} />
      </linearGradient>
      {rad("innerCopper", [[0, "#f2c39b"], [0.6, "#c97e4c"], [1, "#8d4a24"]], 0.42, 0.18, 0.75)}
      {rad("shadow", [[0, "rgba(60,44,26,0.42)"], [0.5, "rgba(60,44,26,0.15)"], [1, "rgba(60,44,26,0)"]])}
      {lin("glassWall", [[0, "rgba(40,34,26,0.4)"], [0.05, "rgba(255,255,255,0.62)"], [0.13, "rgba(255,255,255,0.16)"], [0.5, "rgba(255,255,255,0.08)"], [0.84, "rgba(255,255,255,0.16)"], [0.94, "rgba(255,255,255,0.58)"], [1, "rgba(40,34,26,0.4)"]])}
      {lin("glassFace", [[0, "rgba(255,255,255,0)"], [0.1, "rgba(255,255,255,0.22)"], [0.18, "rgba(255,255,255,0.05)"], [0.6, "rgba(255,255,255,0)"], [0.88, "rgba(255,255,255,0.14)"], [1, "rgba(255,255,255,0)"]])}
      <linearGradient id={id("glassBase")} x1={0} y1={0} x2={0} y2={1}>
        <stop offset={0} stopColor="white" stopOpacity={0.35} />
        <stop offset={0.5} stopColor="white" stopOpacity={0.05} />
        <stop offset={1} stopColor="rgb(70,60,46)" stopOpacity={0.18} />
      </linearGradient>
      {lin("liqDepth", [[0, "rgba(18,10,4,0.45)"], [0.16, "rgba(18,10,4,0.08)"], [0.38, "rgba(255,240,220,0.08)"], [0.62, "rgba(18,10,4,0)"], [0.84, "rgba(18,10,4,0.1)"], [1, "rgba(18,10,4,0.5)"]])}
      {rad("sheen", [[0, "rgba(255,255,255,0.32)"], [0.6, "rgba(255,255,255,0.06)"], [1, "rgba(255,255,255,0)"]], 0.38, 0.3, 0.6)}
      {rad("foamTop", [[0, "#fffdf8"], [0.6, "#f9f4ea"], [0.86, "#efe4d2"], [1, "#d9c6a6"]])}
      <linearGradient id={id("foamBand")} x1={0} y1={1} x2={0} y2={0}>
        <stop offset={0} stopColor="#e6dccb" />
        <stop offset={0.5} stopColor="#f6f0e6" />
        <stop offset={1} stopColor="#fffcf7" />
      </linearGradient>
      {(Object.keys(GEO) as CocktailVessel[]).map((v) => (
        <clipPath key={v} id={id(`clip-${v}`)}>
          <path d={silhouette(GEO[v].inner)} />
        </clipPath>
      ))}
    </defs>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Stage                                     */
/* -------------------------------------------------------------------------- */

export interface CocktailPourStageProps {
  /** The drink to show. Changing it knocks the current glass off and pours the new one. */
  item: CocktailPourItem | null;
  /** Bump to pour the same drink again. */
  replay?: number;
  className?: string;
}

/** The SVG bar counter on its own: one glass, poured when `item` changes. */
export function CocktailPourStage({ item, replay = 0, className }: CocktailPourStageProps) {
  const reduce = useReducedMotion() ?? false;
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = React.useCallback((s: string) => `cps${uid}-${s}`, [uid]);
  const [glasses, setGlasses] = React.useState<{ key: number; item: CocktailPourItem }[]>([]);
  const sim = React.useRef(new Map<number, Glass>());
  const spills = React.useRef<Particle[]>([]);
  const spillEls = React.useRef<SVGGElement>(null);
  const raf = React.useRef(0);
  const nextKey = React.useRef(1);
  const shown = React.useRef<string | null>(null);

  const loop = React.useCallback(() => {
    if (raf.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      let busy = false;
      let removed = false;
      for (const c of sim.current.values()) {
        busy = stepGlass(c, dt, t, spills.current) || busy;
        const gone = (c.mode === "fall" && c.y - c.pivot - c.geo.height > H + 20) || (c.mode === "fadeOut" && c.opacity <= 0);
        if (gone) {
          sim.current.delete(c.key);
          removed = true;
        } else renderGlass(c, t);
      }
      const sp = spills.current;
      for (let i = sp.length - 1; i >= 0; i--) {
        const q = sp[i];
        q.vy += G_FALL * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.y > H + 20) sp.splice(i, 1);
      }
      const nodes = spillEls.current?.children;
      if (nodes) {
        for (let i = 0; i < nodes.length; i++) {
          const q = sp[i];
          const n = nodes[i];
          if (!q) {
            n.setAttribute("r", "0");
            continue;
          }
          n.setAttribute("cx", f1(q.x).toString());
          n.setAttribute("cy", f1(q.y).toString());
          n.setAttribute("r", q.r.toFixed(2));
          n.setAttribute("fill", q.col);
        }
      }
      if (sp.length) busy = true;
      if (removed) setGlasses((cs) => cs.filter((c) => sim.current.has(c.key)));
      raf.current = busy ? requestAnimationFrame(tick) : 0;
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  React.useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const token = item ? `${item.id}#${replay}` : null;
  React.useEffect(() => {
    if (!item || !token) return;
    const live = [...sim.current.values()].some((c) => c.mode !== "fall" && c.mode !== "fadeOut");
    if (live && shown.current === token) {
      loop();
      return;
    }
    shown.current = token;
    let falling = 0;
    for (const c of [...sim.current.values()]) {
      if (c.mode === "fall" || c.mode === "fadeOut") {
        falling++;
        continue;
      }
      if (c.mode === "wait") {
        sim.current.delete(c.key);
        continue;
      }
      if (reduce) {
        c.mode = "fadeOut";
        continue;
      }
      const d = c.geo.height * 0.45 - c.pivot;
      c.x += d * Math.sin(c.a);
      c.y += d - d * Math.cos(c.a);
      c.pivot += d;
      c.mode = "fall";
      c.vy = -150 - Math.random() * 60;
      c.vx = -30 - Math.random() * 50 + c.vx * 0.3;
      c.va = (Math.random() < 0.75 ? -1 : 1) * (1.3 + Math.random() * 1.4) + c.va * 0.3;
      c.pours = [];
      c.next = layersOf(c.item).length;
      falling++;
    }
    const fallers = [...sim.current.values()].filter((c) => c.mode === "fall");
    for (const c of fallers.slice(0, Math.max(0, fallers.length - 3))) sim.current.delete(c.key);

    const glass = makeGlass(nextKey.current++, item);
    if (reduce) {
      glass.mode = "fadeIn";
      glass.opacity = 0;
      glass.x = CX;
      fillInstantly(glass);
    } else {
      glass.wait = falling ? 0.14 : 0.05;
    }
    sim.current.set(glass.key, glass);
    setGlasses((cs) => [...cs.filter((c) => sim.current.has(c.key)), { key: glass.key, item }]);
    loop();
  }, [token, item, reduce, loop]);

  const register = React.useCallback(
    (key: number, el: SVGGElement | null) => {
      const c = sim.current.get(key);
      if (c && el) {
        c.el = cacheEls(el);
        c.dirty = true;
        renderGlass(c, performance.now() / 1000);
        loop();
      }
    },
    [loop],
  );

  return (
    <div
      className={cn(
        "relative aspect-[9/10] w-full overflow-hidden rounded-[28px] border-[1.5px] border-[#1C1A17]",
        "bg-[radial-gradient(80%_62%_at_50%_40%,#fffdf9_0%,#f9f5ee_45%,#efe7da_82%,#e7dccb_100%)]",
        className,
      )}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
        <Defs id={id} />
        <linearGradient id={id("table")} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor="rgb(90,70,44)" stopOpacity={0} />
          <stop offset={1} stopColor="rgb(90,70,44)" stopOpacity={0.12} />
        </linearGradient>
        <radialGradient id={id("pool")}>
          <stop offset={0} stopColor="rgb(255,252,244)" stopOpacity={0.7} />
          <stop offset={1} stopColor="rgb(255,252,244)" stopOpacity={0} />
        </radialGradient>
        <rect x={0} y={FLOOR - 30} width={W} height={H - FLOOR + 30} fill={`url(#${id("table")})`} />
        <line x1={0} y1={FLOOR - 30} x2={W} y2={FLOOR - 30} stroke="rgba(28,26,23,0.08)" strokeWidth={1} />
        <ellipse cx={CX} cy={FLOOR + 2} rx={170} ry={44} fill={`url(#${id("pool")})`} />
        {[...glasses].reverse().map((c) => (
          <GlassView key={c.key} glass={c} id={id} register={register} />
        ))}
        <g ref={spillEls}>
          {Array.from({ length: SPILLS }, (_, i) => (
            <circle key={i} r={0} />
          ))}
        </g>
      </svg>
      <p aria-live="polite" className="sr-only">
        {item ? `${item.name}${item.description ? ": " + item.description : ""}` : ""}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Menu                                     */
/* -------------------------------------------------------------------------- */

export interface CocktailPourMenuProps {
  items: CocktailPourItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

/**
 * Stage plus the list of drinks. Phone: the stage on top, the names below as
 * pills. Wider screens: names on the left, stage on the right, like the original.
 */
export function CocktailPourMenu({ items, value, defaultValue, onValueChange, label = "Cocktails", className }: CocktailPourMenuProps) {
  const [inner, setInner] = React.useState(defaultValue ?? items[0]?.id);
  const selectedId = value ?? inner;
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const reduce = useReducedMotion() ?? false;
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const btns = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (itemId: string) => {
    if (itemId === selectedId) return;
    if (value === undefined) setInner(itemId);
    onValueChange?.(itemId);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((it) => it.id === selectedId);
    let n = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % items.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    select(items[n].id);
    btns.current[n]?.focus();
  };

  return (
    // Container query: side by side only when the menu itself is wide (not the window).
    <div className={cn("@container w-full", className)}>
    <div className="grid w-full gap-4 @2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] @2xl:items-center @2xl:gap-10">
      <CocktailPourStage item={selected} className="@2xl:order-2" />
      <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="grid grid-cols-2 gap-1.5 @2xl:order-1 @2xl:flex @2xl:flex-col @2xl:gap-1">
        {items.map((it, i) => {
          const active = it.id === selected?.id;
          return (
            <button
              key={it.id}
              ref={(el) => {
                btns.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => select(it.id)}
              className="group relative min-h-[56px] rounded-2xl px-3.5 py-2.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-[#1C1A17]/50 @2xl:px-6 @2xl:py-4"
            >
              {active && (
                <motion.span
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 rounded-2xl border border-[#1C1A17] bg-white shadow-[0_1px_2px_rgba(28,26,23,0.08),0_14px_30px_-18px_rgba(28,26,23,0.35)]"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative flex min-w-0 flex-col">
                <span className={cn("truncate text-[17px] leading-tight font-medium tracking-[-0.02em] transition-colors duration-200 @2xl:text-[30px] @2xl:leading-[1.1]", active ? "text-[#1C1A17]" : "text-[#1C1A17]/45")}>
                  {it.name}
                </span>
                {it.subtitle && (
                  <span className={cn("mt-0.5 truncate text-[11px] tracking-[0.08em] uppercase transition-colors duration-200 @2xl:text-[12px]", active ? "text-[#6E665B]" : "text-[#6E665B]/60")}>
                    {it.subtitle}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    </div>
  );
}

export default CocktailPourMenu;
