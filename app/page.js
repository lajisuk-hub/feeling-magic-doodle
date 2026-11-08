"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, audio, stopAll } from "../lib/sound";
import { PIECES, pickPiece, loadPiece } from "../lib/music";
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
          <Credits />
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


// ── 음악 출처 (첫 화면 아래 작은 단추) ──
function Credits() {
  const [open, setOpen] = useState(false);
  return (
    <div className="credits">
      <button onClick={() => setOpen((v) => !v)}>🎼 음악 출처</button>
      {open && (
        <ul>
          {[...PIECES.fire, ...PIECES.calm].map((p) => <li key={p.id}><b>{p.title}</b> — {p.credit}</li>)}
        </ul>
      )}
    </div>
  );
}

// 아이 그림을 흰 종이 위 그림 파일로 (AI에게 보여 주려고)
// 그림 AI에 보낼 끼적임: 결과 그림을 무대에 「꽉 채워(cover)」 띄울 때 선 자리가 그대로 맞도록 같은 비율로 그린다
function sizeFor(aspect) {
  return aspect < 0.8 ? [1536, 1024] : aspect > 1.25 ? [1024, 1536] : [1024, 1024];
}
function doodlePng(strokes, aspect) {
  const [PW, PH] = sizeFor(aspect);
  const s = Math.max(PW, PH / aspect), ox = (PW - s) / 2, oy = (PH - s * aspect) / 2;
  const c = document.createElement("canvas"); c.width = PW; c.height = PH;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, PW, PH); x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 10;
  for (const st of strokes) {
    x.strokeStyle = COLORS[st.c].c === "#ffd60a" ? "#e0b800" : COLORS[st.c].c;
    x.beginPath(); st.p.forEach((p, i) => { const X = p[0] * s + ox, Y = p[1] * aspect * s + oy; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke();
  }
  return { img: c.toDataURL("image/png"), w: PW, h: PH, size: `${PW}x${PH}` };
}

// ── 매직 화면: 끼적임이 반짝이며 다시 그려지는 동안(음악) 그림 AI가 세밀화를 그리고, 다 되면 스르르 나타난다 ──
function Magic({ strokes, aspect, onNew }) {
  const stage = useRef(null);
  const refs = { bg: useRef(null), wash: useRef(null), glow: useRef(null), core: useRef(null), fx: useRef(null) };
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState("draw"); // draw | wait | reveal | done
  const [result, setResult] = useState(undefined); // undefined=그리는 중, {image?, name, say} 또는 {error}
  const resultRef = useRef(undefined);
  const an = useRef(null);
  if (!an.current) an.current = analyze(strokes, aspect);
  const fire = an.current.fire;
  const piece = useRef(null);
  const player = useRef(null);
  const art = useRef(null);
  if (!piece.current) piece.current = pickPiece(fire);

  // 1) 그림 AI에게 부탁 (한 번만) + 곡 불러 두기
  useEffect(() => {
    player.current = loadPiece(piece.current);
    let gone = false;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 170000);
    const done = (j) => { if (gone) return; resultRef.current = j; setResult(j); };
    fetch("/api/paint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doodlePng(strokes, aspect)), signal: ctl.signal })
      .then((r) => r.json()).then((j) => {
        if (!j.image) return done({ ...j, image: null });
        const im = new Image(); im.onload = () => done(j); im.onerror = () => done({ ...j, image: null }); im.src = j.image; // 다 받아 둔 뒤에 보여 준다
      })
      .catch(() => done({ error: "못 그렸어요", image: null }))
      .finally(() => clearTimeout(to));
    return () => { gone = true; clearTimeout(to); ctl.abort(); player.current?.stop(); stopAll(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) 끼적임이 반짝이며 다시 그려짐 + 음악 → 그림이 오면 스르르 (「다시 보기」 때마다 처음부터)
  useEffect(() => {
    const el = stage.current, w = el.clientWidth, h = el.clientHeight;
    const layers = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    const painter = new MagicPainter(layers, w, h, fire);
    layers.wash.style.filter = fire ? `blur(${Math.round(painter.bw * 1.4)}px)` : "none";
    layers.wash.style.opacity = fire ? "0.55" : "1";
    const img = art.current; img.classList.remove("show"); img.removeAttribute("src");
    const path = flatten(strokes, aspect);
    const samples = samplePoints(path, fire);
    const DRAW = Math.max(6, Math.min(11, 4 + path.total * 0.9));
    setPhase("draw");
    player.current.el.loop = true; // 그림을 기다리는 동안 음악이 끊기지 않게
    player.current.play();
    const t0 = performance.now() + 300;
    let raf = 0, alive = true, last = performance.now();
    let fired = 0, traced = false, revealAt = 0, finished = false, lastPop = 0, prevLv = 0;
    const tick = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      if (t > 0) {
        if (!traced) {
          const k = Math.min(1, t / DRAW), ease = 1 - Math.pow(1 - k, 1.6);
          painter.advance(path, path.total * ease);
          while (fired < samples.length && samples[fired].L <= path.total * ease) { painter.burst(samples[fired]); fired++; }
          if (k >= 1) { traced = true; if (resultRef.current === undefined) setPhase("wait"); }
        }
        const res = resultRef.current;
        if (traced && res !== undefined && !revealAt && !finished) {
          if (res.image) { // 세밀화가 스르르 나타난다
            img.src = res.image; void img.offsetWidth; img.classList.add("show");
            revealAt = t; setPhase("reveal"); painter.finale();
          } else { finished = true; painter.finale(); setTimeout(() => alive && setPhase("done"), 700); }
        }
        if (revealAt && !finished && t - revealAt > 3) { finished = true; setPhase("done"); }
        // 음악이 커지는 순간마다 반짝
        const lv = player.current.level();
        if (lv - prevLv > 0.06 && t - lastPop > (fire ? 0.4 : 0.55) && samples.length) {
          const s = revealAt ? { x: 0.08 + Math.random() * 0.84, y: 0.08 + Math.random() * 0.84, c: Math.floor(Math.random() * COLORS.length) } : samples[Math.floor(Math.random() * Math.max(1, traced ? samples.length : fired))];
          if (s) { revealAt || traced ? painter.pop(s) : painter.burst(s, 0.7); lastPop = t; }
        }
        prevLv = prevLv * 0.7 + lv * 0.3;
      }
      painter.frame(dt, now / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = fire ? "와! 힘찬 마음이 불꽃놀이가 되었어요 🎆" : "살랑살랑 마음이 꽃밭이 되었어요 🌸";
  const say = result?.image ? result.say : fallback;
  return (
    <div className="sketch magic">
      <div className="top">
        <div className="say">
          {phase === "draw" && <>✨ 멋진 그림으로 바뀌는 중…</>}
          {phase === "wait" && <>🎨 그림을 그리고 있어요… 조금만 기다려요</>}
          {phase === "reveal" && <>✨ {result?.name}!</>}
          {phase === "done" && <>{say}</>}
          <small className="piece">🎵 {piece.current.title}</small>
        </div>
      </div>
      <div className={`stage ${fire ? "night" : "garden"}`} ref={stage}>
        {["bg", "wash", "glow", "core"].map((k) => <canvas key={k} ref={refs[k]} className={`layer ${k}`} />)}
        <img ref={art} className="art" alt={result?.name || ""} />
        <canvas ref={refs.fx} className="layer fx" />
        {phase === "wait" && <div className="painting-note" aria-hidden>🖌️</div>}
      </div>
      <div className="bar end">
        <button className="big ghost" onClick={() => { player.current.stop(); setRun((n) => n + 1); }} disabled={phase !== "done"}>🔁 다시 보기</button>
        <button className="big go" onClick={() => { player.current?.stop(); onNew(); }}>🖍️ 새로 그리기</button>
      </div>
    </div>
  );
}
