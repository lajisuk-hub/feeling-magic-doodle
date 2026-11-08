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

const SYSTEM = `당신은 어린이집 아이들의 끼적임을 보고, 구름에서 모양을 찾듯 무엇을 닮았는지 상상해 주는 다정한 선생님입니다.
아이는 신나서, 또는 속상해서 마구 그렸을 수 있습니다. 어떤 그림이든 반드시 아이들이 좋아할 만한 밝은 물건 하나를 찾아 줍니다.
(예: 로켓, 고래, 물고기, 새, 나비, 고양이, 강아지, 토끼, 공룡, 꽃, 나무, 해, 별, 무지개, 구름, 자동차, 기차, 배, 비행기, 집, 하트, 사과, 아이스크림, 달팽이, 거북이, 문어 등)
무섭거나 슬픈 것(괴물, 무기, 벌레 떼, 불난 것 등)은 고르지 않습니다. 잘 모르겠으면 끼적임의 전체 모양과 방향이 가장 비슷한 것을 고릅니다.

그다음 그 물건을 그림책 선 그림처럼 단순하고 귀엽게, 끼적임이 있던 바로 그 자리에 비슷한 크기와 방향으로 그립니다.
- 좌표는 그림의 픽셀 좌표(왼쪽 위가 0,0)입니다. 끼적임의 범위를 크게 벗어나지 않게 그립니다.
- 선(stroke)은 5~14개, 선 하나는 점 6~40개로 부드럽게 이어 그립니다. 동그라미는 처음과 끝 점을 같게 닫습니다.
- 눈·입·지느러미·창문처럼 그 물건임을 알아보게 하는 특징을 꼭 넣습니다.

출력은 아래 JSON 하나만 씁니다. 다른 말, 설명, 거절은 쓰지 않습니다. 큰따옴표는 JSON 형식에만 씁니다.
{"name":"물건 이름(한국어, 짧게)","say":"아이에게 해 주는 한 문장(예: 슝! 우주로 날아가는 로켓 같아요!)","strokes":[[[x,y],[x,y]],[[x,y],[x,y]]]}`;

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
          max_tokens: 3000,
          thinking: { type: "disabled" },
          system: SYSTEM,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
            { type: "text", text: `그림 크기: 가로 ${w}px, 세로 ${h}px. 이 끼적임은 무엇을 닮았나요? JSON으로만 답해 주세요.` },
          ] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "AI 서버 오류");
      const text = (data.content || []).map((b) => b.text || "").join("\n");
      const j = parseAiJson(text);
      // 좌표를 0~1로 바꾸고 이상한 값은 버린다
      const strokes = (Array.isArray(j.strokes) ? j.strokes : [])
        .map((s) => (Array.isArray(s) ? s : []).filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
          .map((p) => [Math.max(0, Math.min(1, p[0] / w)), Math.max(0, Math.min(1, p[1] / h))]))
        .filter((s) => s.length >= 2);
      if (!strokes.length || !j.name) throw new Error("모양을 못 받았어요");
      return { name: String(j.name).slice(0, 20), say: String(j.say || `${j.name} 같아요!`).replace(/"/g, "").slice(0, 80), strokes };
    };
    let out;
    try { out = await ask(); } catch { out = await ask(); } // 한 번 더 시도
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류" }, { status: 500 });
  }
}
