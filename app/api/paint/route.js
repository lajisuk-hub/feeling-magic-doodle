// 아이의 끼적임 → ① 클로드가 무엇을 닮았는지 상상(이름·한 문장·장면 설명)
//               → ② 챗GPT 그림 AI가 그 장면을 세밀화로 그림(끼적임 그림을 참고 이미지로 함께 보냄)
// 필요한 환경변수: ANTHROPIC_API_KEY, OPENAI_API_KEY
export const maxDuration = 180;

const SYSTEM = `당신은 어린이집 아이들의 끼적임을 보고, 구름에서 모양을 찾듯 무엇을 닮았는지 상상해 주는 다정한 선생님입니다.
아이는 신나서, 또는 속상해서 마구 그렸을 수 있습니다. 끼적임 선의 전체 윤곽·방향·비율이 실제로 닮은 것을 고릅니다
(동물, 식물, 물건, 풍경 무엇이든 좋음). 무섭거나 슬픈 것은 고르지 않습니다.
그다음 그 대상을 주인공으로 한 따뜻하고 아름다운 그림 장면을 영어로 묘사합니다.
장면 묘사에는 끼적임의 큰 선이 그림의 어느 부분이 되는지(예: the long upper line becomes the heron's back)를 꼭 넣습니다.

출력은 정확히 아래 형식만 씁니다. 다른 말, 설명, 거절은 쓰지 않습니다.
<name>대상 이름(한국어, 짧게)</name>
<say>아이에게 해 주는 한 문장(예: 우와! 냇가에서 물을 마시는 해오라기가 되었어요!)</say>
<scene>English scene description, 2-4 sentences</scene>`;

const STYLE = "Style: delicate, realistic Korean picture-book 세밀화 painting — fine watercolor and colored pencil, rich natural detail, warm gentle light, harmonious soft colors. Not cartoonish, not 3D, not artificial. Fill the whole frame. No text, no letters, no frame or border.";

async function imagine(b64, w, h) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5", max_tokens: 700, thinking: { type: "disabled" }, system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
        { type: "text", text: `그림 크기: 가로 ${w}px, 세로 ${h}px. 이 끼적임은 무엇을 닮았나요? 정해진 형식으로만 답해 주세요.` },
      ] }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "AI 서버 오류");
  const text = (data.content || []).map((b) => b.text || "").join(" ");
  const get = (tag) => (text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim();
  const name = get("name"), scene = get("scene");
  if (!name || !scene) throw new Error("무엇을 닮았는지 못 찾았어요");
  return { name: name.slice(0, 20), say: String(get("say") || `${name}이(가) 되었어요!`).replace(/"/g, "").slice(0, 80), scene };
}

async function paint(b64, size, scene) {
  const prompt = `The attached image is a quick, messy scribble a young child drew. Turn it into a beautiful finished painting: ${scene}\nLoosely echo the scribble's overall shape, position and direction so the child can recognize their lines became this picture.\n${STYLE}`;
  let last;
  for (const model of [process.env.OPENAI_IMAGE_MODEL, "gpt-image-1.5", "gpt-image-1"].filter(Boolean)) {
    const fd = new FormData();
    fd.append("model", model);
    fd.append("image", new Blob([Buffer.from(b64, "base64")], { type: "image/png" }), "doodle.png");
    fd.append("prompt", prompt);
    fd.append("size", size);
    fd.append("quality", process.env.OPENAI_IMAGE_QUALITY || "low");
    fd.append("output_format", "jpeg");
    fd.append("output_compression", "85");
    fd.append("n", "1");
    const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
    const data = await res.json().catch(() => ({}));
    const img = data.data?.[0]?.b64_json;
    if (res.ok && img) return `data:image/jpeg;base64,${img}`;
    last = data.error?.message || `그림 AI 오류(${res.status})`;
    if (!/model|not found|does not exist|unsupported|invalid.*(model|value)/i.test(last)) break; // 모델 문제일 때만 다음 모델로
  }
  throw new Error(last || "그림을 못 받았어요");
}

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "클로드 키가 설정되지 않았습니다" }, { status: 500 });
    const { img, w, h, size } = await request.json();
    const b64 = String(img || "").split(",")[1];
    if (!b64 || !w || !h) return Response.json({ error: "그림이 없어요" }, { status: 400 });
    let idea;
    try { idea = await imagine(b64, w, h); } catch { idea = await imagine(b64, w, h); } // 한 번 더
    if (!process.env.OPENAI_API_KEY) return Response.json({ ...idea, image: null, error: "그림 AI 키가 아직 없어요" });
    const ok = ["1536x1024", "1024x1536", "1024x1024"].includes(size) ? size : "1536x1024";
    const image = await paint(b64, ok, idea.scene);
    return Response.json({ name: idea.name, say: idea.say, image });
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류" }, { status: 500 });
  }
}
