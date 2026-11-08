// 소리 파일 없이 브라우저에서 바로 음악을 만든다. (그림 음악 벽의 악기 코드를 복사해 고침)
// 도레미솔라(5음계)와 C·Am·F·G 화음만 써서, 어떤 그림이든 듣기 좋은 음악이 된다.
let ctx = null, master = null, bus = null, noise = null;

function makeBus(ac) {
  // 마른 소리 + 울림(리버브)을 함께
  const b = ac.createGain();
  b.connect(master);
  const conv = ac.createConvolver();
  const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  conv.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.28;
  b.connect(wet).connect(conv).connect(master);
  return b;
}

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createDynamicsCompressor(); // 여러 음이 겹쳐도 소리가 깨지지 않게
    master.connect(ctx.destination);
    bus = makeBus(ctx);
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise = n;
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// 예약된 소리를 모두 멈춘다
export function stopAll() {
  if (!ctx) return;
  try { bus.disconnect(); } catch {}
  bus = makeBus(ctx);
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// 크레파스 8색 — 색마다 악기가 다르다. neon = 불꽃 그림에서, pastel = 꽃 그림에서 쓰는 색
export const COLORS = [
  { c: "#ff3b3b", neon: "#ff5c5c", pastel: "#ff9e9e", name: "빨강", inst: "piano" },
  { c: "#ff8c1a", neon: "#ffa646", pastel: "#ffc68c", name: "주황", inst: "marimba" },
  { c: "#ffd60a", neon: "#fff25a", pastel: "#ffe680", name: "노랑", inst: "bell" },
  { c: "#22b35e", neon: "#55ffa0", pastel: "#9fe0b4", name: "초록", inst: "flute" },
  { c: "#2fa8ff", neon: "#5cd6ff", pastel: "#a6d9ff", name: "하늘", inst: "harp" },
  { c: "#8e4bd8", neon: "#c98bff", pastel: "#cfb2f2", name: "보라", inst: "strings" },
  { c: "#ff6fb5", neon: "#ff92d4", pastel: "#ffc1dd", name: "분홍", inst: "musicbox" },
  { c: "#3b3346", neon: "#eef3ff", pastel: "#bdb5cc", name: "검정", inst: "lowpiano" },
];

const BASE = { piano: 60, marimba: 60, bell: 72, flute: 67, harp: 60, strings: 55, musicbox: 72, lowpiano: 48 };
const PENTA = [0, 2, 4, 7, 9];
export function noteForY(y, inst) { // y: 0(위)~1(아래) → 위쪽일수록 높은 음
  const k = Math.max(0, Math.min(10, Math.floor((1 - y) * 11)));
  return (BASE[inst] ?? 60) + Math.floor(k / 5) * 12 + PENTA[k % 5];
}

const VOICE = {
  piano: { v: [[1, 1, "triangle"], [2, 0.35, "sine"], [3, 0.12, "sine"]], a: 0.008, d: 1.4, p: 0.42 },
  lowpiano: { v: [[1, 1, "triangle"], [2, 0.4, "sine"]], a: 0.008, d: 1.5, p: 0.5 },
  marimba: { v: [[1, 1, "sine"], [4, 0.3, "sine"]], a: 0.004, d: 0.6, p: 0.55 },
  bell: { v: [[1, 1, "sine"], [2.76, 0.45, "sine"], [5.4, 0.2, "sine"]], a: 0.003, d: 2.2, p: 0.32 },
  musicbox: { v: [[1, 1, "sine"], [3, 0.25, "sine"], [6.2, 0.08, "sine"]], a: 0.002, d: 1.1, p: 0.34 },
  flute: { v: [[1, 1, "sine"], [2, 0.12, "sine"]], a: 0.06, d: 0.7, p: 0.4 },
  harp: { v: [[1, 1, "triangle"], [2, 0.5, "sine"], [3, 0.2, "sine"]], a: 0.003, d: 1.2, p: 0.42 },
  strings: { v: [[1, 1, "sawtooth"], [1.006, 0.8, "sawtooth"]], a: 0.1, d: 0.9, p: 0.16 },
  pad: { v: [[1, 1, "sine"], [2, 0.3, "triangle"], [1.004, 0.6, "sine"]], a: 0.5, d: 1.2, p: 0.13 },
};

export function playNote(midi, inst = "piano", when, vol = 1, hold = 0) {
  const ac = audio();
  const t0 = when ?? ac.currentTime;
  const f = freq(midi), V = VOICE[inst] || VOICE.piano;
  const out = ac.createGain();
  out.connect(bus);
  const peak = V.p * vol, end = t0 + V.a + hold + V.d;
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(peak, t0 + V.a);
  if (hold) out.gain.setValueAtTime(peak, t0 + V.a + hold);
  out.gain.exponentialRampToValueAtTime(0.001, end);
  let dest = out;
  if (inst === "strings" || inst === "pad") {
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = inst === "pad" ? 1200 : 1800; lp.connect(out); dest = lp;
  }
  for (const [mul, amp, type] of V.v) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f * mul; g.gain.value = amp / V.v.length;
    if (inst === "flute") { const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5; lg.gain.value = f * 0.006; lfo.connect(lg).connect(o.frequency); lfo.start(t0); lfo.stop(end + 0.1); }
    o.connect(g).connect(dest);
    o.start(t0); o.stop(end + 0.1);
  }
}

