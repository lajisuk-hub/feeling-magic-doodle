// 아이의 끼적임을 보고 무엇을 닮았는지 상상해서 맞히고(구름 보며 모양 찾듯),
// 그 물건을 같은 자리에 깔끔한 선 그림으로 그려 돌려준다.
// 필요한 환경변수: ANTHROPIC_API_KEY
export const maxDuration = 60;

function parseAiJson(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 응답에서 결과를 찾지 못했습니다");
  try { return JSON.parse(m[0]); } catch {}
  return JSON.parse(repairAiJson(m[0]));
}
function repairAiJson(s) { // wmentor-journal 패턴: 문자열 안 따옴표·줄바꿈 보정
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) { if (c === '"') inStr = true; out += c; continue; }
    if (c === "\\") { out += c + (s[i + 1] || ""); i++; continue; }
    if (c === "\n") { out += "\\n"; continue; }
    if (c === '"') {
      let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++;
      const n = s[j];
      if (n === "," || n === "}" || n === "]" || n === ":" || j >= s.length) { inStr = false; out += c; } else out += '\\"';
      continue;
    }
    out += c;
  }
  return out;
}

const SYSTEM = `당신은 어린이집 아이들의 끼적임을 보고, 구름에서 모양을 찾듯 무엇을 닮았는지 상상해 주는 다정한 선생님이자 그림책 일러스트레이터입니다.
아이는 신나서, 또는 속상해서 마구 그렸을 수 있습니다. 어떤 그림이든 반드시 아이들이 좋아할 만한 밝은 물건 하나를 찾아 줍니다.
(예: 로켓, 고래, 물고기, 새, 나비, 고양이, 강아지, 토끼, 공룡, 꽃, 나무, 해, 별, 무지개, 구름, 자동차, 기차, 배, 비행기, 집, 하트, 사과, 아이스크림, 달팽이, 거북이, 문어, 오리, 곰, 사자, 기린, 풍선, 우산 등)
무섭거나 슬픈 것은 고르지 않습니다. 끼적임의 전체 모양·방향·느낌과 가장 어울리는 것을 고릅니다.

그다음 그 물건을 **어린이 그림책 속 완성된 그림**처럼 귀엽고 알록달록하게 SVG로 그립니다. 누가 봐도 바로 알아볼 수 있어야 합니다.
- <svg viewBox="0 0 1000 1000"> 안에 그림을 크게, 가운데에 꽉 차게 그립니다. 배경은 그리지 않습니다(물건만).
- path, circle, ellipse, line, polyline, polygon, rect, g 만 씁니다. 글자(text), 그림(image), defs, 그라데이션, 필터, style 태그는 쓰지 않습니다.
- 모든 도형에 밝고 예쁜 단색 채우기(fill, 예: #ffb3c7 #ffd166 #8fd3ff #a0e7a0 #c8a2ff)와 진한 테두리(stroke="#3a2d4a" stroke-width="8" stroke-linejoin="round" stroke-linecap="round")를 줍니다. 눈동자처럼 작은 점은 fill="#3a2d4a".
- 도형은 12~35개. 뒤에 있는 큰 몸통부터, 그다음 귀·날개·다리·지느러미 같은 특징, 마지막에 눈·볼·입 같은 얼굴 순서로 씁니다(뒤에 쓴 것이 위에 보임).
- 그 물건임을 바로 알게 하는 특징을 꼭 넣습니다(나비면 양쪽 큰 날개 무늬와 더듬이, 고양이면 뾰족한 귀·수염, 로켓이면 창문·날개·불꽃).

출력은 정확히 아래 형식만 씁니다. 다른 말, 설명, 거절은 쓰지 않습니다.
<name>물건 이름(한국어, 짧게)</name>
<say>아이에게 해 주는 한 문장(예: 슝! 우주로 날아가는 로켓 같아요!)</say>
<svg viewBox="0 0 1000 1000">...</svg>`;

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 });
    const { img, w, h } = await request.json();
    const b64 = String(img || "").split(",")[1];
    if (!b64 || !w || !h) return Response.json({ error: "그림이 없어요" }, { status: 400 });

    const ask = async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 6000,
          thinking: { type: "disabled" },
          system: SYSTEM,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
            { type: "text", text: `그림 크기: 가로 ${w}px, 세로 ${h}px. 이 끼적임은 무엇을 닮았나요? 정해진 형식(name, say, svg)으로만 답해 주세요.` },
          ] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "AI 서버 오류");
      const text = (data.content || []).map((b) => b.text || "").join(" ");
      const name = (text.match(/<name>([\s\S]*?)<\/name>/) || [])[1]?.trim();
      const sayT = (text.match(/<say>([\s\S]*?)<\/say>/) || [])[1]?.trim();
      const svg = (text.match(/<svg[\s\S]*?<\/svg>/) || [])[0];
      if (!name || !svg) throw new Error("모양을 못 받았어요");
      const j = { name, say: sayT, svg };
      return { name: String(j.name).slice(0, 20), say: String(j.say || `${j.name} 같아요!`).replace(/"/g, "").slice(0, 80), svg: j.svg.slice(0, 40000) };
    };
    let out;
    try { out = await ask(); } catch { out = await ask(); } // 한 번 더 시도
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류" }, { status: 500 });
  }
}
