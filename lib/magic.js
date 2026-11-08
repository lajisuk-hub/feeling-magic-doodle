// 끼적인 그림을 읽고(빠르기·꺾임·양) 멋진 그림으로 다시 그리는 곳
// 선 기록: { c: 색번호, t0: 첫 선부터 ms, p: [[x(0~1), y(0~1), 이 선 시작부터 ms], ...] }
// a = 도화지 세로/가로 비율 (거리 계산을 실제 모양대로 하려고)
import { COLORS } from "./sound";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const norm = (v, lo, hi) => clamp01((v - lo) / (hi - lo));

// ── 1) 마음 결 읽기: 0(살랑살랑) ~ 1(힘차게) ─────────────
export function analyze(strokes, a) {
  let len = 0, dur = 0, turn = 0, tlen = 0, maxT = 0;
  for (const s of strokes) {
    let L = 0, prevAng = null, acc = [s.p[0]];
    for (let i = 1; i < s.p.length; i++) {
      const q = s.p[i - 1], p = s.p[i];
      L += Math.hypot(p[0] - q[0], (p[1] - q[1]) * a);
    }
    // 꺾임: 0.02 간격으로 다시 뽑아 방향이 얼마나 자주 바뀌는지
    for (let i = 1; i < s.p.length; i++) {
      const last = acc[acc.length - 1], p = s.p[i];
      if (Math.hypot(p[0] - last[0], (p[1] - last[1]) * a) >= 0.02) acc.push(p);
    }
    for (let i = 2; i < acc.length; i++) {
      const a1 = Math.atan2((acc[i - 1][1] - acc[i - 2][1]) * a, acc[i - 1][0] - acc[i - 2][0]);
      const a2 = Math.atan2((acc[i][1] - acc[i - 1][1]) * a, acc[i][0] - acc[i - 1][0]);
      let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
      turn += d; prevAng = a2;
    }
    tlen += acc.length > 2 ? L : 0;
    const d = s.p[s.p.length - 1][2] || 0;
    len += L; dur += d;
    maxT = Math.max(maxT, (s.t0 || 0) + d);
  }
  const speed = dur > 0 ? len / (dur / 1000) : 0.6;    // 1초에 도화지 폭의 몇 배를 그렸나
  const zig = tlen > 0 ? turn / tlen : 0;             // 길이 1당 꺾인 각도
  const density = len;                                 // 그린 양
  const tempo = maxT > 0 ? len / (maxT / 1000) : speed; // 쉬는 시간까지 넣은 전체 빠르기
  const energy = clamp01(0.4 * norm(speed, 0.35, 1.8) + 0.25 * norm(zig, 8, 45) + 0.2 * norm(density, 1.5, 12) + 0.15 * norm(tempo, 0.2, 1.4));
  return { energy, speed, zig, density, fire: energy >= 0.45 };
}

// ── 2) 선을 그린 순서대로 한 줄로 이어 길이를 잰다 ─────────
export function flatten(strokes, a) {
  const list = [...strokes].sort((x, y) => (x.t0 || 0) - (y.t0 || 0));
  let L = 0;
  const out = list.map((s) => {
    const pts = s.p.map((p, i) => {
      if (i) { const q = s.p[i - 1]; L += Math.hypot(p[0] - q[0], (p[1] - q[1]) * a); }
      return [p[0], p[1], L];
    });
    return { c: s.c, pts };
  });
  return { strokes: out, total: L };
}

// 길이 L 위치의 점
function pointAt(path, L) {
  for (const s of path.strokes) {
    const last = s.pts[s.pts.length - 1];
    if (L <= last[2] || s === path.strokes[path.strokes.length - 1]) {
      for (let i = 1; i < s.pts.length; i++) {
        if (s.pts[i][2] >= L) {
          const q = s.pts[i - 1], p = s.pts[i], k = p[2] > q[2] ? (L - q[2]) / (p[2] - q[2]) : 0;
          return { x: q[0] + (p[0] - q[0]) * k, y: q[1] + (p[1] - q[1]) * k, c: s.c };
        }
      }
      return { x: last[0], y: last[1], c: s.c };
    }
  }
  return { x: 0.5, y: 0.5, c: 0 };
}