// 북소리 (불꽃 그림에서만, 점점 작아진다)
function kick(t, vol) {
  const ac = audio(), o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.32);
}
function hiss(t, vol, len, hp) {
  const ac = audio(), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; f.type = "highpass"; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  s.connect(f).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
}

const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]; // C · Am · F · G

// 그림에서 뽑은 점들(그린 순서) → 음악 악보
// samples: [{y, c}], fire: 힘찬 그림이면 true
// 돌려주는 것: { events, noteTimes(초), melodyEnd, dur }
export function compose(samples, fire) {
  const M = samples.length;
  const noteTimes = [];
  let t = 0;
  for (let i = 0; i < M; i++) {
    noteTimes.push(t);
    const p = M > 1 ? i / (M - 1) : 1;
    const bpm = fire ? 160 - 76 * p : 72; // 힘찬 그림은 빠르게 시작해 점점 느긋하게
    t += 60 / bpm / 2; // 8분음표
  }
  const melodyEnd = t;
  const ev = [];
  // 멜로디: 그린 높이 = 음 높이, 색 = 악기
  samples.forEach((s, i) => {
    const p = M > 1 ? i / (M - 1) : 1;
    const inst = COLORS[s.c]?.inst || "piano";
    ev.push({ t: noteTimes[i], fn: (at) => playNote(noteForY(s.y, inst), inst, at, fire ? 1 - 0.3 * p : 0.8) });
  });
  // 화음: 8분음표 8개(한 마디)마다 C → Am → F → G
  const bars = Math.ceil(M / 8);
  for (let b = 0; b < bars; b++) {
    const at = noteTimes[b * 8];
    const next = b * 8 + 8 < M ? noteTimes[b * 8 + 8] : melodyEnd;
    const ch = CHORDS[b % 4];
    for (const n of ch) ev.push({ t: at, fn: (w) => playNote(n, "pad", w, 1, Math.max(0.2, next - at - 0.4)) });
    ev.push({ t: at, fn: (w) => playNote(ch[0] - 12, "lowpiano", w, fire ? 0.55 : 0.4) });
  }
  // 북: 힘찬 그림에서만, 처음엔 크게 → 점점 작아지다 끝 무렵엔 멈춤
  if (fire) {
    for (let i = 0; i < M; i++) {
      const p = M > 1 ? i / (M - 1) : 1; if (p > 0.78) break;
      const v = 1 - p / 0.78;
      if (i % 4 === 0) ev.push({ t: noteTimes[i], fn: (w) => kick(w, 0.9 * v) });
      if (i % 8 === 4) ev.push({ t: noteTimes[i], fn: (w) => hiss(w, 0.35 * v, 0.16, 1200) });
      ev.push({ t: noteTimes[i], fn: (w) => hiss(w, 0.12 * v, 0.05, 7000) });
    }
  }
  // 마무리: 포근한 C 화음 + 반짝 종소리
  const fin = melodyEnd + 0.15;
  [60, 64, 67, 72, 76].forEach((n, i) => ev.push({ t: fin + i * 0.13, fn: (w) => playNote(n, "bell", w, 0.7) }));
  [48, 55, 60, 64].forEach((n) => ev.push({ t: fin, fn: (w) => playNote(n, "pad", w, 1.2, 1.6) }));
  return { events: ev, noteTimes, melodyEnd, dur: fin + 3.2 };
}

// 악보를 예약하고 시작 시각(오디오 시계)을 돌려준다
export function playScore(score) {
  const ac = audio();
  stopAll();
  const start = ac.currentTime + 0.25;
  for (const e of score.events) e.fn(start + e.t);
  return start;
}
