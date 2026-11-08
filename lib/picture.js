// AI가 보낸 SVG 그림을 안전하게 옮겨 담고(허용한 도형·속성만), 선부터 그려지고 색이 채워지게 움직인다.
const NS = "http://www.w3.org/2000/svg";
const SHAPES = new Set(["path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "g"]);
const ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity", "transform", "fill-rule"]);
const SAFE = /^[#\w\s.,%()\-+]*$/; // 숫자·색·변환만 (주소·스크립트 같은 것은 버림)

function copy(src, dst) {
  for (const ch of src.children) {
    const tag = ch.localName;
    if (!SHAPES.has(tag)) continue;
    const el = document.createElementNS(NS, tag);
    for (const a of ch.attributes) if (ATTRS.has(a.name) && SAFE.test(a.value) && !/url\s*\(/i.test(a.value)) el.setAttribute(a.name, a.value);
    if (tag === "g") copy(ch, el);
    dst.appendChild(el);
  }
}

export function buildSvg(text) {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const src = doc.querySelector("svg");
  if (!src || doc.querySelector("parsererror")) return null;
  const svg = document.createElementNS(NS, "svg");
  const vb = (src.getAttribute("viewBox") || "0 0 1000 1000").trim();
  svg.setAttribute("viewBox", SAFE.test(vb) ? vb : "0 0 1000 1000");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("fill", "none");
  copy(src, svg);
  return svg.querySelector("path,circle,ellipse,line,polyline,polygon,rect") ? svg : null;
}

// 아이 그림이 있던 자리 위에, 알아볼 만큼 크게 놓을 네모(px)
export function placeBox(strokes, W, H) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const s of strokes) for (const p of s.p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const bw = (x1 - x0) * W, bh = (y1 - y0) * H;
  const side = Math.min(H * 0.92, W * 0.92, Math.max(Math.min(W, H) * 0.66, Math.max(bw, bh) * 1.1));
  let cx = ((x0 + x1) / 2) * W, cy = ((y0 + y1) / 2) * H;
  cx = Math.max(side / 2 + 6, Math.min(W - side / 2 - 6, cx));
  cy = Math.max(side / 2 + 6, Math.min(H - side / 2 - 6, cy));
  return { left: cx - side / 2, top: cy - side / 2, side };
}

// 그리기 시작: 부품마다 선이 그려지고 곧바로 색이 채워진다. onPart(가운데 점 0~1, 순번)로 반짝이를 부른다.
// 돌려주는 것: 다 그리는 데 걸리는 초
export function animateSvg(svg, total, onPart) {
  const els = [...svg.querySelectorAll("path,circle,ellipse,line,polyline,polygon,rect")];
  const vb = svg.viewBox.baseVal;
  const lens = els.map((el) => { try { return Math.max(20, el.getTotalLength()); } catch { return 200; } });
  const sum = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  const timers = [];
  els.forEach((el, i) => {
    const len = lens[i];
    const dur = Math.max(0.18, (total * len) / sum), delay = (total * acc) / sum;
    acc += len;
    el.style.strokeDasharray = `${len} ${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.style.fillOpacity = "0";
    // 다음 장면에서 움직이기 시작
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `stroke-dashoffset ${dur}s ease-in-out ${delay}s, fill-opacity .5s ease ${delay + dur * 0.7}s`;
      el.style.strokeDashoffset = "0";
      el.style.fillOpacity = el.getAttribute("fill-opacity") || "1";
    }));
    timers.push(setTimeout(() => {
      try {
        const b = el.getBBox();
        onPart && onPart({ x: (b.x + b.width / 2 - vb.x) / vb.width, y: (b.y + b.height / 2 - vb.y) / vb.height }, i);
      } catch {}
    }, (delay + dur) * 1000));
  });
  return { dur: total, cancel: () => timers.forEach(clearTimeout) };
}