// 음표 개수만큼 고르게 점을 뽑는다 (음 하나 = 점 하나 = 꽃/불꽃 하나)
export function samplePoints(path, fire) {
  const max = fire ? 56 : 36;
  const M = Math.max(12, Math.min(max, Math.round(path.total / 0.05)));
  const out = [];
  for (let i = 0; i < M; i++) { const L = ((i + 0.5) / M) * path.total; out.push({ ...pointAt(path, L), L }); }
  return out;
}

// ── 3) 멋진 그림으로 다시 그리기 ──────────────────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const GOLD = ["#fff3b0", "#ffd166", "#ffffff"];

export class MagicPainter {
  // layers: {bg, wash, glow, core, fx} 캔버스
  constructor(layers, w, h, fire) {
    this.L = layers; this.w = w; this.h = h; this.fire = fire;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.x = {};
    for (const k of Object.keys(layers)) {
      const c = layers[k]; c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr);
      const x = c.getContext("2d"); x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); x.lineCap = "round"; x.lineJoin = "round";
      this.x[k] = x;
    }
    this.m = Math.min(w, h);
    this.bw = Math.max(6, this.m * 0.016);
    this.parts = [];
    this.drawn = 0;  // 지금까지 다시 그린 길이
    this.stars = [];
    this.background();
  }

  background() {
    const { w, h } = this, x = this.x.bg;
    if (this.fire) {
      const g = x.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      g.addColorStop(0, "#2a2160"); g.addColorStop(0.55, "#141238"); g.addColorStop(1, "#07061a");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        x.globalAlpha = rnd(0.2, 0.8); x.fillStyle = "#fff";
        x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(0.4, 1.6), 0, 7); x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 0; i < 26; i++) this.stars.push({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 2.6), ph: rnd(0, 7), sp: rnd(1, 3) });
    } else {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#fff6ec"); g.addColorStop(0.5, "#fdf0f6"); g.addColorStop(1, "#eef6ff");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { // 종이에 번진 듯한 은은한 얼룩
        const cx = rnd(0, w), cy = rnd(0, h), r = rnd(this.m * 0.08, this.m * 0.22);
        const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, pick(["rgba(255,200,220,.25)", "rgba(200,225,255,.25)", "rgba(255,235,180,.25)", "rgba(210,240,215,.25)"]));
        rg.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }

  // 길이 `upto`까지 선을 이어 그린다 (그린 순서 그대로)
  advance(path, upto) {
    const from = this.drawn; if (upto <= from) return;
    const { w, h } = this;
    for (const s of path.strokes) {
      const col = COLORS[s.c] || COLORS[0];
      for (let i = 1; i < s.pts.length; i++) {
        const q = s.pts[i - 1], p = s.pts[i];
        if (p[2] <= from || q[2] >= upto) continue;
        const k0 = p[2] > q[2] ? clamp01((from - q[2]) / (p[2] - q[2])) : 0;
        const k1 = p[2] > q[2] ? clamp01((upto - q[2]) / (p[2] - q[2])) : 1;
        const x0 = (q[0] + (p[0] - q[0]) * k0) * w, y0 = (q[1] + (p[1] - q[1]) * k0) * h;
        const x1 = (q[0] + (p[0] - q[0]) * k1) * w, y1 = (q[1] + (p[1] - q[1]) * k1) * h;
        this.segment(x0, y0, x1, y1, col);
      }
    }
    this.drawn = upto;
  }

  segment(x0, y0, x1, y1, col) {
    const { bw } = this;
    if (this.fire) {
      // 빛나는 네온 줄: 흐린 후광(wash 칸, 화면에서 흐리게) + 색 줄(glow) + 하얀 심(core)
      // 검정은 무지개 빛으로 바뀐다 (마구 그린 까만 선이 알록달록하게)
      const neon = col.inst === "lowpiano" ? `hsl(${Math.round(this.drawn * 300) % 360},100%,66%)` : col.neon;
      const hw = this.x.wash;
      hw.strokeStyle = neon; hw.lineWidth = bw * 2.6;
      hw.beginPath(); hw.moveTo(x0, y0); hw.lineTo(x1, y1); hw.stroke();
      const g = this.x.glow;
      g.strokeStyle = neon; g.lineWidth = bw * 0.8;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const c = this.x.core;
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = bw * 0.22;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      if (Math.random() < 0.35) this.parts.push({ k: "spark", x: x1, y: y1, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0, max: rnd(0.4, 0.8), col: pick([neon, ...GOLD]), r: rnd(1.2, 2.6) });
    } else {
      // 수채화 줄: 은은한 번짐(wash) + 파스텔 띠(glow 칸)
      const g = this.x.glow;
      g.strokeStyle = col.pastel; g.lineWidth = bw * 1.25;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (Math.random() < len / (bw * 2.5)) {
        const wx = this.x.wash, r = rnd(bw * 1.6, bw * 3.4), cx = x1 + rnd(-bw, bw), cy = y1 + rnd(-bw, bw);
        const rg = wx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, hexA(col.pastel, 0.32)); rg.addColorStop(1, hexA(col.pastel, 0));
        wx.fillStyle = rg; wx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }

  // 음표가 울릴 때마다 그 자리에 불꽃/꽃이 핀다
  burst(pt, big = 1) {
    const x = pt.x * this.w, y = pt.y * this.h, col = COLORS[pt.c] || COLORS[0];
    if (this.fire) {
      const n = Math.round(rnd(22, 32) * big);
      const sp = this.m * rnd(0.32, 0.48) * big;
      const fc = col.inst === "lowpiano" ? `hsl(${Math.floor(rnd(0, 360))},100%,66%)` : col.neon;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1), v = sp * rnd(0.6, 1);
        this.parts.push({ k: "fw", x, y, px: x, py: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(1, 1.6), col: Math.random() < 0.7 ? fc : pick(GOLD), r: rnd(2, 3.4) * Math.sqrt(big) });
      }
      this.parts.push({ k: "flash", x, y, life: 0, max: 0.4, r: this.m * 0.08 * big, col: fc });
    } else {
      const size = this.m * rnd(0.022, 0.042) * big;
      this.parts.push({ k: "flower", x, y, life: 0, max: 0.8, size, petals: pick([5, 5, 6, 8]), rot: rnd(0, 7), col: col.pastel, deep: col.c, leaf: Math.random() < 0.45 });
      for (let i = 0; i < 4; i++) this.parts.push({ k: "glint", x: x + rnd(-size, size), y: y + rnd(-size, size), life: 0, max: rnd(0.5, 0.9), r: rnd(1.5, 3) });
    }
  }

  // 아이가 그린 선을 바탕에 은은하게
  ghost(strokes, a) {
    const x = this.x.bg, { w, h } = this;
    x.save(); x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = this.bw * 0.7;
    x.globalAlpha = this.fire ? 0.13 : 0.35;
    for (const s of strokes) {
      const col = COLORS[s.c] || COLORS[0];
      x.strokeStyle = this.fire ? col.neon : col.pastel;
      x.beginPath(); s.p.forEach((p, i) => (i ? x.lineTo(p[0] * w, p[1] * h) : x.moveTo(p[0] * w, p[1] * h))); x.stroke();
    }
    x.restore();
  }

  // 음악에 맞춘 작은 반짝 (모양을 다 그린 뒤)
  pop(pt) {
    if (this.fire) return this.burst(pt, 0.6);
    const x = pt.x * this.w, y = pt.y * this.h, r = this.m * 0.04;
    for (let i = 0; i < 5; i++) this.parts.push({ k: "glint", x: x + rnd(-r, r), y: y + rnd(-r, r), life: 0, max: rnd(0.5, 1), r: rnd(2, 4) });
  }

  // 마무리: 힘찬 그림은 커다란 불꽃놀이, 살랑 그림은 꽃잎 비
  finale() {
    if (this.fire) {
      for (let i = 0; i < 6; i++) setTimeout(() => this.burst({ x: rnd(0.15, 0.85), y: rnd(0.15, 0.55), c: Math.floor(rnd(0, COLORS.length)) }, rnd(1.4, 2)), i * 260);
    } else {
      for (let i = 0; i < 70; i++) this.parts.push({ k: "petal", x: rnd(0, this.w), y: rnd(-this.h * 0.6, 0), vy: rnd(30, 70), sw: rnd(0.8, 2), ph: rnd(0, 7), life: 0, max: rnd(5, 8), r: this.m * rnd(0.008, 0.014), col: pick(COLORS).pastel });
    }
  }

  // 매 장면마다 움직이는 반짝이들
  frame(dt, now) {
    const x = this.x.fx, { w, h } = this;
    x.clearRect(0, 0, w, h);
    if (this.fire) { // 은은히 깜빡이는 별
      for (const s of this.stars) {
        x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(now * s.sp + s.ph));
        x.fillStyle = "#fff"; x.beginPath(); x.arc(s.x, s.y, s.r, 0, 7); x.fill();
      }
      x.globalAlpha = 1;
    }
    const keep = [];
    for (const p of this.parts) {
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { if (p.k === "flower") this.stampFlower(this.x.core, p, 1); continue; }
      keep.push(p);
      if (p.k === "fw") {
        p.px = p.x; p.py = p.y;
        p.vx *= 0.985; p.vy = p.vy * 0.985 + this.m * 0.12 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        x.globalCompositeOperation = "lighter"; x.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.random());
        x.strokeStyle = p.col; x.lineWidth = p.r; x.beginPath(); x.moveTo(p.px - p.vx * 0.05, p.py - p.vy * 0.05); x.lineTo(p.x, p.y); x.stroke();
      } else if (p.k === "spark") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        x.globalCompositeOperation = "lighter"; x.globalAlpha = 1 - t;
        x.fillStyle = p.col; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
      } else if (p.k === "flash") {
        x.globalCompositeOperation = "lighter"; x.globalAlpha = (1 - t) * 0.7;
        const rg = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * (0.5 + t));
        rg.addColorStop(0, "#fff"); rg.addColorStop(0.3, p.col); rg.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = rg; x.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
      } else if (p.k === "flower") {
        x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
        this.stampFlower(x, p, backOut(t));
      } else if (p.k === "glint") {
        x.globalCompositeOperation = "source-over"; x.globalAlpha = Math.sin(t * Math.PI);
        star4(x, p.x, p.y, p.r * 2.2, "#ffd166");
      } else if (p.k === "petal") {
        p.y += p.vy * dt; const px = p.x + Math.sin(now * p.sw + p.ph) * 18;
        x.globalCompositeOperation = "source-over"; x.globalAlpha = Math.min(1, (1 - t) * 3) * 0.9;
        x.save(); x.translate(px, p.y); x.rotate(now * p.sw + p.ph); x.fillStyle = p.col;
        x.beginPath(); x.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, 7); x.fill(); x.restore();
        if (p.y > h + 20) { p.y = -20; }
      }
    }
    x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    this.parts = keep;
  }

  stampFlower(x, p, s) {
    const r = p.size * s;
    if (r <= 0.5) return;
    x.save(); x.translate(p.x, p.y); x.rotate(p.rot);
    if (p.leaf) { x.fillStyle = "#8fd19e"; for (const a of [0.6, 2.6]) { x.save(); x.rotate(a); x.beginPath(); x.ellipse(r * 1.25, 0, r * 0.75, r * 0.32, 0, 0, 7); x.fill(); x.restore(); } }
    x.fillStyle = p.col; x.strokeStyle = hexA(p.deep, 0.35); x.lineWidth = Math.max(1, r * 0.06);
    for (let i = 0; i < p.petals; i++) {
      x.save(); x.rotate((i / p.petals) * Math.PI * 2);
      x.beginPath(); x.ellipse(r * 0.55, 0, r * 0.55, r * 0.32, 0, 0, 7); x.fill(); x.stroke(); x.restore();
    }
    x.fillStyle = "#ffcf4a"; x.beginPath(); x.arc(0, 0, r * 0.28, 0, 7); x.fill();
    x.fillStyle = "rgba(255,255,255,.7)"; x.beginPath(); x.arc(-r * 0.08, -r * 0.08, r * 0.09, 0, 7); x.fill();
    x.restore();
  }

  // 완성 그림 한 장 (모든 칸을 합쳐서)
  snapshot() {
    const c = document.createElement("canvas"); c.width = this.L.bg.width; c.height = this.L.bg.height;
    const x = c.getContext("2d");
    for (const k of ["bg", "wash", "glow", "core", "fx"]) {
      if (k === "wash" && this.fire) { x.filter = `blur(${Math.round(this.bw * 1.4 * this.dpr)}px)`; x.globalAlpha = 0.55; }
      x.drawImage(this.L[k], 0, 0); x.filter = "none"; x.globalAlpha = 1;
    }
    return c;
  }
}

function backOut(t) { const s = 1.7; t -= 1; return t * t * ((s + 1) * t + s) + 1; }
function star4(x, cx, cy, r, col) {
  x.fillStyle = col; x.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.28 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
