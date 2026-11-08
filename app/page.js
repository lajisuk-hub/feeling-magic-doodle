"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, audio, compose, playScore, stopAll } from "../lib/sound";
import { analyze, flatten, samplePoints, MagicPainter } from "../lib/magic";

const r3 = (v) => Math.round(v * 1000) / 1000;

export default function Home() {
  const [screen, setScreen] = useState("start"); // start | draw | magic
  const strokes = useRef([]);
  const aspect = useRef(0.6);

  const fullscreen = () => {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen?.(); else d.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <main className="app" onContextMenu={(e) => e.preventDefault()}>
      <button className="fs-btn" onClick={fullscreen} aria-label="전체 화면">⛶</button>
      {screen === "start" && (
        <div className="start">
          <div className="start-deco" aria-hidden>🖍️ ✨ 🎵</div>
          <h1>내가 하고 싶은 대로<br />다 그려요!</h1>
          <p>신날 때도, 속상할 때도 마음대로 끼적여 봐요.<br />다 그리면 <b>✨매직</b>이 멋진 그림과 음악으로 바꿔 줘요.</p>
          <button className="big go" onClick={() => { audio(); strokes.current = []; setScreen("draw"); }}>🖍️ 그리러 가기</button>
        </div>
      )}
      {screen === "draw" && (
        <Sketch strokes={strokes} aspect={aspect} onMagic={() => setScreen("magic")} onHome={() => setScreen("start")} />
      )}
      {screen === "magic" && (
        <Magic strokes={strokes.current} aspect={aspect.current}
          onNew={() => { stopAll(); strokes.current = []; setScreen("draw"); }} />
      )}
    </main>
  );
}

