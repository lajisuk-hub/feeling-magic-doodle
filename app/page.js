"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, audio, stopAll } from "../lib/sound";
import { PIECES, pickPiece, loadPiece } from "../lib/music";
import { buildSvg, placeBox, animateSvg } from "../lib/picture";
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
function doodlePng(strokes, aspect) {
  const w = 768, h = Math.round(768 * aspect);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 6;
  for (const s of strokes) {
    x.strokeStyle = COLORS[s.c].c === "#ffd60a" ? "#e0b800" : COLORS[s.c].c;
    x.beginPath(); s.p.forEach((p, i) => (i ? x.lineTo(p[0] * w, p[1] * h) : x.moveTo(p[0] * w, p[1] * h))); x.stroke();
  }
  return { img: c.toDataURL("image/png"), w, h };
}

// ── 매직 화면: AI가 무엇을 닮았는지 찾아 그 모양을 그리고, 클래식 명곡이 흐른다 ──
function Magic({ strokes, aspect, onNew }) {
  const stage = useRef(null);
  const refs = { bg: useRef(null), wash: useRef(null), glow: useRef(null), core: useRef(null), fx: useRef(null) };
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState("think"); // think | draw | done
  const [guess, setGuess] = useState(undefined); // undefined=묻는 중, null=못 맞힘
  const an = useRef(null);
  if (!an.current) an.current = analyze(strokes, aspect);
  const fire = an.current.fire;
  const piece = useRef(null);
  const player = useRef(null);
  const pic = useRef(null);
  if (!piece.current) piece.current = pickPiece(fire);

  // 1) AI에게 묻기 + 곡 미리 불러 두기 (한 번만)
  useEffect(() => {
    player.current = loadPiece(piece.current);
    let gone = false;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 25000);
    fetch("/api/guess", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doodlePng(strokes, aspect)), signal: ctl.signal })
      .then((r) => r.json()).then((j) => { if (!gone) setGuess(j.svg ? j : null); })
      .catch(() => { if (!gone) setGuess(null); })
      .finally(() => clearTimeout(to));
    return () => { gone = true; clearTimeout(to); ctl.abort(); player.current?.stop(); stopAll(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) 그리기 + 음악 (답이 오면, 그리고 「다시 듣기」 때마다)
  useEffect(() => {
    const el = stage.current, w = el.clientWidth, h = el.clientHeight;
    const layers = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
    const painter = new MagicPainter(layers, w, h, fire);
    layers.wash.style.filter = fire ? `blur(${Math.round(painter.bw * 1.4)}px)` : "none";
    layers.wash.style.opacity = fire ? "0.55" : "1";
    painter.ghost(strokes, aspect); // 아이가 그린 선은 은은하게 깔아 둔다
    let raf = 0, alive = true, last = performance.now();
    if (guess === undefined) { // 아직 생각 중: 반짝이만
      setPhase("think");
      const idle = (now) => { if (!alive) return; painter.frame(Math.min(0.05, (now - last) / 1000), now / 1000); last = now; raf = requestAnimationFrame(idle); };
      raf = requestAnimationFrame(idle);
      return () => { alive = false; cancelAnimationFrame(raf); };
    }
    // AI가 그린 완성 그림: 아이 그림 자리 위에서 선이 그려지고 색이 채워진다
    const svg = guess?.svg ? buildSvg(guess.svg) : null;
    if (svg) {
      const box = placeBox(strokes, w, h), host = pic.current;
      Object.assign(host.style, { left: box.left + "px", top: box.top + "px", width: box.side + "px", height: box.side + "px" });
      host.className = "pic"; host.replaceChildren(svg);
      setPhase("draw");
      player.current.play();
      const toStage = (q) => ({ x: (box.left + q.x * box.side) / w, y: (box.top + q.y * box.side) / h, c: Math.floor(Math.random() * COLORS.length) });
      const anim = animateSvg(svg, 7, (q) => (fire ? painter.burst(toStage(q), 0.6) : painter.pop(toStage(q))));
      let finaled = false, lastPop = 0, prevLv = 0;
      const t0 = performance.now();
      const tick = (now) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const t = (now - t0) / 1000;
        if (!finaled && t >= anim.dur + 0.6) { finaled = true; host.classList.add("done"); painter.finale(); setTimeout(() => alive && setPhase("done"), 600); }
        const lv = player.current.level(); // 음악이 커지는 순간 그림 둘레에서 반짝
        if (finaled && lv - prevLv > 0.06 && t - lastPop > (fire ? 0.4 : 0.5)) {
          const a = Math.random() * Math.PI * 2, r = 0.38 + Math.random() * 0.15;
          const q = toStage({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
          fire ? painter.burst(q, 0.6) : painter.pop(q); lastPop = t;
        }
        prevLv = prevLv * 0.7 + lv * 0.3;
        painter.frame(dt, now / 1000);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => { alive = false; anim.cancel(); cancelAnimationFrame(raf); };
    }
    if (pic.current) pic.current.replaceChildren();
    const target = strokes; // AI가 못 맞혔으면 아이 그림 그대로
    const path = flatten(target, aspect);
    const samples = samplePoints(path, fire);
    const DRAW = Math.max(6, Math.min(11, 4 + path.total * 0.9)); // 모양을 그리는 시간(초)
    setPhase("draw");
    player.current.play();
    const t0 = performance.now() + 300;
    let fired = 0, finaled = false, lastPop = 0, prevLv = 0;
    const tick = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = (now - t0) / 1000;
      if (t > 0) {
        const k = Math.min(1, t / DRAW), ease = 1 - Math.pow(1 - k, 1.6);
        painter.advance(path, path.total * ease);
        while (fired < samples.length && samples[fired].L <= path.total * ease) { painter.burst(samples[fired]); fired++; }
        if (!finaled && k >= 1) { finaled = true; painter.finale(); setTimeout(() => alive && setPhase("done"), 700); }
        // 음악이 커지는 순간마다 모양 위에서 반짝
        const lv = player.current.level();
        if (lv - prevLv > 0.06 && t - lastPop > (fire ? 0.35 : 0.5) && samples.length) {
          const s = samples[Math.floor(Math.random() * Math.max(1, finaled ? samples.length : fired))];
          if (s) { finaled ? painter.pop(s) : painter.burst(s, 0.7); lastPop = t; }
        }
        prevLv = prevLv * 0.7 + lv * 0.3;
      }
      painter.frame(dt, now / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [guess, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = guess ? guess.say : fire ? "와! 힘찬 마음이 불꽃놀이가 되었어요 🎆" : "살랑살랑 마음이 꽃밭이 되었어요 🌸";
  return (
    <div className="sketch magic">
      <div className="top">
        <div className="say">
          {phase === "think" ? <>🤔 무엇처럼 보일까요…</> : phase === "done" ? <>{say}</> : <>✨ {guess ? `${guess.name} 모양으로 바뀌는 중!` : "멋진 그림으로 변신 중!"}</>}
          {phase !== "think" && <small className="piece">🎵 {piece.current.title}</small>}
        </div>
      </div>
      <div className={`stage ${fire ? "night" : "garden"}`} ref={stage}>
        {["bg", "wash", "glow", "core"].map((k) => <canvas key={k} ref={refs[k]} className={`layer ${k}`} />)}
        <div ref={pic} className="pic" />
        <canvas ref={refs.fx} className="layer fx" />
        {phase === "think" && <div className="poof think" aria-hidden><span>✨</span><b>뾰로롱!</b><em>무엇을 닮았는지 찾고 있어요</em></div>}
      </div>
      <div className="bar end">
        <button className="big ghost" onClick={() => { player.current.stop(); setRun((n) => n + 1); }} disabled={phase !== "done"}>🔁 다시 보기</button>
        <button className="big go" onClick={() => { player.current?.stop(); onNew(); }}>🖍️ 새로 그리기</button>
      </div>
    </div>
  );
}
