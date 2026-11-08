// 클래식 명곡(저작권이 풀린 연주 / 출처 표시 조건의 연주)을 그림의 마음 결에 맞게 무작위로 고른다.
// 파일은 public/music/ 에 약 45초로 잘라 둠. 출처는 첫 화면 「음악 출처」에 표시.
import { audio } from "./sound";

export const PIECES = {
  fire: [ // 힘차게 그린 그림 → 신나고 밝은 곡
    { id: "f1", title: "모차르트 · 아이네 클라이네 나흐트무지크 1악장", credit: "Wikimedia Commons, CC BY-SA 2.0" },
    { id: "f2", title: "모차르트 · 아이네 클라이네 나흐트무지크 4악장", credit: "Wikimedia Commons, CC BY-SA 2.5" },
    { id: "f3", title: "비발디 · 사계 중 「봄」 1악장", credit: "John Harrison(바이올린), Wikimedia Commons, CC BY-SA 4.0" },
    { id: "f4", title: "로시니 · 윌리엄 텔 서곡", credit: "군악대 연주, Wikimedia Commons, 퍼블릭 도메인" },
    { id: "f5", title: "요한 슈트라우스 2세 · 아름답고 푸른 도나우", credit: "미국 해병대 군악대, Wikimedia Commons, 퍼블릭 도메인" },
  ],
  calm: [ // 살랑살랑 그린 그림 → 포근하고 잔잔한 곡
    { id: "c1", title: "드뷔시 · 달빛", credit: "Wikimedia Commons, 퍼블릭 도메인" },
    { id: "c2", title: "사티 · 짐노페디 1번", credit: "Michael Laucke, Wikimedia Commons, 퍼블릭 도메인" },
    { id: "c3", title: "바흐 · G선상의 아리아", credit: "Wikimedia Commons, 퍼블릭 도메인" },
    { id: "c4", title: "슈만 · 트로이메라이(꿈)", credit: "Musopen, Wikimedia Commons, 퍼블릭 도메인" },
    { id: "c5", title: "파헬벨 · 캐논", credit: "Wikimedia Commons, CC BY 4.0" },
    { id: "c6", title: "모차르트 · 세레나데 「로망스」", credit: "Wikimedia Commons, 퍼블릭 도메인" },
  ],
};

let lastId = "";
export function pickPiece(fire) {
  const list = PIECES[fire ? "fire" : "calm"].filter((p) => p.id !== lastId);
  const p = list[Math.floor(Math.random() * list.length)];
  lastId = p.id;
  return p;
}

// 곡을 미리 불러 둔다 → { play(), stop(), level() }
export function loadPiece(piece) {
  const ac = audio();
  const el = new Audio(`/music/${piece.id}.mp3`);
  el.preload = "auto";
  const src = ac.createMediaElementSource(el);
  const gain = ac.createGain(); gain.gain.value = 0;
  const an = ac.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5;
  src.connect(gain); gain.connect(ac.destination); gain.connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  let fadeT = 0;
  return {
    el,
    play() {
      clearTimeout(fadeT);
      el.currentTime = 0;
      const t = ac.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(1, t + 1.2);
      return el.play().catch(() => {});
    },
    stop() {
      const t = ac.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(0, t + 0.4);
      clearTimeout(fadeT); fadeT = setTimeout(() => el.pause(), 450);
    },
    level() { // 지금 소리 크기 0~1 (반짝이를 음악에 맞추려고)
      an.getByteFrequencyData(buf);
      let s = 0; for (let i = 0; i < 48; i++) s += buf[i];
      return s / (48 * 255);
    },
  };
}