// ── 스케치북 ──────────────────────────────────────────────
function Sketch({ strokes, aspect, onMagic, onHome }) {
  const stage = useRef(null);
  const cvs = useRef(null);
  const live = useRef(new Map());   // 손가락(또는 마우스)마다 그리는 중인 선
  const t0 = useRef(null);
  const strokeStart = useRef(new Map());
  const [box, setBox] = useState(null);
  const [color, setColor] = useState(0);
  const [count, setCount] = useState(strokes.current.length);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const el = stage.current;
    const on = () => setBox({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    on();
    const ro = new ResizeObserver(on); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bw = () => Math.max(6, Math.min(box.w, box.h) * 0.016);
  const ctx2d = () => {
    const c = cvs.current, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(box.w * dpr) || c.height !== Math.round(box.h * dpr)) { c.width = Math.round(box.w * dpr); c.height = Math.round(box.h * dpr); }
    const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.lineCap = "round"; x.lineJoin = "round"; return x;
  };
  const redraw = () => {
    if (!box || !cvs.current) return;
    const x = ctx2d(); x.clearRect(0, 0, box.w, box.h);
    for (const s of [...strokes.current, ...live.current.values()]) {
      x.strokeStyle = COLORS[s.c].c; x.lineWidth = bw();
      x.beginPath(); s.p.forEach((p, i) => (i ? x.lineTo(p[0] * box.w, p[1] * box.h) : x.moveTo(p[0] * box.w, p[1] * box.h)));
      if (s.p.length === 1) x.lineTo(s.p[0][0] * box.w + 0.1, s.p[0][1] * box.h);
      x.stroke();
    }
  };
  useEffect(() => { if (box) { aspect.current = box.h / box.w; redraw(); } }, [box]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const r = cvs.current.getBoundingClientRect();
    return [r3(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))), r3(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)))];
  };
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try { cvs.current.setPointerCapture?.(e.pointerId); } catch {} // 도화지 밖으로 나가도 선이 이어지게
    const now = performance.now();
    if (t0.current == null) t0.current = now - (strokes.current.length ? 1000 : 0);
    const s = { c: color, t0: Math.round(now - t0.current), p: [[...pos(e), 0]] };
    live.current.set(e.pointerId, s);
    strokeStart.current.set(e.pointerId, now);
    redraw();
  };
  const move = (e) => {
    const s = live.current.get(e.pointerId); if (!s) return;
    e.preventDefault();
    const evs = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent]; // 빠르게 그어도 점을 놓치지 않게
    const x = ctx2d(); x.strokeStyle = COLORS[s.c].c; x.lineWidth = bw();
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      const p = pos(ev), q = s.p[s.p.length - 1];
      if (Math.hypot(p[0] - q[0], (p[1] - q[1]) * aspect.current) < 0.003) continue;
      p.push(Math.round(performance.now() - strokeStart.current.get(e.pointerId)));
      s.p.push(p);
      x.beginPath(); x.moveTo(q[0] * box.w, q[1] * box.h); x.lineTo(p[0] * box.w, p[1] * box.h); x.stroke();
    }
  };
  const up = (e) => {
    const s = live.current.get(e.pointerId); if (!s) return;
    live.current.delete(e.pointerId);
    strokes.current.push(s); setCount(strokes.current.length);
  };
  const undo = () => { strokes.current.pop(); setCount(strokes.current.length); redraw(); };
  const clear = () => { strokes.current = []; t0.current = null; setCount(0); redraw(); };
  const magic = () => {
    if (!strokes.current.length) { setShake(true); setTimeout(() => setShake(false), 600); return; }
    audio(); onMagic();
  };

  return (
    <div className="sketch">
      <div className="top">
        <button className="home" onClick={onHome} aria-label="처음으로">🏠</button>
        <div className={`say${shake ? " shake" : ""}`}>
          {count ? <>다 그렸으면 <b>✨매직</b>을 눌러 주세요</> : shake ? "먼저 마음대로 그려 볼까요? 🖍️" : "내가 하고 싶은 대로 다 그려요!"}
        </div>
      </div>
      <div className="stage book" ref={stage}>
        {box && <canvas ref={cvs} className="ink" style={{ width: box.w, height: box.h }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
      </div>
      <div className="bar">
        <div className="colors">
          {COLORS.map((c, i) => (
            <button key={c.c} className={`dot${color === i ? " on" : ""}`} style={{ "--c": c.c }} onClick={() => setColor(i)} aria-label={c.name} />
          ))}
        </div>
        <div className="tools">
          <button className="tool" onClick={undo} disabled={!count}>↶<small>되돌리기</small></button>
          <button className="tool" onClick={clear} disabled={!count}>🗑<small>다 지우기</small></button>
          <button className={`magic-btn${count ? " ready" : ""}`} onClick={magic}>✨ 매직</button>
        </div>
      </div>
    </div>
  );
}

// ── 매직 화면: 그린 순서대로 멋진 그림이 피어나며 음악이 나온다 ──
function Magic({ strokes, aspect, onNew }) {
  const stage = useRef(null);
  const refs = { bg: useRef(null), wash: useRef(null), glow: useRef(null), core: useRef(null), fx: useRef(null) };
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  const [poof, setPoof] = useState(true);
  const info = useRef(null);
  if (!info.current) {
    const an = analyze(strokes, aspect);
    const path = flatten(strokes, aspect);
    const samples = samplePoints(path, an.fire);
    const score = compose(samples, an.fire);
    info.current = { an, path, samples, score };
  }
  const { an, path, samples, score } = info.current;

  useEffect(() => {
    const el = stage.current, w = el.clientWidth, h = el.clientHeight;
    const layers = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    const painter = new MagicPainter(layers, w, h, an.fire);
    layers.wash.style.filter = an.fire ? `blur(${Math.round(painter.bw * 1.4)}px)` : "none";
    layers.wash.style.opacity = an.fire ? "0.55" : "1";
    setDone(false); setPoof(true);
    const ac = audio();
    let start = null, raf = 0, last = performance.now(), fired = 0, finaled = false, alive = true;
    const timer = setTimeout(() => { setPoof(false); start = playScore(score); }, 900);
    const knotsT = [0, ...score.noteTimes, score.melodyEnd];
    const knotsL = [0, ...samples.map((s) => s.L), path.total];
    const lengthAt = (t) => {
      if (t <= 0) return 0;
      for (let i = 1; i < knotsT.length; i++) if (t <= knotsT[i]) {
        const k = (t - knotsT[i - 1]) / Math.max(1e-6, knotsT[i] - knotsT[i - 1]);
        return knotsL[i - 1] + (knotsL[i] - knotsL[i - 1]) * k;
      }
      return path.total;
    };
    const tick = (nowMs) => {
      if (!alive) return;
      const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
      if (start != null) {
        const t = ac.currentTime - start;
        painter.advance(path, lengthAt(t));
        while (fired < samples.length && score.noteTimes[fired] <= t) { painter.burst(samples[fired]); fired++; }
        if (!finaled && t >= score.melodyEnd) { finaled = true; painter.finale(); setTimeout(() => alive && setDone(true), 900); }
      }
      painter.frame(dt, nowMs / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; clearTimeout(timer); cancelAnimationFrame(raf); stopAll(); };
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sketch magic">
      <div className="top">
        <div className="say">
          {done ? (an.fire ? <>와! 힘찬 마음이 <b>불꽃놀이</b>가 되었어요 🎆</> : <>살랑살랑 마음이 <b>꽃밭</b>이 되었어요 🌸</>)
            : <>🎵 내 그림이 음악이 되고 있어요…</>}
        </div>
      </div>
      <div className={`stage ${an.fire ? "night" : "garden"}`} ref={stage}>
        {Object.entries(refs).map(([k, r]) => <canvas key={k} ref={r} className={`layer ${k}`} />)}
        {poof && <div className="poof" aria-hidden><span>✨</span><b>뾰로롱!</b></div>}
      </div>
      <div className="bar end">
        <button className="big ghost" onClick={() => setRun((n) => n + 1)} disabled={!done}>🔁 다시 듣기</button>
        <button className="big go" onClick={onNew}>🖍️ 새로 그리기</button>
      </div>
    </div>
  );
}
