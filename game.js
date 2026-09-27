'use strict';

// 밸런스 초깃값. planning/02-game-design.md와 03-shared-track-revision.md의 제안값이며 플레이테스트로 조정한다.
const CONFIG = {
  raceLength: 3000, // m
  baseSpeed: 25, // m/s
  boostMul: 1.6,
  boostTime: 2,
  slowMul: 0.6,
  slowTime: 3,
  protectTime: 1,
  warnTime: 0.25, // 공격 발사 후 도착까지. 아주 빠르게 날아간다
  laserSpeed: 150, // 레이저가 날아가는 속도 (m/s)
  laserLen: 30, // 레이저 광선 한 줄기의 길이 (m)
  winShowTime: 3,
  viewMeters: 36, // 주행 화면 너비에 보이는 거리
  soloViewMeters: 90, // 솔로 모드는 한 화면이 넓어서 더 멀리 보인다
  accel: 2.4, // 속도 배율 변화율(/초). 부스터·감속이 약 0.25초에 걸쳐 반영된다
  offMin: 0.12, // 전후 오프셋 off가 차지하는 화면 가로 구간
  offMax: 0.55,
  offSpeed: 10, // 전후 이동 속도 (m/s)
  kartSpeed: 0.9, // 좌우 이동 속도 (주행 영역 너비/초)
  catchStep: 25, // 선두와의 거리 이만큼마다(m)
  catchGain: 0.02, // 속도 보정을 더하고
  catchMax: 0.1, // 여기까지만 올린다
  camLag: 0.25, // 기본 속도 초과분 1m/s당 카메라가 뒤처지는 거리 (m)
  boostZoom: 0.08, // 부스터 때 줌아웃 비율
  volume: 0.5, // 전체 음량
  cutShow: 1.9, // 로켓 컷신: 전체 화면 연출 시간
  cutFly: 0.7, // 그 뒤 로켓이 각 화면의 상대에게 날아드는 시간
  slipTime: 2, // 정글: 바나나 껍질을 밟으면 미끄러져 조작 불가
  slipMul: 0.45,
  freezeTime: 2, // 북극: 물웅덩이에 빠지면 얼어서 멈춤
  dizzyTime: 4, // 사막: 뱀에 부딪히면 조작이 반대로
  hazardSafe: 1, // 장애물 효과가 끝난 뒤 다시 걸리지 않는 시간
  snakeSpeed: 1.25, // 뱀이 도로를 가로지르는 속도 (도로 폭/초)
  snakeRest: 0.5, // 뱀이 도로 가장자리에서 쉬는 시간
  stormShots: 12, // 레이저 폭풍: 무작위 줄로 쏘는 레이저 수
  stormGap: 0.2, // 레이저 사이 간격(초)
  shieldTime: 4, // 레이저 폭풍을 쓴 사람의 무적 시간
  soloAI: 9, // 솔로 모드 AI 수
  soloLatSpeed: 1, // 솔로 모드 좌우 이동 속도(도로 폭/초). 도로가 넓어서 따로 정한다
  oxyTime: 14, // 바다: 산소가 가득에서 바닥까지 줄어드는 시간(초)
  oxyBubble: 0.3, // 비눗방울 하나로 차는 산소
  oxyOut: 3, // 산소가 바닥나면 멈추는 시간
  oxyRefill: 0.5, // 멈춘 뒤 다시 채워지는 산소
};
// 주행 화면에 보이는 거리. 솔로 모드는 화면 하나를 크게 쓰므로 더 넓다.
const viewM = () => (game.solo ? CONFIG.soloViewMeters : CONFIG.viewMeters);
let OFF_MAX = 0; // 전후 오프셋 최댓값(m). 보이는 거리에 따라 computeLayout에서 정한다
const LAG_MAX = (CONFIG.boostMul - 1) * CONFIG.baseSpeed * CONFIG.camLag;

const PLAYERS = [
  { name: 'Blue', color: '#2f7be0' },
  { name: 'Red', color: '#e8433a' },
  { name: 'Yellow', color: '#f2b91f' },
  { name: 'Green', color: '#3fae5a' },
  { name: 'Purple', color: '#8e5bd0' },
  { name: 'Orange', color: '#f08a2e' },
  // 솔로 모드 AI용
  { name: 'Pink', color: '#ef6fa8' },
  { name: 'Teal', color: '#1fa9a0' },
  { name: 'Brown', color: '#9a6a3c' },
  { name: 'Navy', color: '#34488f' },
  { name: 'Lime', color: '#9bc53d' },
  { name: 'Gray', color: '#8a8a8a' },
  { name: 'Sky', color: '#5bc0eb' },
];

// 솔로 모드 AI 난이도. speed는 기본 속도 배율, react는 판단 주기(초), look은 내다보는 거리(m),
// avoid는 장애물·공격을 피하려 드는 확률, delay는 무기를 들고 기다리는 시간(초), off는 앞으로 나서는 정도다.
const LEVELS = {
  easy: { name: '쉬운 AI', speed: 0.85, react: 0.8, look: 18, avoid: 0.25, delay: 3, off: 0.25 },
  normal: { name: '보통 AI', speed: 0.93, react: 0.45, look: 28, avoid: 0.55, delay: 1.5, off: 0.45 },
  hard: { name: '어려운 AI', speed: 1, react: 0.25, look: 40, avoid: 0.85, delay: 0.7, off: 0.7 },
  expert: { name: '전문가 AI', speed: 1.07, react: 0.1, look: 55, avoid: 0.98, delay: 0.25, off: 0.95 },
  // 챔피언: 속도는 사람과 같지만 공격·레이저를 잘 피하고, 레이저를 상대와 같은 줄에서 정확히 쏜다.
  champion: { name: '챔피언 AI', speed: 1, react: 0.05, look: 70, avoid: 1, delay: 0.1, off: 1, pro: true },
};

// 코스별 색과 장애물. tip은 준비 화면, hint는 도움말 칸에 쓴다.
const COURSES = {
  road: {
    name: '레이싱 코스', tip: '장애물 없이 달리는 기본 코스예요.', hint: '기본 코스: 장애물 없음',
    sky: '#fffdf5', hill: '#e9f0d8', tree: '#d3e6b8', road: '#efe8d8', curb: '#e8433a', grass: '#5e9c43',
  },
  jungle: {
    name: '정글 코스', tip: '원숭이가 바나나 껍질을 던져요. 밟으면 2초 동안 미끄러져서 조작할 수 없어요.', hint: '바나나 껍질 → 2초 미끄러짐',
    sky: '#f4fbe8', hill: '#cfe3ae', tree: '#9fd07f', road: '#e9d9b6', curb: '#5e9c43', grass: '#3f7f2e',
  },
  arctic: {
    name: '북극 코스', tip: '물웅덩이에 빠지면 2초 동안 꽁꽁 얼어서 움직일 수 없어요.', hint: '물웅덩이 → 2초 꽁꽁',
    sky: '#f1f8ff', hill: '#f9fcff', tree: '#cfe8df', road: '#e8f2f8', curb: '#4a9be0', grass: '#8fb8cf',
  },
  sea: {
    name: '바다 코스', tip: '산소가 점점 줄어요. 비눗방울에 닿으면 산소가 조금 차요. 산소가 바닥나면 3초 동안 멈춰요.', hint: '비눗방울 → 산소 충전',
    sky: '#dff3fb', hill: '#bfe3ee', tree: '#7cc6a8', road: '#f1e4c3', curb: '#1fa9a0', grass: '#2f8f83',
  },
  desert: {
    name: '사막 코스', tip: '뱀이 도로를 가로질러 돌진해요. 부딪히면 4초 동안 해롱해롱, 조작이 반대로 돼요.', hint: '뱀 → 4초 조작 반대',
    sky: '#fff8e6', hill: '#f6e2ad', tree: '#a9d18e', road: '#f3e3bd', curb: '#e8801a', grass: '#c9a45c',
  },
};

const INK = '#2b2622';
const PAPER = '#fbf6e9';
const SKY = '#fffdf5';
const ROAD = '#efe8d8';
const FONT = "'Jua', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;

const game = {
  state: 'title', // title | select | level | course | ready | countdown | race | cutscene | paused | win | result
  selected: 2,
  count: 2, // 카트 수(AI 포함)
  humans: 2, // 이 기기에서 조작하는 사람 수 = 패널 수
  solo: false, // 솔로 모드: 사람 1명 + AI 12명
  level: 'normal',
  course: 'road',
  players: [],
  items: [],
  hazards: { puddles: [], snakes: [], monkeys: [], bananas: [], bubbles: [] },
  hazardT: 0, // 다음 바나나를 던질 때까지
  raceT: 0, // 경기 중에만 흐르는 시계. 뱀의 움직임에 쓴다
  cut: null, // 로켓 컷신 { by, t }
  storms: [], // 레이저 폭풍 { by, left, next }
  banner: null, // 모든 화면 위쪽에 잠깐 뜨는 알림 { text, color, t }
  shots: [],
  beams: [],
  fx: [],
  dust: [],
  contacts: new Set(), // 맞닿아 있는 카트 쌍
  wins: [],
  winners: [],
  time: 0,
  countdown: 0,
  goFlash: 0,
  winTimer: 0,
  pointers: new Map(), // pointerId -> { player, kind: 'steer' | 'attack' }
  layout: null,
};
window.game = game;

// ---------- 공통 도우미 ----------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hit = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
// 배경 요소의 모양을 번호마다 다르게 하되 프레임마다 같게 유지한다.
const rnd = (k) => {
  const v = Math.sin(k * 127.1 + 3.7) * 43758.5453;
  return v - Math.floor(v);
};

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function line(x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function spiky(x, y, rOut, rIn, n, rot = 0) {
  ctx.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const a = rot + (k * Math.PI) / n;
    const r = k % 2 ? rIn : rOut;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function text(str, x, y, size, color = INK, align = 'center', outline) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * 0.22;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ---------- 소리 ----------

// 소리는 모두 Web Audio로 합성한다. 한 기기를 같이 쓰므로 엔진음은 하나만 두고 전체 평균 속도를 따라간다.
let ac = null;
let master = null;
let noiseBuf = null;
let engine = null;

function setupAudio(context) {
  ac = context;
  master = ac.createGain();
  master.gain.value = CONFIG.volume;
  // 여러 명의 효과음이 겹쳐도 찢어지지 않게 한다.
  master.connect(ac.createDynamicsCompressor()).connect(ac.destination);

  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;

  // 엔진: 한 옥타브 차이에서 살짝 어긋난 톱니파 두 개가 저역 필터를 지나며 통통거린다.
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  gain.gain.value = 0;
  filter.connect(gain).connect(master);
  const oscs = [1, 0.503].map((ratio) => {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.connect(filter);
    osc.start();
    return { osc, ratio };
  });
  engine = { oscs, filter, gain };
}

// 브라우저는 사용자 입력 뒤에만 소리를 허용한다. 터치는 손을 뗄 때 허용된다.
function unlockAudio() {
  if (!ac) setupAudio(new AudioContext());
  if (ac.state !== 'running') ac.resume();
}
for (const type of ['pointerdown', 'pointerup', 'touchend']) document.addEventListener(type, unlockAudio);

// 카운트다운 중에는 공회전, 경기 중에는 속도 배율만큼 높아지고 그 밖에는 꺼진다.
function updateEngine() {
  if (!ac) return;
  const racing = game.state === 'race';
  const on = racing || game.state === 'countdown' || game.state === 'cutscene';
  const mul = racing ? game.players.reduce((sum, p) => sum + p.mul, 0) / game.players.length : 0;
  const t = ac.currentTime;
  for (const o of engine.oscs) o.osc.frequency.setTargetAtTime((60 + 50 * mul) * o.ratio, t, 0.05);
  engine.filter.frequency.setTargetAtTime(300 + 500 * mul, t, 0.05);
  engine.gain.gain.setTargetAtTime(on ? 0.06 : 0, t, 0.05);
}

// 주파수가 f0에서 f1로 미끄러지며 잦아드는 음. at은 지금부터의 지연(초)이다.
function envelope(src, freq, f0, f1, dur, vol, at) {
  const t = ac.currentTime + at;
  const g = ac.createGain();
  freq.setValueAtTime(f0, t);
  freq.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.linearRampToValueAtTime(0, t + dur);
  g.connect(master);
  src.start(t);
  src.stop(t + dur);
  return g;
}

function tone(type, f0, f1, dur, vol, at = 0) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.connect(envelope(osc, osc.frequency, f0, f1, dur, vol, at));
}

// 대역 필터를 지난 잡음. 바람·폭발 소리에 쓴다.
function noise(f0, f1, dur, vol, at = 0) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = 'bandpass';
  src.connect(flt).connect(envelope(src, flt.frequency, f0, f1, dur, vol, at));
}

const SOUNDS = {
  tap: () => tone('triangle', 660, 880, 0.08, 0.3),
  count: () => tone('square', 440, 440, 0.15, 0.25),
  go: () => tone('square', 880, 880, 0.5, 0.25),
  boost: () => {
    tone('sawtooth', 220, 880, 0.5, 0.12);
    noise(400, 3000, 0.7, 0.4);
  },
  attack: () => {
    tone('square', 523, 523, 0.08, 0.2);
    tone('square', 784, 784, 0.12, 0.2, 0.08);
  },
  laser: () => {
    tone('square', 659, 659, 0.08, 0.2);
    tone('square', 988, 988, 0.12, 0.2, 0.08);
  },
  beam: () => {
    tone('sawtooth', 1800, 200, 0.5, 0.18);
    tone('square', 900, 120, 0.5, 0.1);
  },
  // 공격이 날아가는 동안 떨어지는 휘파람 소리가 난다. 모두가 듣는 공격 예고이기도 하다.
  fire: () => tone('sine', 1500, 500, CONFIG.warnTime, 0.25),
  hit: () => {
    noise(1200, 80, 0.45, 0.8);
    tone('sawtooth', 200, 40, 0.4, 0.3);
  },
  miss: () => noise(2500, 600, 0.25, 0.5),
  bump: () => tone('sine', 180, 60, 0.12, 0.5),
  // 로켓: 경보음 두 번과 치솟는 분사음
  rocket: () => {
    for (let k = 0; k < 2; k++) tone('square', 700, 1100, 0.25, 0.15, k * 0.28);
    tone('sawtooth', 120, 900, 1.2, 0.12, 0.5);
    noise(300, 2500, 1.3, 0.5, 0.5);
  },
  slip: () => {
    tone('sine', 900, 200, 0.35, 0.3);
    tone('sine', 600, 1200, 0.3, 0.2, 0.3);
  },
  freeze: () => {
    [1568, 2093, 2637].forEach((f, k) => tone('triangle', f, f, 0.18, 0.18, k * 0.06));
    noise(6000, 3000, 0.4, 0.3);
  },
  dizzy: () => [0, 0.15, 0.3].forEach((at) => tone('sine', 500, 300, 0.15, 0.25, at)),
  toss: () => noise(800, 2000, 0.2, 0.3),
  bubble: () => tone('sine', 400, 1400, 0.12, 0.3),
  gasp: () => [0, 0.2].forEach((at) => tone('triangle', 500, 180, 0.25, 0.3, at)),
  // 레이저 폭풍: 전기가 튀는 소리와 올라가는 경보
  storm: () => {
    noise(3000, 6000, 0.5, 0.4);
    [0, 0.12, 0.24].forEach((at, k) => tone('square', 600 + k * 300, 1200 + k * 300, 0.1, 0.18, at));
  },
  win: () => [523, 659, 784, 1047].forEach((f, k) => tone('square', f, f, k < 3 ? 0.14 : 0.6, 0.22, k * 0.13)),
};

function sfx(name) {
  if (ac && ac.state === 'running') SOUNDS[name]();
}

// ---------- 레이아웃 ----------

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeLayout();
}

function computeLayout() {
  OFF_MAX = (CONFIG.offMax - CONFIG.offMin) * viewM();
  const n = game.humans;
  const barH = clamp(H * 0.08, 32, 48);
  let cols = n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
  let rows = n <= 3 ? 1 : 2;
  if (H > W) [cols, rows] = [rows, cols];
  const cw = W / cols;
  const ch = (H - barH) / rows;
  const m = 4;
  const inner = 5;
  const panels = [];
  for (let k = 0; k < cols * rows; k++) {
    const x = (k % cols) * cw + m;
    const y = barH + Math.floor(k / cols) * ch + m;
    const w = cw - m * 2;
    const h = ch - m * 2;
    const ix = x + inner;
    const iw = w - inner * 2;
    const driveH = (h - inner * 2) * (game.solo ? 0.7 : 0.6);
    const btnH = clamp(h * 0.13, 40, 64);
    const padY = y + inner + driveH + btnH + 8;
    panels.push({
      x, y, w, h,
      drive: { x: ix, y: y + inner, w: iw, h: driveH },
      btns: { x: ix, y: y + inner + driveH + 4, w: iw, h: btnH },
      pad: { x: ix, y: padY, w: iw, h: y + h - inner - padY },
    });
  }
  game.layout = { barH, panels, pauseBtn: { x: W - barH - 4, y: 3, w: barH, h: barH - 6 } };
}

// 카트 그림은 바퀴 바닥 중앙이 원점이고 너비 약 116, 높이 약 136 단위다.
// 앞코는 원점에서 NOSE만큼 앞이고, 출발선·결승선은 앞코가 닿는 자리에 그린다.
const NOSE = 56;
function kartScale(d) {
  // 카트를 작게 그려 도로를 넓게 쓴다. 솔로 모드는 13대가 달리므로 도로가 훨씬 넓다.
  if (game.solo) return Math.min((d.h * 0.14) / 136, (d.w * 0.08) / 116);
  return Math.min((d.h * 0.28) / 136, (d.w * 0.2) / 116);
}

// 패널 i의 주행 화면 기하. 같은 경기의 패널은 크기가 같으므로 판정에는 패널 0을 쓴다.
// y0~y1은 lat 0~1에 대응하는 카트 원점의 세로 범위다. 위는 머리 위 번호 표식, 아래는 전경만큼 비운다.
function view(i = 0) {
  const d = game.layout.panels[i].drive;
  const s = kartScale(d);
  const y0 = d.y + 166 * s;
  const y1 = d.y + d.h - 16 * s;
  return { d, s, y0, y1, rh: y1 - y0, ppm: d.w / viewM(), anchor: d.x + d.w * CONFIG.offMin };
}

// 보는 사람(viewer)의 화면에서 대상(target) 카트의 위치. 카메라는 viewer의 base를 따라간다.
function kartPx(viewer, target) {
  const v = view(viewer.i);
  return { ...v, x: v.anchor + (target.wx - viewer.base + viewer.lag) * v.ppm, y: v.y0 + target.lat * v.rh };
}

function padInner(pad) {
  const m = Math.min(pad.w, pad.h) * 0.15;
  return { x: pad.x + m, y: pad.y + m, w: pad.w - m * 2, h: pad.h - m * 2 };
}

// 솔로 모드는 상대가 12명이라 번호 대신 '바로 앞 상대' 버튼 하나를 둔다(target -1).
function attackButtons(pan, i) {
  const b = pan.btns;
  if (game.solo) {
    const iconW = b.h * 1.1;
    return [{ target: -1, x: b.x + iconW + 6, y: b.y, w: b.w - iconW - 6, h: b.h }];
  }
  const n = game.count - 1;
  const iconW = b.h * 1.1;
  const gap = 6;
  const w = (b.w - iconW) / n - gap;
  const out = [];
  for (let t = 0; t < game.count; t++) {
    if (t === i) continue;
    out.push({ target: t, x: b.x + iconW + gap + out.length * (w + gap), y: b.y, w, h: b.h });
  }
  return out;
}

// ---------- 경기 상태 ----------

function newRace() {
  game.players = Array.from({ length: game.count }, (_, i) => {
    const lat = (i + 0.5) / game.count;
    return {
      i, base: 0, off: 0, lat, tOff: 0, tLat: lat,
      // 트랙 위의 실제 위치. 순위·결승·아이템·공격 판정은 모두 이 값을 쓴다.
      get wx() { return this.base + this.off; },
      mul: 0, lag: 0, spin: 0, dustT: 0, row: -2, // row: 마지막으로 아이템을 얻은 줄
      boost: 0, slow: 0, protect: 0, hitFx: 0, attack: false, laser: false, touch: null, aim: null,
      slip: 0, slipDir: 1, freeze: 0, dizzy: 0, safe: 0, // 코스 장애물 상태
      shield: 0, // 레이저 폭풍을 쓴 뒤의 무적
      oxy: 1, gasp: 0, // 바다: 산소(0~1)와 산소가 바닥나 멈춘 남은 시간
      // 사람이 조작하지 않는 카트(솔로 모드)는 AI가 몬다. skill은 난이도 속도에 약간의 개인차를 섞은 값이다.
      ai: i >= game.humans ? { think: Math.random() * 0.5, hold: 0, wander: Math.random() } : null,
      skill: i >= game.humans ? LEVELS[game.level].speed * (1 + (Math.random() - 0.5) * 0.04) : 1,
    };
  });
  game.items = makeItems(game.count);
  game.hazards = makeHazards(game.items, game.count);
  game.hazardT = 1.5;
  game.raceT = 0;
  game.cut = null;
  game.storms = [];
  game.banner = null;
  game.shots = [];
  game.beams = [];
  game.fx = [];
  game.dust = [];
  game.contacts.clear();
  game.winners = [];
  game.pointers.clear();
  computeLayout();
}

// 아이템은 월드에 하나씩만 있고 먼저 닿은 카트가 가져간다.
// 선두가 독차지하지 않도록 한 지점에 가로로 나란한 줄을 놓는다.
function makeItems(n) {
  const items = [];
  const cells = n <= 3 ? 2 : n <= 6 ? 3 : 5;
  const KINDS = ['boost', 'attack', 'laser'];
  let wx = 105 + Math.random() * 20;
  for (let row = 0; wx <= CONFIG.raceLength - 100; row++) {
    // 공격·레이저·부스터가 골고루 나오도록 줄마다 돌아가며 채운다. 한 줄 안에서는 되도록 겹치지 않는다.
    const types = Array.from({ length: cells }, (_, c) => KINDS[(row * cells + c) % 3]);
    types.sort(() => Math.random() - 0.5);
    types.forEach((type, c) => {
      items.push({ wx, lat: (c + 0.5 + (Math.random() - 0.5) * 0.4) / cells, type, row, takenBy: null });
    });
    wx += 45 + Math.random() * 30;
  }
  // 특별 아이템은 줄에 속하지 않고 두 줄 사이에 하나씩 놓는다.
  // 로켓은 경기 한가운데, 레이저 폭풍은 1/4 지점과 3/4 지점에 있다.
  const xs = rowXs(items);
  for (const [type, at] of [['storm', 0.25], ['rocket', 0.5], ['storm', 0.75]]) {
    const mid = (j) => (xs[j] + xs[j + 1]) / 2;
    const goal = CONFIG.raceLength * at;
    let k = 0;
    for (let j = 1; j < xs.length - 1; j++) if (Math.abs(mid(j) - goal) < Math.abs(mid(k) - goal)) k = j;
    items.push({ wx: mid(k), lat: 0.3 + Math.random() * 0.4, type, row: -1, takenBy: null });
  }
  return items;
}

const SPECIAL = new Set(['rocket', 'storm']);

// 아이템 줄들의 위치(m). 특별 아이템은 줄에 속하지 않는다.
function rowXs(items) {
  return [...new Set(items.filter((i) => !SPECIAL.has(i.type)).map((i) => i.wx))].sort((a, b) => a - b);
}

// 코스 장애물. 물웅덩이와 뱀은 아이템 줄 사이에 놓아 아이템과 겹치지 않게 한다.
function makeHazards(items, n) {
  const hz = { puddles: [], snakes: [], monkeys: [], bananas: [], bubbles: [] };
  const xs = rowXs(items);
  const specials = items.filter((i) => SPECIAL.has(i.type));
  const spots = [60];
  for (let k = 0; k + 1 < xs.length; k++) spots.push((xs[k] + xs[k + 1]) / 2);
  spots.push((xs[xs.length - 1] + CONFIG.raceLength) / 2);
  const free = spots.filter((x) => specials.every((it) => Math.abs(x - it.wx) > 5));
  if (game.course === 'arctic') {
    const per = n <= 3 ? 1 : n <= 6 ? 2 : 3;
    for (const x of free) {
      for (let c = 0; c < per; c++) {
        const lat = per === 1 ? 0.2 + Math.random() * 0.6 : (c + 0.3 + Math.random() * 0.4) / per;
        hz.puddles.push({ wx: x + (Math.random() - 0.5) * 8, lat: clamp(lat, 0.12, 0.88), len: 8 + Math.random() * 3, hl: 0.07 });
      }
    }
  } else if (game.course === 'sea') {
    // 비눗방울은 줄 사이마다 몇 개씩 흩어 놓는다. 먼저 닿은 카트가 터뜨려 산소를 얻는다.
    const per = n <= 3 ? 2 : n <= 6 ? 3 : 4;
    for (const x of free) {
      for (let c = 0; c < per; c++) {
        hz.bubbles.push({ wx: x + (Math.random() - 0.5) * 16, lat: (c + 0.2 + Math.random() * 0.6) / per, gone: false });
      }
    }
  } else if (game.course === 'desert') {
    const period = 2 * (1 / CONFIG.snakeSpeed + CONFIG.snakeRest);
    for (const x of free) hz.snakes.push({ wx: x + (Math.random() - 0.5) * 8, phase: Math.random() * period });
  } else if (game.course === 'jungle') {
    for (let x = 40 + Math.random() * 10; x < CONFIG.raceLength - 20; x += 26 + Math.random() * 14) hz.monkeys.push({ wx: x, tossAt: -9 });
  }
  return hz;
}

// 뱀은 도로 위쪽 밖(lo)과 아래쪽 밖(hi) 사이를 쉬었다 돌진하기를 되풀이한다. dir은 머리 방향(+1 아래, -1 위)이다.
function snakePos(sn) {
  const lo = -0.1;
  const hi = 1.1;
  const run = 1 / CONFIG.snakeSpeed;
  const rest = CONFIG.snakeRest;
  const u = (game.raceT + sn.phase) % (2 * (run + rest));
  if (u < rest) return { lat: lo, dir: 1, moving: false };
  if (u < rest + run) return { lat: lo + (hi - lo) * ((u - rest) / run), dir: 1, moving: true };
  if (u < rest * 2 + run) return { lat: hi, dir: -1, moving: false };
  return { lat: hi - (hi - lo) * ((u - rest * 2 - run) / run), dir: -1, moving: true };
}

function startCountdown() {
  game.state = 'countdown';
  game.countdown = 3;
  sfx('count');
  show(null);
}

function releaseInput() {
  game.pointers.clear();
  for (const p of game.players) p.touch = null;
}

function pause() {
  if (game.state !== 'race' && game.state !== 'countdown') return;
  game.state = 'paused';
  releaseInput();
  show('pause');
}

function rankOf(p) {
  return 1 + game.players.filter((q) => q.wx > p.wx).length;
}

function update(dt) {
  game.time += dt;
  if (game.state === 'countdown') {
    // 카운트다운 중에는 좌우로만 움직인다. 전후 목표는 출발 뒤에 반영된다.
    moveKarts(dt, false);
    const before = Math.ceil(game.countdown);
    game.countdown -= dt;
    if (game.countdown <= 0) {
      game.state = 'race';
      game.goFlash = 0.7;
      sfx('go');
      launch();
    } else if (Math.ceil(game.countdown) < before) {
      sfx('count');
    }
  } else if (game.state === 'race') {
    updateRace(dt);
  } else if (game.state === 'cutscene') {
    updateCutscene(dt);
  } else if (game.state === 'win') {
    game.winTimer -= dt;
    if (game.winTimer <= 0) showResult();
  }
}

// 출발 연출: 멈춘 상태에서 짧게 가속하고 바퀴 연기를 남긴다.
function launch() {
  const v = view();
  for (const p of game.players) {
    p.mul = 0;
    for (let k = 0; k < 5; k++) {
      game.dust.push({ wx: p.wx - ((30 + k * 14) * v.s) / v.ppm, lat: p.lat, t: 0, life: 0.7 + k * 0.06, size: 1.8 });
    }
  }
}

// 초당 좌우 이동량(도로 폭 단위). 솔로 모드는 도로가 매우 넓어 화면 너비 기준이면 너무 빠르므로 따로 정한다.
function latSpeed(v) {
  return game.solo ? CONFIG.soloLatSpeed : (CONFIG.kartSpeed * v.d.w) / v.rh;
}

// 전후(off)와 좌우(lat)를 따로 움직인다. 전후는 터치만으로 순간 가속하지 못하게 더 느리다.
function moveKarts(dt, fwd) {
  const v = view();
  const offStep = CONFIG.offSpeed * dt;
  const latStep = latSpeed(v) * dt;
  for (const p of game.players) {
    // 미끄러지거나 얼었거나 산소가 바닥나면 조작이 먹히지 않는다.
    if (p.slip > 0 || p.freeze > 0 || p.gasp > 0) continue;
    if (fwd) p.off += clamp(p.tOff - p.off, -offStep, offStep);
    p.lat += clamp(p.tLat - p.lat, -latStep, latStep);
  }
  bumpKarts(v);
}

// 카트끼리 부딪히면 좌우로 밀려난다. 전진은 막지 않으므로 길막기로 순위가 굳지 않는다.
// 접촉 범위는 타원이라서 뒤에서 다가오면 서서히 옆으로 비켜난다.
function bumpKarts(v) {
  const lenX = (104 * v.s) / v.ppm;
  const lenLat = (18 * v.s) / v.rh;
  const ps = game.players;
  for (let a = 0; a < ps.length; a++) {
    for (let b = a + 1; b < ps.length; b++) {
      const A = ps[a];
      const B = ps[b];
      const key = a * 8 + b;
      const nx = (A.wx - B.wx) / lenX;
      const need = Math.abs(nx) < 1 ? lenLat * Math.sqrt(1 - nx * nx) : 0;
      const dl = A.lat - B.lat;
      if (Math.abs(dl) > need * 1.2 + 0.01) game.contacts.delete(key);
      const gap = need - Math.abs(dl);
      if (gap <= 0) continue;
      if (!game.contacts.has(key)) {
        game.contacts.add(key);
        game.fx.push({ kind: 'bump', to: a, u: (A.wx + B.wx) / 2 - A.base, lat: (A.lat + B.lat) / 2, t: 0 });
        sfx('bump');
      }
      // 반씩 밀려나고, 도로 가장자리에 막힌 만큼은 상대가 더 밀려난다.
      const dir = dl >= 0 ? 1 : -1;
      const la = A.lat + (dir * gap) / 2;
      const lb = B.lat - (dir * gap) / 2;
      const ca = clamp(la, 0, 1);
      const cb = clamp(lb, 0, 1);
      A.lat = clamp(ca - (lb - cb), 0, 1);
      B.lat = clamp(cb - (la - ca), 0, 1);
    }
  }
}

function updateRace(dt) {
  game.goFlash = Math.max(0, game.goFlash - dt);
  game.raceT += dt;
  if (game.solo) updateAI(dt);
  moveKarts(dt, true);

  const v = view();
  const lead = Math.max(...game.players.map((p) => p.wx));
  for (const p of game.players) {
    // 따라잡기 보정: 선두와 멀수록 조금 빨라진다.
    const catchUp = Math.min(CONFIG.catchMax, Math.floor((lead - p.wx) / CONFIG.catchStep) * CONFIG.catchGain);
    const target = p.freeze > 0 || p.gasp > 0 ? 0
      : (p.boost > 0 ? CONFIG.boostMul : 1) * (p.slow > 0 ? CONFIG.slowMul : 1) * (p.slip > 0 ? CONFIG.slipMul : 1) * (1 + catchUp) * p.skill;
    p.mul += clamp(target - p.mul, -CONFIG.accel * dt, CONFIG.accel * dt);
    p.base += CONFIG.baseSpeed * p.mul * dt;
    // 빨라지면 카메라가 늦게 따라와 카트가 화면 앞쪽으로 튀어나간다.
    p.lag += (Math.max(0, p.mul - 1) * CONFIG.baseSpeed * CONFIG.camLag - p.lag) * Math.min(1, dt * 4);
    p.spin += p.mul * 22 * dt;
    p.boost = Math.max(0, p.boost - dt);
    p.slow = Math.max(0, p.slow - dt);
    p.protect = Math.max(0, p.protect - dt);
    p.hitFx = Math.max(0, p.hitFx - dt);
    p.slip = Math.max(0, p.slip - dt);
    p.freeze = Math.max(0, p.freeze - dt);
    p.safe = Math.max(0, p.safe - dt);
    p.shield = Math.max(0, p.shield - dt);
    if (game.course === 'sea') breathe(p, dt);
    if (p.dizzy > 0) {
      p.dizzy = Math.max(0, p.dizzy - dt);
      if (p.dizzy === 0) resteer(p); // 해롱해롱이 풀리면 손가락 위치대로 다시 조향한다
    }

    p.dustT -= p.mul * dt;
    if (p.dustT <= 0) {
      p.dustT = 0.06;
      game.dust.push({ wx: p.wx - (44 * v.s) / v.ppm, lat: p.lat, t: 0, life: 0.45, size: 1 });
    }
  }
  takeItems(v);
  if (game.state === 'cutscene') return; // 로켓을 얻으면 경기를 멈추고 컷신으로 넘어간다
  updateHazards(dt, v);
  updateStorms(dt);
  updateBeams(dt, v);
  if (game.banner && (game.banner.t += dt) > 2) game.banner = null;

  for (const s of game.shots) s.t += dt;
  for (const s of game.shots.filter((s) => s.t >= CONFIG.warnTime)) resolveShot(s);
  game.shots = game.shots.filter((s) => s.t < CONFIG.warnTime);

  for (const f of game.fx) f.t += dt;
  game.fx = game.fx.filter((f) => f.t < 0.5);
  for (const m of game.dust) m.t += dt;
  game.dust = game.dust.filter((m) => m.t < m.life);

  const winners = game.players.filter((p) => p.wx >= CONFIG.raceLength);
  if (winners.length) finish(winners);
}

// 앞선 카트들이 매 줄을 쓸어가면 뒤쪽은 빈 줄만 만난다. 그래서 아이템을 얻은 카트는
// 그 줄의 다른 칸과 바로 다음 줄을 얻지 못한다. 1등은 부스터를 먹지 못한다.
// 무기(공격·레이저)는 하나만 가질 수 있어서, 무기를 가진 카트는 무기 칸을 소비하지 않고 지나간다.
function canTake(p, item) {
  if (item.type === 'rocket') return rankOf(p) > 1;
  if (item.type === 'storm') return true;
  if (item.row <= p.row + 1) return false;
  if (item.type === 'boost') return rankOf(p) > 1;
  return !p.attack && !p.laser;
}

// 같은 프레임에 여러 카트가 닿으면 칸 중심에 가까운 카트, 그래도 같으면 앞선 카트가 가져간다.
function takeItems(v) {
  const pickX = (74 * v.s) / v.ppm;
  const pickLat = (24 * v.s) / v.rh;
  for (const item of game.items) {
    if (item.takenBy !== null) continue;
    let best = null;
    let bestD = Infinity;
    for (const p of game.players) {
      if (!canTake(p, item)) continue;
      const dx = Math.abs(item.wx - p.wx) / pickX;
      const dy = Math.abs(item.lat - p.lat) / pickLat;
      if (dx > 1 || dy > 1) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < bestD || (dist === bestD && p.wx > best.wx)) {
        best = p;
        bestD = dist;
      }
    }
    if (!best) continue;
    item.takenBy = best.i;
    game.fx.push({ kind: 'pick', wx: item.wx, lat: item.lat, by: best.i, t: 0 });
    sfx(item.type);
    if (item.type === 'rocket') return startCutscene(best);
    if (item.type === 'storm') {
      startStorm(best);
      continue;
    }
    best.row = item.row;
    if (item.type === 'boost') best.boost = CONFIG.boostTime;
    else best[item.type] = true;
  }
}

// ---------- 로켓 컷신 ----------

// 모든 화면을 덮는 컷신 동안 경기는 멈춘다. 끝나면 로켓이 상대 전원에게 떨어진다.
function startCutscene(p) {
  game.state = 'cutscene';
  game.cut = { by: p.i, t: 0 };
}

function updateCutscene(dt) {
  game.cut.t += dt;
  for (const f of game.fx) f.t += dt;
  game.fx = game.fx.filter((f) => f.t < 0.5);
  if (game.cut.t < CONFIG.cutShow + CONFIG.cutFly) return;
  // 로켓은 보호 중이어도 반드시 맞는다.
  for (const p of game.players) {
    if (p.i === game.cut.by) continue;
    p.slow = CONFIG.slowTime;
    p.protect = CONFIG.protectTime;
    p.hitFx = 0.6;
    game.fx.push({ kind: 'hit', to: p.i, u: p.off, lat: p.lat, t: 0 });
  }
  sfx('hit');
  game.cut = null;
  game.state = 'race';
}

// ---------- 레이저 폭풍 ----------

// 레이저 폭풍 칸을 밟으면 무작위 줄로 레이저가 연달아 날아간다. 밟은 사람은 그동안 무적이다.
function startStorm(p) {
  game.storms.push({ by: p.i, left: CONFIG.stormShots, next: 0 });
  p.shield = CONFIG.shieldTime;
  game.banner = { text: `${PLAYERS[p.i].name} 레이저 폭풍!`, color: PLAYERS[p.i].color, t: 0 };
}

// 레이저는 맨 뒤 카트보다 뒤에서 출발해 선두보다 조금 앞에서 사라지므로 어느 줄에 있든 누구나 맞을 수 있다.
function updateStorms(dt) {
  for (const st of game.storms) {
    st.next -= dt;
    while (st.next <= 0 && st.left > 0) {
      st.next += CONFIG.stormGap;
      st.left--;
      const wxs = game.players.map((q) => q.wx);
      const x0 = Math.min(...wxs) - 5 - Math.random() * 15;
      game.beams.push({ from: st.by, x0, lat: 0.03 + Math.random() * 0.94, t: 0, passed: new Set([st.by]), end: Math.max(...wxs) + 60 });
      if (st.left % 2 === 0) sfx('beam');
    }
  }
  game.storms = game.storms.filter((st) => st.left > 0);
}

// ---------- 솔로 모드 AI ----------

// 바로 앞 상대. 선두라면 바로 뒤 상대를 노린다.
function nearestAhead(p) {
  const others = game.players.filter((q) => q !== p);
  const ahead = others.filter((q) => q.wx > p.wx).sort((a, b) => a.wx - b.wx);
  return ahead[0] || others.sort((a, b) => b.wx - a.wx)[0];
}

function updateAI(dt) {
  const L = LEVELS[game.level];
  for (const p of game.players) {
    if (!p.ai) continue;
    // 무기는 조금 들고 있다가 쓴다. 레이저는 앞쪽 같은 줄에 누가 있을 때 쏜다.
    p.ai.hold = p.attack || p.laser ? p.ai.hold + dt : 0;
    const foe = nearestAhead(p);
    // 챔피언은 상대가 보호 중이면 기다렸다가 쏜다.
    if (p.attack && p.ai.hold > L.delay && !(L.pro && foe.protect > 0 && p.ai.hold < 3)) fire(p, foe.i);
    if (p.laser && p.ai.hold > L.delay) {
      const lined = game.players.some((q) => q !== p && q.wx > p.wx && q.wx < p.wx + 150 && Math.abs(q.lat - p.lat) < (L.pro ? 0.03 : 0.05) && q.protect <= 0 && q.shield <= 0);
      if (lined || p.ai.hold > L.delay * (L.pro ? 80 : 3)) fireLaser(p);
    }
    p.tOff = OFF_MAX * clamp(L.off + Math.sin(game.raceT * 0.3 + p.i) * 0.1, 0, 1);
    // 챔피언은 자기를 노린 공격이나 뒤에서 오는 레이저를 보면 곧바로 다시 판단한다.
    if (L.pro && (game.shots.some((sh) => sh.to === p.i) || game.beams.some((b) => !b.passed.has(p.i) && p.wx - beamFront(b) < 80))) p.ai.think = Math.min(p.ai.think, 0);
    p.ai.think -= dt;
    if (p.ai.think > 0) continue;
    p.ai.think = L.react * (0.7 + Math.random() * 0.6);
    // 해롱해롱이면 어디로 갈지 모른다.
    p.tLat = p.dizzy > 0 ? Math.random() : aiPickLat(p, L);
  }
}

// 도로 폭을 21칸으로 나눠 점수가 가장 높은 줄을 고른다. 얻을 수 있는 아이템은 더하고,
// 알아챈 장애물·날아오는 공격·뒤에서 오는 레이저가 있는 줄은 뺀다. 가까운 위험일수록 크게 빼고,
// 옆으로 옮겨 가는 사이에 지나갈 위험(가는 길목)도 뺀다.
function aiPickLat(p, L) {
  const v = view();
  const band = (26 * v.s) / v.rh;
  const latSp = latSpeed(v); // 초당 좌우 이동량
  const speed = CONFIG.baseSpeed * Math.max(0.5, p.mul);
  const near = (wx, len = 0) => wx + len / 2 > p.wx - 2 && wx - len / 2 < p.wx + L.look;
  const gap = (wx, len = 0) => Math.max(0, wx - len / 2 - p.wx);
  // 장애물마다 알아챌지 한 번 정해 두어(avoid 확률), 판단을 자주 하는 AI가 오히려 더 자주 놓치지 않게 한다.
  const sees = (k) => rnd(k * 7.31 + p.i * 13.7 + p.ai.wander * 101) < L.avoid;
  const hz = game.hazards;
  const items = game.items.filter((it) => it.takenBy === null && near(it.wx) && canTake(p, it));
  const danger = []; // [줄, 반폭, 비용, 앞끝까지 거리(m), 길이(m)]
  hz.puddles.forEach((pd, k) => near(pd.wx, pd.len) && sees(k) && danger.push([pd.lat, pd.hl + band * 1.3, 100, gap(pd.wx, pd.len), pd.len]));
  for (const b of hz.bananas) if (near(b.wx) && sees(b.wx)) danger.push([b.lat, band * 1.5, 100, gap(b.wx), 2]);
  hz.snakes.forEach((sn, k) => near(sn.wx) && sees(k + 0.5) && danger.push([snakePos(sn).lat, 0.3, 40, gap(sn.wx), 3]));
  if (Math.random() < L.avoid) {
    for (const sh of game.shots) if (sh.to === p.i) danger.push([sh.v, band * 2, 100, 0, 0]);
    for (const b of game.beams) if (!b.passed.has(p.i) && beamFront(b) < p.wx) danger.push([b.lat, band * 1.5, 80, 0, 0]);
  }
  // 바다에서는 산소가 적을수록 비눗방울을 찾아간다.
  const air = hz.bubbles.filter((b) => near(b.wx)).map((b) => [b.lat, 10 + 50 * (1 - p.oxy)]);
  // 챔피언이 레이저를 들고 있으면 앞 상대와 같은 줄로 가서 쏜다.
  const aim = L.pro && p.laser ? game.players.filter((q) => q !== p && q.wx > p.wx + 5 && q.wx < p.wx + 150).map((q) => q.lat) : [];
  const value = { boost: 30, rocket: 60, storm: 50 };
  let best = p.lat;
  let bestScore = -Infinity;
  for (let k = 0; k <= 20; k++) {
    const lat = 0.02 + k * 0.048;
    const lo = Math.min(lat, p.lat);
    const hi = Math.max(lat, p.lat);
    let score = -Math.abs(lat - p.lat) * 8 + Math.sin(p.ai.wander * 9 + lat * 5) * 0.5;
    // 방금 고른 줄을 조금 더 좋아해서, 사람처럼 한 방향으로 꾸준히 움직이고 이리저리 흔들리지 않는다.
    if (Math.abs(lat - p.tLat) < 0.03) score += 8;
    for (const it of items) if (Math.abs(it.lat - lat) < band) score += (value[it.type] ?? 20) * (1 - ((it.wx - p.wx) / L.look) * 0.5);
    for (const [bl, bv] of air) if (Math.abs(bl - lat) < band * 1.5) score += bv;
    for (const ql of aim) if (Math.abs(ql - lat) < 0.03) score += 35;
    for (const [dl, w, cost, dist, len] of danger) {
      if (Math.abs(dl - lat) < w) {
        score -= cost * (1 - 0.7 * clamp(dist / L.look, 0, 1));
      } else if (len > 0 && Math.abs(dl - p.lat) >= w && dl + w > lo && dl - w < hi) {
        // 가는 길목: 옆으로 옮기는 동안 그 장애물의 줄을 지나는 때(들어감~나감)에 장애물 옆을 달리고 있으면 뺀다.
        // 이미 그 위험 안에 있으면(날아오는 공격 등) 빠져나가는 길은 막지 않는다.
        const xIn = (Math.max(0, Math.abs(dl - p.lat) - w) / latSp) * speed - 3;
        const xOut = ((Math.abs(dl - p.lat) + w) / latSp) * speed + 3;
        if (xOut > dist && xIn < dist + len) score -= cost;
      }
    }
    if (score > bestScore) {
      best = lat;
      bestScore = score;
    }
  }
  return best;
}

// ---------- 코스 장애물 ----------

// 바다: 산소가 계속 줄고, 바닥나면 멈춰 있다가 조금 채워진 채로 다시 출발한다.
function breathe(p, dt) {
  if (p.gasp > 0) {
    p.gasp = Math.max(0, p.gasp - dt);
    if (p.gasp === 0) p.oxy = CONFIG.oxyRefill;
    return;
  }
  p.oxy = Math.max(0, p.oxy - dt / CONFIG.oxyTime);
  if (p.oxy > 0) return;
  p.gasp = CONFIG.oxyOut;
  p.mul = 0;
  game.fx.push({ kind: 'gasp', to: p.i, u: p.off, lat: p.lat, t: 0 });
  sfx('gasp');
}

const HAZARD_TIME = { slip: 'slipTime', freeze: 'freezeTime', dizzy: 'dizzyTime' };
const HAZARD_TEXT = { slip: '미끌!', freeze: '꽁꽁!', dizzy: '해롱~', gasp: '산소 부족!', bubble: '뽀글!' };
const HAZARD_COLOR = { slip: '#e8a100', freeze: '#2f7be0', dizzy: '#8e5bd0', gasp: '#e8433a', bubble: '#1fa9a0' };

function applyHazard(p, kind) {
  if (p.safe > 0 || p.shield > 0) return false;
  const time = CONFIG[HAZARD_TIME[kind]];
  p[kind] = time;
  p.safe = time + CONFIG.hazardSafe;
  if (kind === 'freeze') p.mul = 0;
  if (kind === 'slip') p.slipDir = Math.random() < 0.5 ? -1 : 1;
  if (kind === 'dizzy') resteer(p);
  game.fx.push({ kind, to: p.i, u: p.off, lat: p.lat, t: 0 });
  sfx(kind);
  return true;
}

function updateHazards(dt, v) {
  const hz = game.hazards;
  const kartX = (40 * v.s) / v.ppm;
  const kartLat = (16 * v.s) / v.rh;
  for (const p of game.players) {
    for (const pd of hz.puddles) {
      if (Math.abs(p.wx - pd.wx) < pd.len / 2 && Math.abs(p.lat - pd.lat) < pd.hl) applyHazard(p, 'freeze');
    }
    for (const sn of hz.snakes) {
      if (Math.abs(p.wx - sn.wx) < kartX && Math.abs(p.lat - snakePos(sn).lat) < kartLat + 0.06) applyHazard(p, 'dizzy');
    }
    for (const b of hz.bananas) {
      if (b.t < BANANA_FLY || b.gone) continue;
      if (Math.abs(p.wx - b.wx) < kartX && Math.abs(p.lat - b.lat) < kartLat) b.gone = applyHazard(p, 'slip');
    }
    for (const b of hz.bubbles) {
      if (b.gone || p.gasp > 0 || Math.abs(p.wx - b.wx) > kartX * 1.2 || Math.abs(p.lat - b.lat) > kartLat * 1.6) continue;
      b.gone = true;
      p.oxy = Math.min(1, p.oxy + CONFIG.oxyBubble);
      game.fx.push({ kind: 'bubble', to: p.i, u: p.off, lat: p.lat, t: 0 });
      sfx('bubble');
    }
  }
  hz.bubbles = hz.bubbles.filter((b) => !b.gone);

  // 정글: 원숭이가 가끔 어떤 카트 앞쪽 도로에 바나나 껍질을 던진다.
  if (hz.monkeys.length) {
    game.hazardT -= dt;
    if (game.hazardT <= 0) {
      game.hazardT = (2.4 + Math.random() * 2.4) / game.count;
      // 솔로 모드는 원숭이가 사람 쪽을 조금 더 자주 노린다.
      const p = game.solo && Math.random() < 0.3 ? game.players[0] : game.players[Math.floor(Math.random() * game.count)];
      const near = hz.monkeys.filter((m) => m.wx > p.wx + 14 && m.wx < p.wx + 45); // 원숭이 간격(최대 40m)보다 넓게 찾는다
      const m = near[Math.floor(Math.random() * near.length)];
      if (m) {
        m.tossAt = game.time;
        hz.bananas.push({ from: m.wx, wx: m.wx + (Math.random() - 0.5) * 4, lat: clamp(p.lat + (Math.random() - 0.5) * 0.5, 0.08, 0.92), t: 0, gone: false });
        sfx('toss');
      }
    }
  }
  const tail = Math.min(...game.players.map((p) => p.wx)) - 40;
  for (const b of hz.bananas) b.t += dt;
  hz.bananas = hz.bananas.filter((b) => !b.gone && b.wx > tail);
}
const BANANA_FLY = 0.6; // 바나나 껍질이 날아가 도로에 떨어지기까지

// 비추적 공격. 대상이 계속 전진하므로 예상 위치는 대상의 base에 상대적인 값(off, lat)으로 기록한다.
function fire(p, target) {
  if (!p.attack) return;
  if (target < 0) target = nearestAhead(p).i;
  p.attack = false;
  const t = game.players[target];
  game.shots.push({ from: p.i, to: target, u: t.off, v: t.lat, t: 0 });
  sfx('fire');
}

// 투사체의 출발점. 공격자가 대상 화면 밖이면 공격자가 있는 쪽 가장자리에서 들어온다.
function shotStart(s) {
  const from = game.players[s.from];
  const base = game.players[s.to].base;
  const lo = base - viewM() * CONFIG.offMin - 3;
  const hi = base + viewM() * (1 - CONFIG.offMin) + 3;
  return { wx: clamp(from.wx, lo, hi), lat: from.lat };
}

function resolveShot(s) {
  const p = game.players[s.to];
  const v = view();
  const onTarget = Math.abs(s.u - p.off) < (60 * v.s) / v.ppm && Math.abs(s.v - p.lat) < (26 * v.s) / v.rh;
  const hitNow = onTarget && p.protect <= 0 && p.shield <= 0;
  if (hitNow) {
    p.slow = CONFIG.slowTime;
    p.protect = CONFIG.protectTime;
    p.hitFx = 0.6;
  }
  game.fx.push({ kind: hitNow ? 'hit' : 'miss', to: s.to, u: s.u, lat: s.v, t: 0 });
  sfx(hitNow ? 'hit' : 'miss');
}

// 레이저는 쏜 자리에서 자기 줄(lat)을 따라 결승선 끝까지 곧게 날아간다. 그 줄에 있는 앞쪽 카트는 모두 맞는다.
// 쏜 순간 뒤에 있던 카트는 맞지 않는다.
function fireLaser(p) {
  if (!p.laser) return;
  p.laser = false;
  const passed = new Set(game.players.filter((q) => q.wx <= p.wx).map((q) => q.i));
  game.beams.push({ from: p.i, x0: p.wx, lat: p.lat, t: 0, passed });
  sfx('beam');
}

const beamFront = (b) => b.x0 + CONFIG.laserSpeed * b.t;

// 광선 앞머리가 카트를 지나는 순간 그 카트가 광선 줄에 있으면 맞는다.
function updateBeams(dt, v) {
  const band = (26 * v.s) / v.rh;
  for (const b of game.beams) {
    b.t += dt;
    const front = beamFront(b);
    for (const p of game.players) {
      if (b.passed.has(p.i) || p.wx > front) continue;
      b.passed.add(p.i);
      if (Math.abs(p.lat - b.lat) >= band || p.protect > 0 || p.shield > 0) continue;
      p.slow = CONFIG.slowTime;
      p.protect = CONFIG.protectTime;
      p.hitFx = 0.6;
      game.fx.push({ kind: 'hit', to: p.i, u: p.off, lat: p.lat, t: 0 });
      sfx('hit');
    }
  }
  game.beams = game.beams.filter((b) => beamFront(b) - CONFIG.laserLen < (b.end ?? CONFIG.raceLength) + 20);
}

function finish(winners) {
  game.state = 'win';
  game.winTimer = CONFIG.winShowTime;
  game.winners = winners.map((p) => p.i);
  for (const p of winners) game.wins[p.i]++;
  game.shots = [];
  game.beams = [];
  game.storms = [];
  releaseInput();
  sfx('win');
}

// ---------- 화면 전환 ----------

const SCREENS = ['title', 'select', 'level', 'course', 'ready', 'pause', 'result', 'confirm'];
let confirmBack = null;

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
}

function tap(id, fn) {
  $(id).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx('tap');
    fn();
  });
}

function updateSelect() {
  for (const b of $('counts').children) b.classList.toggle('on', Number(b.dataset.n) === game.selected);
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  $('phoneNote').classList.toggle('hidden', !(small && game.selected >= 3));
}

function updateLevel() {
  for (const b of $('levels').children) b.classList.toggle('on', b.dataset.l === game.level);
}

function updateCourse() {
  for (const b of $('courses').children) b.classList.toggle('on', b.dataset.c === game.course);
  $('courseNote').textContent = COURSES[game.course].tip;
}

function showResult() {
  game.state = 'result';
  const names = game.winners.map((i) => PLAYERS[i].name);
  $('resultTitle').textContent = names.join(' · ') + (names.length > 1 ? ' 공동 Win!' : ' Win!');
  $('resultTitle').style.color = PLAYERS[game.winners[0]].color;
  show('result');
}

// 시상대에 오를 순서. 인원수만큼(최대 6등) 나온다.
// 솔로 모드는 13명이라 상위 5명과, 순위 밖이면 사람 플레이어만 보여준다.
function standings() {
  const all = [...game.players]
    .sort((a, b) => b.wx - a.wx)
    .map((p) => ({ p, rank: rankOf(p), rec: p.wx >= CONFIG.raceLength ? '완주' : `${Math.floor(p.wx)}m` }));
  if (all.length <= 6) return all;
  return all.filter((e, k) => k < 5 || !e.p.ai);
}

function askTitle(from) {
  confirmBack = from;
  show('confirm');
}

tap('btnStart', () => {
  if (game.state !== 'title') return;
  game.state = 'select';
  updateSelect();
  show('select');
});

for (const b of $('counts').children) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx('tap');
    game.selected = Number(b.dataset.n);
    updateSelect();
  });
}

function showCourse() {
  game.state = 'course';
  updateCourse();
  show('course');
}

// 인원수 1은 솔로 모드: AI 12명과 대결하고, 코스 전에 AI 난이도를 고른다.
tap('btnSelect', () => {
  if (game.state !== 'select') return;
  game.solo = game.selected === 1;
  game.humans = game.selected;
  game.count = game.solo ? 1 + CONFIG.soloAI : game.selected;
  game.wins = Array(game.count).fill(0);
  if (!game.solo) return showCourse();
  game.state = 'level';
  updateLevel();
  show('level');
});

for (const b of $('levels').children) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx('tap');
    game.level = b.dataset.l;
    updateLevel();
  });
}

tap('btnLevel', () => {
  if (game.state === 'level') showCourse();
});

// 코스를 누르면 타이틀 배경이 그 코스로 바뀐다.
for (const b of $('courses').children) {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sfx('tap');
    game.course = b.dataset.c;
    updateCourse();
  });
}

tap('btnCourse', () => {
  if (game.state !== 'course') return;
  newRace();
  game.state = 'ready';
  $('courseName').textContent = COURSES[game.course].name;
  $('courseTip').textContent = COURSES[game.course].tip;
  $('modeTip').textContent = game.solo ? `솔로 모드: ${LEVELS[game.level].name} ${CONFIG.soloAI}명과 대결! 공격은 바로 앞 상대에게 날아가요.` : '';
  $('modeTip').classList.toggle('hidden', !game.solo);
  show('ready');
});

tap('btnGo', () => {
  if (game.state === 'ready') startCountdown();
});

// 복귀 시에는 항상 전체 재개 카운트다운을 거친다.
tap('btnResume', () => {
  if (game.state === 'paused') startCountdown();
});

// 여러 명이 동시에 눌러도 상태 확인으로 한 번만 처리된다.
tap('btnAgain', () => {
  if (game.state !== 'result') return;
  newRace();
  startCountdown();
});

tap('btnPauseTitle', () => askTitle('pause'));
tap('btnResultTitle', () => askTitle('result'));
tap('btnConfirmNo', () => show(confirmBack));
tap('btnConfirmYes', () => {
  game.state = 'title';
  game.wins = [];
  releaseInput();
  show('title');
});

// ---------- 입력 ----------

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// 해롱해롱(뱀)일 때는 앞뒤와 좌우가 모두 반대로 간다.
function steer(p, pad, x, y) {
  const inr = padInner(pad);
  const u = clamp((x - inr.x) / inr.w, 0, 1);
  const w = clamp((y - inr.y) / inr.h, 0, 1);
  const flip = p.dizzy > 0;
  p.tOff = (flip ? 1 - u : u) * OFF_MAX;
  p.tLat = flip ? 1 - w : w;
  p.aim = { x, y };
  p.touch = { u: clamp((x - pad.x) / pad.w, 0, 1), v: clamp((y - pad.y) / pad.h, 0, 1) };
}

// 손가락을 대고 있는 채로 해롱해롱이 걸리거나 풀리면 목표를 바로 다시 계산한다.
function resteer(p) {
  if (p.touch && p.aim) steer(p, game.layout.panels[p.i].pad, p.aim.x, p.aim.y);
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (game.state !== 'race' && game.state !== 'countdown') return;
  const { x, y } = pointerPos(e);
  if (hit(game.layout.pauseBtn, x, y)) {
    sfx('tap');
    return pause();
  }

  // 터치는 처음 닿은 패널에 귀속되고, 조향인지 공격인지도 이때 정해진다.
  const pi = game.layout.panels.findIndex((pan, i) => i < game.humans && hit(pan, x, y));
  if (pi < 0) return;
  const pan = game.layout.panels[pi];
  const p = game.players[pi];
  const btn = attackButtons(pan, pi).find((b) => hit(b, x, y));
  if (p.laser && hit(pan.btns, x, y)) {
    // 레이저를 가지고 있으면 버튼 줄 전체가 레이저 발사 버튼이 된다.
    if (game.state === 'race') fireLaser(p);
    game.pointers.set(e.pointerId, { player: pi, kind: 'attack' });
  } else if (btn) {
    if (game.state === 'race') fire(p, btn.target);
    game.pointers.set(e.pointerId, { player: pi, kind: 'attack' });
  } else if (hit(pan.pad, x, y)) {
    for (const [id, ptr] of game.pointers) {
      if (ptr.player === pi && ptr.kind === 'steer') game.pointers.delete(id);
    }
    game.pointers.set(e.pointerId, { player: pi, kind: 'steer' });
    steer(p, pan.pad, x, y);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const ptr = game.pointers.get(e.pointerId);
  if (!ptr || ptr.kind !== 'steer') return;
  const { x, y } = pointerPos(e);
  steer(game.players[ptr.player], game.layout.panels[ptr.player].pad, x, y);
});

function pointerEnd(e) {
  const ptr = game.pointers.get(e.pointerId);
  if (!ptr) return;
  game.pointers.delete(e.pointerId);
  // 손을 떼도 마지막 목표 위치와 자동 전진은 유지한다.
  if (ptr.kind === 'steer') game.players[ptr.player].touch = null;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  pause();
  updateEngine(); // 가려지면 프레임이 멈추므로 엔진음을 여기서 끈다
});
// iOS Safari는 viewport의 user-scalable=no를 무시하고, 빠른 연타에 확대하거나 여러 손가락에 핀치 확대·스크롤을 한다.
// 게임 입력은 모두 포인터 이벤트로 받으므로 터치 이벤트의 기본 동작은 전부 막는다. 터치 이벤트를 막아도
// 포인터 이벤트(멀티터치 포함)는 그대로 전달되고, 버튼도 pointerdown으로 동작하므로 click이 없어도 된다.
// 소리 잠금 해제(unlockAudio)는 위에서 touchend 리스너로 먼저 등록되어 있어 영향이 없다.
const blockDefault = (e) => {
  if (e.cancelable) e.preventDefault();
};
for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
  document.addEventListener(type, blockDefault, { passive: false, capture: true });
}
// Safari 전용 핀치 제스처 이벤트와 더블탭·길게 누르기·선택·끌기
for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(type, blockDefault, { passive: false, capture: true });
}
// 트랙패드·키보드를 붙인 iPad나 데스크톱의 확대(ctrl+휠, 핀치)
document.addEventListener('wheel', (e) => e.ctrlKey && blockDefault(e), { passive: false, capture: true });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) blockDefault(e);
});
window.addEventListener('resize', resize);

// ---------- 그리기: 캐릭터 ----------

function wheel(x, y, r, spin) {
  ctx.fillStyle = '#2f2f2f';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#bdbdbd';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.lineWidth = 1.5;
  line(x, y, x + Math.cos(spin) * r * 0.4, y + Math.sin(spin) * r * 0.4);
  ctx.restore();
}

function hand(x, y, r) {
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// 얼굴: ∧ ∧ 눈과 ω 입. 슬프면 물결 입과 눈물, 어지러우면 소용돌이 눈. fx는 얼굴 중심 x, hy는 머리 중심 y다.
function drawFace(fx, hy, sad, dizzy) {
  const t = game.time;
  ctx.lineWidth = 2.5;
  for (const ex of [fx - 8, fx + 10]) {
    ctx.beginPath();
    if (dizzy) {
      for (let a = 0; a < Math.PI * 4; a += 0.4) ctx.lineTo(ex + Math.cos(a + t * 8) * a * 0.55, hy - 4 + Math.sin(a + t * 8) * a * 0.55);
    } else {
      ctx.moveTo(ex - 5, hy + 1);
      ctx.lineTo(ex, hy - 9);
      ctx.lineTo(ex + 5, hy + 1);
    }
    ctx.stroke();
  }
  if (sad || dizzy) {
    ctx.beginPath();
    ctx.moveTo(fx - 4, hy + 13);
    ctx.quadraticCurveTo(fx - 1, hy + 8, fx + 2, hy + 12);
    ctx.quadraticCurveTo(fx + 5, hy + 15, fx + 8, hy + 11);
    ctx.stroke();
    ctx.fillStyle = '#4aa3f0';
    for (const [tx, ty] of [[fx - 9, hy + 8], [fx + 12, hy + 9]]) {
      ctx.beginPath();
      ctx.ellipse(tx, ty + Math.abs(Math.sin(t * 3)) * 3, 2.6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const mx of [fx - 3.5, fx + 5.5]) {
      ctx.beginPath();
      ctx.arc(mx, hy + 8, 4.5, 0, Math.PI);
      ctx.stroke();
    }
  }
}

// pose: 'drive' | 'win' | 'lose'. 원점은 바퀴 바닥 중앙, 오른쪽을 향한다.
// o.mul은 속도 배율이며 속도선·기울기에 쓰인다. o.tag는 머리 위 번호, o.me는 자기 카트 표식(▼)이다.
function drawKart(x, y, s, color, pose, o = {}) {
  const t = game.time;
  const moving = pose === 'drive';
  const mul = o.mul ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // 부스터 때 앞으로 기울고 감속 때 뒤로 처진다.
  if (moving) ctx.rotate(clamp((mul - 1) * 0.12, -0.06, 0.08));
  if (o.wobble) ctx.rotate(Math.sin(t * 30) * 0.14 * o.wobble);
  if (o.dizzy) ctx.rotate(Math.sin(t * 6) * 0.1);
  // 바나나에 미끄러지면 제자리에서 빙글빙글 돈다. 옆모습이므로 좌우를 뒤집어 도는 것처럼 보인다.
  if (o.slip) {
    ctx.translate(0, -50);
    ctx.scale(Math.cos(o.slip * Math.PI * 3), 1);
    ctx.rotate(Math.sin(o.slip * Math.PI * 6) * 0.15);
    ctx.translate(0, 50);
  }
  if (o.blink) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 40);
  ctx.lineWidth = 3;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = INK;

  ctx.fillStyle = 'rgba(43,38,34,.12)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 58, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (moving) {
    ctx.save();
    ctx.globalAlpha *= 0.35;
    ctx.lineWidth = 2.5;
    // 속도선의 개수와 길이는 속도 배율에 비례한다.
    for (let k = 0; k < Math.round(3 * mul); k++) {
      const off = ((t * 140 * mul + k * 17) % 30) - 15;
      const ly = -16 - (k % 3) * 13 - (k > 2 ? 6 : 0);
      line(-66 - off - k * 4, ly, -66 - off - k * 4 - 22 * mul, ly);
    }
    ctx.restore();
  }
  if (o.boost) {
    const f = Math.sin(t * 45) * 7;
    ctx.fillStyle = '#f6a21e';
    ctx.beginPath();
    ctx.moveTo(-50, -38);
    ctx.lineTo(-92 - f, -27);
    ctx.lineTo(-50, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(-50, -33);
    ctx.lineTo(-74 - f * 0.6, -27);
    ctx.lineTo(-50, -20);
    ctx.closePath();
    ctx.fill();
  }

  const spin = moving ? o.spin ?? t * 16 : 0;
  wheel(-20, -17, 11, spin);
  wheel(42, -17, 11, spin);

  ctx.translate(0, moving ? Math.sin(t * 20) * 1.2 : 0);
  const bounce = pose === 'win' ? Math.abs(Math.sin(t * 7)) * 5 : 0;
  const hx = pose === 'lose' ? 2 : -8;
  const hy = pose === 'lose' ? -92 : -100 - bounce;

  // 몸통
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-27, -40);
  ctx.quadraticCurveTo(-24, -72, hx - 7, hy + 24);
  ctx.lineTo(hx + 8, hy + 24);
  ctx.quadraticCurveTo(10, -66, 9, -40);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 운전대
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 4;
  line(31, -42, 27, -56);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(25, -60, 5, 13, 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 카트 몸체
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-54, -18);
  ctx.lineTo(-46, -44);
  ctx.lineTo(28, -42);
  ctx.lineTo(56, -24);
  ctx.lineTo(54, -13);
  ctx.lineTo(-52, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  line(-40, -37, 24, -35);
  ctx.restore();

  wheel(-30, -13, 13, spin);
  wheel(32, -13, 13, spin);

  // 머리
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(hx, hy, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawFace(hx + 5, hy, pose === 'lose' || o.gasp, o.dizzy);

  // 팔과 손
  ctx.lineWidth = 3;
  if (pose === 'win') {
    const hb = -bounce;
    for (const [sx, ex] of [[-20, -46], [4, 32]]) {
      ctx.beginPath();
      ctx.moveTo(sx, -70);
      ctx.quadraticCurveTo((sx + ex) / 2 + (ex < 0 ? -8 : 8), -92, ex, -116 + hb);
      ctx.stroke();
      hand(ex, -122 + hb, 9);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-8, -68);
    ctx.quadraticCurveTo(4, -50, 20, -58);
    ctx.stroke();
    hand(33, -57, 7);
    hand(22, -61, 8);
  }

  if (o.tag) {
    let ty = hy - 38;
    if (o.me) {
      ty = hy - 51 - Math.abs(Math.sin(t * 5)) * 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(hx - 8, ty + 11);
      ctx.lineTo(hx + 8, ty + 11);
      ctx.lineTo(hx, ty + 21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, ty, o.me ? 11 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(String(o.tag), hx, ty + 1, o.me ? 16 : 13, '#fff', 'center', INK);
    ctx.strokeStyle = INK;
  }

  if (o.slow || o.dizzy) {
    ctx.fillStyle = o.dizzy ? '#c89bff' : '#ffd84a';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const a = t * (o.dizzy ? 9 : 5) + (k * Math.PI * 2) / 3;
      spiky(hx + Math.cos(a) * 24, hy - 30 + Math.sin(a) * 6, 7, 3, 5, a);
      ctx.fill();
      ctx.stroke();
    }
  }
  // 산소가 바닥나 헐떡이는 모습: 머리 위로 물방울이 올라간다
  if (o.gasp) {
    ctx.strokeStyle = '#1fa9a0';
    ctx.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const q = (t * 1.5 + k / 3) % 1;
      ctx.beginPath();
      ctx.arc(hx + 30 + Math.sin(q * 6 + k) * 5, hy - 10 - q * 50, 4 + k * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
  }
  // 레이저 폭풍을 쓴 사람의 무적 보호막
  if (o.shield) {
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 12);
    ctx.fillStyle = '#e6d4ff';
    ctx.strokeStyle = '#8e5bd0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, (hy - 30) / 2, 76, (30 - hy) / 2 + 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  // 얼음 덩어리에 갇힌 모습
  if (o.frozen) {
    ctx.globalAlpha = 0.55;
    rr(-64, hy - 36, 128, 38 - hy, 10);
    ctx.fillStyle = '#bfe3ff';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4a9be0';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 4;
    line(-50, hy - 20, -34, hy - 4);
    line(-50, hy, -44, hy + 6);
  }
  ctx.restore();
}

// 시상대에 선 캐릭터. 원점은 발 아래 중앙이고 높이 약 150 단위다.
// pose: 'win'(두 팔 번쩍·왕관) | 'wave'(한 손 흔들기) | 'cry'(두 손으로 눈물 닦기)
function drawBuddy(x, y, s, color, pose) {
  const t = game.time;
  const jump = pose === 'win' ? Math.abs(Math.sin(t * 6)) * 8 : 0;
  ctx.save();
  ctx.translate(x, y - jump * s);
  ctx.scale(s, s);
  ctx.lineWidth = 3;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = INK;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.quadraticCurveTo(-26, -58, -10, -76);
  ctx.lineTo(10, -76);
  ctx.quadraticCurveTo(26, -58, 24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const hy = -100;
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(0, hy, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  drawFace(0, hy, pose === 'cry');

  ctx.lineWidth = 3;
  const arm = (sx, cx, cy, ex, ey, r = 8) => {
    ctx.beginPath();
    ctx.moveTo(sx, -62);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    hand(ex, ey, r);
  };
  if (pose === 'win') {
    arm(-14, -40, -80, -38, -138, 9);
    arm(14, 40, -80, 38, -138, 9);
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.moveTo(-18, hy - 22);
    for (const [cx, cy] of [[-18, -48], [-9, -34], [0, -52], [9, -34], [18, -48], [18, -22]]) ctx.lineTo(cx, hy + cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (pose === 'wave') {
    const a = Math.sin(t * 8) * 10;
    arm(-14, -30, -50, -30, -20);
    arm(14, 44, -80, 40 + a, -132);
  } else {
    arm(-14, -34, -70, -12, hy + 10);
    arm(14, 34, -70, 16, hy + 10);
  }
  ctx.restore();
}

// ---------- 그리기: 코스 ----------

function drawSign(x, roadTop, s, label, fill = SKY) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  line(x, roadTop, x, roadTop - 22 * s);
  rr(x - 32 * s, roadTop - 50 * s, 64 * s, 28 * s, 5 * s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  text(label, x, roadTop - 35 * s, 17 * s);
}

// 시차 배율로 흐르는 층에 gap 간격으로 놓인 요소를 그린다. 줌아웃 때 드러나는 가장자리까지 덮는다.
function eachTile(d, scroll, gap, fn) {
  const m = gap + d.w * 0.1;
  for (let k = Math.floor((scroll - m) / gap); k * gap - scroll < d.w + m; k++) fn(d.x + k * gap - scroll, k);
}

// 하늘(구름 ×0.1, 언덕·나무 ×0.5)과 도로(×1). cam은 카메라의 트랙 위 위치(m)다. 색과 모양은 코스를 따른다.
function drawRoad(d, s, roadTop, ppm, cam) {
  const T = COURSES[game.course];
  const course = game.course;
  const x0 = d.x - d.w * 0.1;
  const x1 = d.x + d.w * 1.1;
  const bottom = d.y + d.h;
  const px = cam * ppm;
  ctx.fillStyle = T.sky;
  ctx.fillRect(x0, d.y - d.h * 0.1, x1 - x0, d.h * 1.1);

  if (course === 'desert') {
    // 뜨거운 해
    const sx = d.x + d.w * 0.82;
    const sy = d.y + 34 * s;
    spiky(sx, sy, 30 * s, 20 * s, 12, game.time * 0.3);
    ctx.fillStyle = '#ffe9a3';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 17 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(43,38,34,.3)';
  ctx.lineWidth = Math.max(1, 2 * s);
  eachTile(d, px * 0.1, 210 * s, (cx, k) => {
    const cy = d.y + (20 + rnd(k) * 34) * s;
    if (course === 'sea') {
      // 구름 대신 헤엄치는 물고기
      const fx = cx + Math.sin(game.time + k) * 10 * s;
      ctx.beginPath();
      ctx.ellipse(fx, cy, 12 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.moveTo(fx - 12 * s, cy);
      ctx.lineTo(fx - 20 * s, cy - 6 * s);
      ctx.lineTo(fx - 20 * s, cy + 6 * s);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.arc(cx - 14 * s, cy, 10 * s, Math.PI * 0.9, Math.PI * 1.9);
    ctx.arc(cx, cy - 6 * s, 13 * s, Math.PI * 1.1, Math.PI * 1.95);
    ctx.arc(cx + 16 * s, cy, 10 * s, Math.PI * 1.2, Math.PI * 0.1);
    ctx.closePath();
    ctx.stroke();
  });

  // 먼 풍경: 언덕 / 정글 수풀 / 눈 덮인 산 / 모래 언덕
  ctx.strokeStyle = 'rgba(43,38,34,.45)';
  ctx.fillStyle = T.hill;
  eachTile(d, px * 0.5, 240 * s, (x, k) => {
    const w = (120 + rnd(k) * 70) * s;
    const h = (24 + rnd(k + 0.5) * 22) * s;
    ctx.beginPath();
    if (course === 'arctic') {
      ctx.moveTo(x - w, roadTop);
      ctx.lineTo(x, roadTop - h * 1.9);
      ctx.lineTo(x + w, roadTop);
    } else {
      ctx.ellipse(x, roadTop, w, course === 'jungle' ? h * 1.5 : h, 0, Math.PI, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  });

  // 가까운 풍경: 나무 / 야자수 / 눈 쌓인 전나무 / 선인장
  ctx.fillStyle = T.tree;
  eachTile(d, px * 0.5, 150 * s, (x, k) => {
    if (rnd(k * 1.7) < 0.35) return;
    const h = (24 + rnd(k * 2.3) * 14) * s;
    ctx.fillStyle = T.tree;
    if (course === 'sea') {
      // 물결치는 해초
      ctx.strokeStyle = T.tree;
      ctx.lineWidth = Math.max(2, 5 * s);
      ctx.beginPath();
      ctx.moveTo(x, roadTop);
      for (let k2 = 1; k2 <= 6; k2++) ctx.lineTo(x + Math.sin(game.time * 2 + k + k2) * 6 * s, roadTop - (h * 1.5 * k2) / 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(43,38,34,.45)';
      ctx.lineWidth = Math.max(1, 2 * s);
    } else if (course === 'jungle') {
      line(x, roadTop, x + 6 * s, roadTop - h * 1.6);
      for (const a of [-2.6, -2, -1.2, -0.5]) {
        ctx.beginPath();
        ctx.ellipse(x + 6 * s + Math.cos(a) * 14 * s, roadTop - h * 1.6 + Math.sin(a) * 6 * s, 16 * s, 6 * s, a + Math.PI / 2 + 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (course === 'arctic') {
      for (let k2 = 0; k2 < 3; k2++) {
        const ty = roadTop - k2 * h * 0.45;
        const tw = (18 - k2 * 4) * s;
        ctx.beginPath();
        ctx.moveTo(x - tw, ty);
        ctx.lineTo(x, ty - h * 0.7);
        ctx.lineTo(x + tw, ty);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (course === 'desert') {
      rr(x - 6 * s, roadTop - h * 1.3, 12 * s, h * 1.3, 6 * s);
      ctx.fill();
      ctx.stroke();
      for (const side of [-1, 1]) {
        const ay = roadTop - h * (side < 0 ? 0.7 : 0.9);
        ctx.beginPath();
        ctx.moveTo(x + side * 6 * s, ay);
        ctx.lineTo(x + side * 14 * s, ay);
        ctx.lineTo(x + side * 14 * s, ay - 12 * s);
        ctx.stroke();
      }
    } else {
      line(x, roadTop, x, roadTop - h);
      ctx.beginPath();
      ctx.arc(x, roadTop - h - 10 * s, 14 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  if (course === 'sea') {
    // 떠오르는 작은 물방울
    ctx.strokeStyle = 'rgba(31,169,160,.6)';
    ctx.lineWidth = 1;
    eachTile(d, px * 0.3, 70 * s, (x, k) => {
      const rise = roadTop - d.y;
      const y = roadTop - ((game.time * 25 * s + rnd(k) * rise) % rise);
      ctx.beginPath();
      ctx.arc(x + Math.sin(game.time * 3 + k) * 4 * s, y, 3 * s, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  if (course === 'arctic') {
    // 내리는 눈
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(74,155,224,.6)';
    ctx.lineWidth = 1;
    eachTile(d, px * 0.3, 55 * s, (x, k) => {
      const fall = roadTop - d.y;
      const y = d.y + ((game.time * 30 * s + rnd(k) * fall) % fall);
      ctx.beginPath();
      ctx.arc(x + Math.sin(game.time * 2 + k) * 6 * s, y, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.fillStyle = T.road;
  ctx.fillRect(x0, roadTop, x1 - x0, bottom - roadTop);

  // 연석: 줄무늬가 속도를 가장 잘 보여준다.
  const curb = 9 * s;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0, roadTop, x1 - x0, curb);
  ctx.fillStyle = T.curb;
  eachTile(d, px, 4 * ppm, (x) => ctx.fillRect(x, roadTop, 2 * ppm, curb));
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  line(x0, roadTop, x1, roadTop);
  line(x0, roadTop + curb, x1, roadTop + curb);

  ctx.strokeStyle = 'rgba(43,38,34,.5)';
  ctx.lineWidth = Math.max(1.5, 3 * s);
  ctx.setLineDash([2 * ppm, 2 * ppm]);
  ctx.lineDashOffset = (px - d.w * 0.1) % (4 * ppm);
  for (let k = 1; k <= 3; k++) {
    const y = roadTop + curb + ((bottom - roadTop - curb) * k) / 4;
    line(x0, y, x1, y);
  }
  ctx.setLineDash([]);
}

// 화면 맨 아래를 스치는 전경(×1.6): 울타리와 풀
function drawForeground(d, s, ppm, cam) {
  const bottom = d.y + d.h;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  line(d.x - d.w * 0.1, bottom - 7 * s, d.x + d.w * 1.1, bottom - 7 * s);
  eachTile(d, cam * ppm * 1.6, 150 * s, (x) => {
    ctx.fillStyle = '#e6d5ac';
    ctx.fillRect(x - 4 * s, bottom - 15 * s, 8 * s, 17 * s);
    ctx.strokeRect(x - 4 * s, bottom - 15 * s, 8 * s, 17 * s);
    ctx.strokeStyle = COURSES[game.course].grass;
    const gx = x + 75 * s;
    for (const a of [-6, 0, 6]) line(gx, bottom, gx + a * s, bottom - (a ? 10 : 14) * s);
    ctx.strokeStyle = INK;
  });
}

function drawItem(type, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s * 0.55); // 바닥에 놓인 칸처럼 납작하게
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  rr(-26, -26, 52, 52, 8);
  ctx.fillStyle = { boost: '#ffe9a3', attack: '#ffc9c2', laser: '#c9e8ff', rocket: '#ffe27a', storm: '#e6d4ff' }[type];
  ctx.fill();
  ctx.stroke();
  if (type === 'rocket') {
    // 반짝이는 특별 칸. 로켓은 칸 위에 떠 있다.
    ctx.strokeStyle = '#e8433a';
    ctx.lineWidth = 3 + Math.sin(game.time * 10) * 2;
    rr(-32, -32, 64, 64, 10);
    ctx.stroke();
    ctx.restore();
    drawRocket(x, y - (22 + Math.sin(game.time * 5) * 4) * s, s * 0.7, -Math.PI / 2, '#e8433a');
    return;
  }
  if (type === 'storm') {
    // 번쩍이는 테두리와 여러 줄의 광선
    ctx.strokeStyle = '#8e5bd0';
    ctx.lineWidth = 3 + Math.sin(game.time * 12) * 2;
    rr(-32, -32, 64, 64, 10);
    ctx.stroke();
    ctx.lineWidth = 4;
    for (const [ly, c] of [[-14, '#e8433a'], [-4, '#2f7be0'], [6, '#3fae5a'], [16, '#f2b91f']]) {
      ctx.strokeStyle = c;
      const off = ((game.time * 60 + ly * 3) % 20) - 10;
      line(-22 + off * 0.3, ly, 22 + off * 0.3, ly);
    }
    ctx.restore();
    spiky(x, y - (24 + Math.sin(game.time * 6) * 3) * s, 13 * s, 6 * s, 6, game.time * 3);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (type === 'laser') {
    // 광선 두 줄이 별에 부딪히는 모양
    ctx.strokeStyle = '#2f7be0';
    ctx.lineWidth = 4;
    line(-20, -6, 4, -6);
    line(-20, 6, 4, 6);
    spiky(12, 0, 12, 5, 7, game.time * 2);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
  } else if (type === 'boost') {
    ctx.strokeStyle = '#e8801a';
    ctx.lineWidth = 5;
    for (const ax of [-14, -2, 10]) {
      ctx.beginPath();
      ctx.moveTo(ax, -14);
      ctx.lineTo(ax + 10, 0);
      ctx.lineTo(ax, 14);
      ctx.stroke();
    }
  } else {
    spiky(0, 0, 20, 10, 8, game.time * 2);
    ctx.fillStyle = '#e8433a';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 로켓. (x, y)가 몸통 중심이고 ang 방향으로 날아간다. 길이 약 90 단위다.
function drawRocket(x, y, s, ang, color, label) {
  const t = game.time;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(s, s);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  const f = Math.sin(t * 50) * 6;
  ctx.fillStyle = '#f6a21e';
  ctx.beginPath();
  ctx.moveTo(-34, -9);
  ctx.lineTo(-62 - f, 0);
  ctx.lineTo(-34, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.moveTo(-34, -5);
  ctx.lineTo(-48 - f * 0.6, 0);
  ctx.lineTo(-34, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-22, side * 10);
    ctx.lineTo(-38, side * 24);
    ctx.lineTo(-36, side * 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-36, -12);
  ctx.lineTo(16, -12);
  ctx.quadraticCurveTo(40, -10, 44, 0);
  ctx.quadraticCurveTo(40, 10, 16, 12);
  ctx.lineTo(-36, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(18, -12);
  ctx.quadraticCurveTo(40, -10, 44, 0);
  ctx.quadraticCurveTo(40, 10, 18, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.rotate(Math.abs(ang) > Math.PI / 2 ? Math.PI : 0);
    text(label, -8, 1, 18, color, 'center', '#fff');
  }
  ctx.restore();
}

// 원숭이. 원점은 발 아래 중앙이다. 던지는 중이면 한 팔을 번쩍 든다.
function drawMonkey(x, y, s, tossing) {
  const t = game.time;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#9b6b43';
  ctx.beginPath();
  ctx.moveTo(14, -10);
  ctx.bezierCurveTo(34, -10, 34, -34, 24, -38);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -16, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const ay = tossing ? -64 : -24 + Math.sin(t * 4) * 2;
  ctx.beginPath();
  ctx.moveTo(-10, -22);
  ctx.lineTo(-18, ay);
  ctx.stroke();
  for (const ex of [-17, 17]) {
    ctx.beginPath();
    ctx.arc(ex, -44, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -42, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f2d3a6';
  ctx.beginPath();
  ctx.ellipse(0, -39, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  for (const ex of [-4, 4]) {
    ctx.beginPath();
    ctx.arc(ex, -43, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -37, 3.5, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

// 도로 위 바나나 껍질. 원점은 바닥 중앙이다.
function drawBanana(x, y, s, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffd84a';
  for (const a of [-0.9, 0, 0.9]) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(-8, -14, 0, -22);
    ctx.quadraticCurveTo(8, -14, 5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#8a6a2a';
  ctx.fillRect(-3, -4, 6, 5);
  ctx.restore();
}

// 산소 비눗방울. (x, y)는 도로 위 자리이고 살짝 떠서 흔들린다.
function drawBubble(x, y, s, k = 0) {
  const by = y - (22 + Math.sin(game.time * 3 + k) * 4) * s;
  const r = 13 * s;
  ctx.fillStyle = 'rgba(210,244,255,.55)';
  ctx.strokeStyle = '#1fa9a0';
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.beginPath();
  ctx.arc(x, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, by - r * 0.3, r * 0.4, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  text('O₂', x, by + s, 10 * s, '#1fa9a0');
}

// 물웅덩이. rx·ry는 화면 픽셀 반지름이다.
function drawPuddle(x, y, rx, ry, s) {
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#6cb8ec';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.8)';
  ctx.lineWidth = Math.max(1, 2 * s);
  const q = (game.time * 0.8) % 1;
  ctx.globalAlpha = 1 - q;
  ctx.beginPath();
  ctx.ellipse(x, y, rx * (0.2 + q * 0.6), ry * (0.2 + q * 0.6), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.4, y - ry * 0.35, rx * 0.25, ry * 0.18, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

// 뱀. (x, y)는 머리이고 몸은 dir 반대쪽(세로)으로 꿈틀대며 이어진다.
function drawSnake(x, y, s, dir, moving) {
  const t = game.time;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = ctx.lineCap = 'round';
  const wig = moving ? 14 : 6;
  const pts = [];
  for (let k = 0; k <= 12; k++) pts.push([Math.sin(k * 0.9 - t * (moving ? 18 : 5)) * wig * (k / 12 + 0.2), -dir * k * 6]);
  const body = () => {
    ctx.beginPath();
    pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  };
  ctx.strokeStyle = INK;
  ctx.lineWidth = 17;
  body();
  ctx.stroke();
  ctx.strokeStyle = '#7cb342';
  ctx.lineWidth = 12;
  body();
  ctx.stroke();
  ctx.strokeStyle = '#c5e1a5';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 8]);
  body();
  ctx.stroke();
  ctx.setLineDash([]);
  // 머리와 혀
  ctx.strokeStyle = '#e8433a';
  ctx.lineWidth = 2;
  if (Math.sin(t * 12) > 0) {
    line(0, dir * 10, -3, dir * 18);
    line(0, dir * 10, 3, dir * 18);
  }
  ctx.fillStyle = '#7cb342';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, dir * 2, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  for (const ex of [-5, 5]) {
    ctx.beginPath();
    ctx.arc(ex, dir * 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(x, y, s, color) {
  ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.strokeStyle = INK;
  ctx.fillStyle = color;
  spiky(x, y, 15 * s, 8 * s, 8, game.time * 12);
  ctx.fill();
  ctx.stroke();
}

// 패널은 자기 카트(me)를 따라가는 카메라이고, 시야 안의 월드를 모두 그린다.
function drawDrive(d, me) {
  const P = PLAYERS[me.i];
  const v = view(me.i);
  const { s, ppm, rh } = v;
  const cam = me.base - me.lag;
  const bottom = d.y + d.h;
  const roadTop = v.y0 - 40 * s;
  const xOf = (m) => v.anchor + (m - cam) * ppm;
  const yOf = (lat) => v.y0 + lat * rh;
  // 부스터 때 도로 아래쪽을 기준으로 살짝 줌아웃한다. zx는 줌이 적용된 화면 x다.
  const rush = clamp(me.lag / LAG_MAX, 0, 1);
  const z = 1 - CONFIG.boostZoom * rush;
  const pivotX = d.x + d.w * 0.35;
  const zx = (x) => pivotX + (x - pivotX) * z;
  const onScreen = (x) => zx(x) > d.x - 80 * s && zx(x) < d.x + d.w + 80 * s;
  const ended = game.state === 'win' || game.state === 'result';
  const fs = clamp(d.h * 0.09, 12, 24);

  ctx.save();
  ctx.beginPath();
  ctx.rect(d.x, d.y, d.w, d.h);
  ctx.clip();
  ctx.lineJoin = ctx.lineCap = 'round';

  ctx.save();
  ctx.translate(pivotX, bottom);
  ctx.scale(z, z);
  ctx.translate(-pivotX, -bottom);

  drawRoad(d, s, roadTop, ppm, cam);

  // 출발선, 거리 표지판, 결승선. 선은 카트 앞코가 닿는 자리에 있다.
  const sx = xOf(0) + NOSE * s;
  if (onScreen(sx)) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * s;
    line(sx, roadTop, sx, bottom);
  }
  for (let m = 100; m < CONFIG.raceLength; m += 100) {
    if (onScreen(xOf(m))) drawSign(xOf(m), roadTop, s, `${m}m`);
  }
  const gx = xOf(CONFIG.raceLength) + NOSE * s;
  if (onScreen(gx)) {
    const q = 9 * s;
    for (let row = 0; roadTop + row * q < bottom; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? INK : '#fff';
        ctx.fillRect(gx + col * q, roadTop + row * q, q, q);
      }
    }
    drawSign(gx + q, roadTop, s, 'GOAL', '#ffe27a');
  }

  // 코스 장애물: 길가의 원숭이, 도로 위의 물웅덩이·바나나 껍질·뱀
  const hz = game.hazards;
  for (const m of hz.monkeys) {
    if (onScreen(xOf(m.wx))) drawMonkey(xOf(m.wx), roadTop + 4 * s, s * 0.9, game.time - m.tossAt < 0.35);
  }
  for (const pd of hz.puddles) {
    if (onScreen(xOf(pd.wx))) drawPuddle(xOf(pd.wx), yOf(pd.lat), (pd.len / 2) * ppm, pd.hl * rh, s);
  }
  for (const b of hz.bananas) {
    if (b.t >= BANANA_FLY && onScreen(xOf(b.wx))) drawBanana(xOf(b.wx), yOf(b.lat), s);
  }
  hz.bubbles.forEach((b, k) => onScreen(xOf(b.wx)) && drawBubble(xOf(b.wx), yOf(b.lat), s, k));
  for (const sn of hz.snakes) {
    const x = xOf(sn.wx);
    if (!onScreen(x)) continue;
    const sp = snakePos(sn);
    drawSnake(x, yOf(sp.lat), s, sp.dir, sp.moving);
  }

  for (const item of game.items) {
    if (item.takenBy !== null) continue;
    const ix = xOf(item.wx);
    if (!onScreen(ix)) continue;
    // 내가 얻을 수 없는 칸은 흐리게 보인다.
    ctx.globalAlpha = canTake(me, item) ? 1 : 0.3;
    drawItem(item.type, ix, yOf(item.lat), s);
    ctx.globalAlpha = 1;
  }

  // 조향 목표 위치
  if (me.touch) {
    ctx.strokeStyle = P.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.ellipse(xOf(me.base + me.tOff), yOf(me.tLat), 30 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 날아가는 공격의 충돌 예상 위치. 누구를 노린 것이든 시야에 들어오면 보인다.
  for (const sh of game.shots) {
    const ix = xOf(game.players[sh.to].base + sh.u);
    if (!onScreen(ix)) continue;
    const q = sh.t / CONFIG.warnTime;
    ctx.strokeStyle = PLAYERS[sh.from].color;
    ctx.fillStyle = 'rgba(232,67,58,.18)';
    ctx.lineWidth = 3 * s;
    ctx.setLineDash([8 * s, 6 * s]);
    ctx.beginPath();
    ctx.ellipse(ix, yOf(sh.v), (95 - 35 * q) * s, (34 - 8 * q) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 바퀴 뒤 먼지. 트랙에 남으므로 속도만큼 빠르게 뒤로 흐른다.
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  for (const m of game.dust) {
    const x = xOf(m.wx);
    if (!onScreen(x)) continue;
    const q = m.t / m.life;
    ctx.globalAlpha = 0.5 * (1 - q);
    ctx.beginPath();
    ctx.arc(x, yOf(m.lat) - (6 + q * 10) * s, (4 + q * 9) * m.size * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 모든 카트를 같은 크기로, 도로 위쪽(lat이 작은 쪽)부터 그린다.
  for (const q of [...game.players].sort((a, b) => a.lat - b.lat)) {
    const k = kartPx(me, q);
    if (!onScreen(k.x)) continue;
    const pose = ended ? (game.winners.includes(q.i) ? 'win' : 'lose') : 'drive';
    drawKart(k.x, k.y, s, PLAYERS[q.i].color, pose, {
      boost: q.boost > 0, slow: q.slow > 0, wobble: q.hitFx / 0.6, blink: q.protect > 0,
      mul: q.mul, spin: q.spin, tag: q.i + 1, me: q === me,
      slip: q.slip > 0 && CONFIG.slipTime - q.slip, frozen: q.freeze > 0, dizzy: q.dizzy > 0, shield: q.shield > 0, gasp: q.gasp > 0,
    });
  }

  // 원숭이가 던진 바나나 껍질이 포물선을 그리며 날아간다.
  for (const b of hz.bananas) {
    if (b.t >= BANANA_FLY) continue;
    const q = b.t / BANANA_FLY;
    const x = xOf(b.from + (b.wx - b.from) * q);
    const y = roadTop - 40 * s + (yOf(b.lat) - roadTop + 40 * s) * q - Math.sin(q * Math.PI) * 70 * s;
    if (onScreen(x)) drawBanana(x, y, s, b.t * 14);
  }

  // 컷신 끝무렵 로켓이 이 화면에 보이는 상대 카트마다 위에서 내리꽂힌다.
  if (game.cut && game.cut.t > CONFIG.cutShow) {
    const q = Math.min(1, (game.cut.t - CONFIG.cutShow) / CONFIG.cutFly) ** 2;
    for (const p of game.players) {
      if (p.i === game.cut.by) continue;
      const k = kartPx(me, p);
      if (!onScreen(k.x)) continue;
      const tx = k.x;
      const ty = k.y - 60 * s;
      const fx0 = tx - d.w * 0.45;
      const fy0 = d.y - 60 * s;
      drawRocket(fx0 + (tx - fx0) * q, fy0 + (ty - fy0) * q, s * 0.9, Math.atan2(ty - fy0, tx - fx0), PLAYERS[game.cut.by].color, String(p.i + 1));
    }
  }

  for (const sh of game.shots) {
    const from = shotStart(sh);
    const q = (sh.t / CONFIG.warnTime) ** 2;
    const x = xOf(from.wx + (game.players[sh.to].base + sh.u - from.wx) * q);
    const y = yOf(from.lat + (sh.v - from.lat) * q) - 30 * s;
    if (onScreen(x)) drawProjectile(x, y, s, PLAYERS[sh.from].color);
  }

  // 레이저 광선: 쏜 사람 색의 굵은 빛줄기와 흰 심지
  for (const b of game.beams) {
    const front = beamFront(b);
    const x0 = xOf(Math.max(b.x0, front - CONFIG.laserLen));
    const x1 = xOf(front);
    if (zx(x1) < d.x - 80 * s || zx(x0) > d.x + d.w + 80 * s) continue;
    const y = yOf(b.lat) - 30 * s;
    ctx.strokeStyle = PLAYERS[b.from].color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 18 * s;
    line(x0, y, x1, y);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 8 * s;
    line(x0, y, x1, y);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3 * s;
    line(x0, y, x1, y);
    spiky(x1, y, 16 * s, 7 * s, 8, game.time * 20);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.fill();
    ctx.stroke();
  }

  for (const f of game.fx) {
    const ix = xOf(f.to === undefined ? f.wx : game.players[f.to].base + f.u);
    if (!onScreen(ix)) continue;
    const iy = yOf(f.lat) - 30 * s;
    ctx.globalAlpha = 1 - f.t / 0.5;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * s;
    if (f.kind === 'hit') {
      spiky(ix, iy, (40 + f.t * 60) * s, (22 + f.t * 30) * s, 10, 0.3);
      ctx.fillStyle = '#ffd84a';
      ctx.fill();
      ctx.stroke();
      text('쾅!', ix, iy, 28 * s, '#e8433a');
    } else if (f.kind === 'miss') {
      text('휙~', ix, iy - f.t * 40 * s, 24 * s, 'rgba(43,38,34,.7)');
    } else if (HAZARD_TEXT[f.kind]) {
      text(HAZARD_TEXT[f.kind], ix, iy - 30 * s - f.t * 40 * s, 26 * s, HAZARD_COLOR[f.kind], 'center', '#fff');
    } else if (f.kind === 'pick') {
      // 가져간 카트의 색으로 퍼지는 고리
      ctx.strokeStyle = PLAYERS[f.by].color;
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      ctx.ellipse(ix, yOf(f.lat), (30 + f.t * 110) * s, (16 + f.t * 60) * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      spiky(ix, iy + 10 * s, (14 + f.t * 30) * s, (7 + f.t * 14) * s, 6, 0.2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      text('툭', ix, iy - 14 * s, 20 * s, INK, 'center', SKY);
    }
    ctx.globalAlpha = 1;
  }

  drawForeground(d, s, ppm, cam);
  ctx.restore();

  // 부스터 때 화면 위아래 가장자리를 스치는 가로 줄무늬
  if (rush > 0.05 && !ended) {
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.3 * rush;
    ctx.lineWidth = 2.5 * s;
    for (let k = 0; k < 8; k++) {
      const x = d.x + d.w * 1.3 - ((game.time * d.w * 2.2 + rnd(k) * d.w * 1.6) % (d.w * 1.6));
      const y = k < 4 ? d.y + (8 + k * 11) * s : bottom - (8 + (k - 4) * 11) * s;
      line(x, y, x + d.w * 0.28 * rush, y);
    }
    ctx.globalAlpha = 1;
  }

  const es = clamp(d.h * 0.075, 10, 20);
  const meX = zx(kartPx(me, me).x);
  for (const sh of game.shots) {
    const from = game.players[sh.from];
    const to = game.players[sh.to];
    if (sh.to === me.i && Math.sin(game.time * 25) > -0.3) {
      // 경고는 공격자가 있는 쪽(뒤면 왼쪽, 앞이면 오른쪽)에 띄운다.
      const wx = from.wx < me.wx ? d.x + es * 6 + 24 * s : d.x + d.w - es * 6 - 24 * s;
      const wy = clamp(yOf(from.lat) - 40 * s, d.y + fs * 2 + 22 * s, bottom - 24 * s);
      spiky(wx, wy, 20 * s, 13 * s, 8);
      ctx.fillStyle = '#ffe27a';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, 2.5 * s);
      ctx.stroke();
      text('!', wx, wy + s, 24 * s, '#e8433a');
    }
    // 대상이 시야 밖이면 내 화면에서는 대상 쪽 가장자리로 날아가는 모습만 보인다.
    if (sh.from === me.i && sh.t <= 0.35 && !onScreen(xOf(to.wx))) {
      const q = sh.t / 0.35;
      const y0 = yOf(me.lat) - 60 * s;
      const x1 = to.wx > me.wx ? d.x + d.w + 30 * s : d.x - 30 * s;
      drawProjectile(meX + (x1 - meX) * q, y0 + (yOf(to.lat) - 30 * s - y0) * q, s, P.color);
    }
  }

  // 뒤에서 내 쪽으로 오는 레이저 경고. 광선 줄 높이의 왼쪽 가장자리에 띄운다.
  for (const b of game.beams) {
    const gap = me.wx - beamFront(b);
    if (b.passed.has(me.i) || gap < 0 || gap > 80 || Math.sin(game.time * 25) <= -0.3) continue;
    const wx = d.x + es * 6 + 24 * s;
    const wy = clamp(yOf(b.lat) - 30 * s, d.y + fs * 2 + 22 * s, bottom - 24 * s);
    spiky(wx, wy, 20 * s, 13 * s, 8);
    ctx.fillStyle = '#c9e8ff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.stroke();
    text('!', wx, wy + s, 24 * s, '#2f7be0');
  }

  // 시야 밖 상대: 있는 쪽 가장자리에 번호와 거리 차를 보여준다.
  const lastY = { '-1': 0, 1: 0 };
  for (const q of [...game.players].sort((a, b) => a.lat - b.lat)) {
    const kx = zx(kartPx(me, q).x);
    const side = kx < d.x - 62 * s * z ? -1 : kx > d.x + d.w + 62 * s * z ? 1 : 0;
    if (!side) continue;
    const y = Math.max(clamp(yOf(q.lat) - 30 * s, d.y + fs * 2.4, bottom - es), lastY[side] + es * 1.5);
    if (y > bottom - es * 0.5) continue; // 솔로 모드처럼 많으면 넘치는 표시는 생략한다
    lastY[side] = y;
    const ex = side < 0 ? d.x + 4 : d.x + d.w - 4;
    const align = side < 0 ? 'left' : 'right';
    text(side < 0 ? '◀' : '▶', ex, y, es * 0.9, INK, align, SKY);
    ctx.fillStyle = PLAYERS[q.i].color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex - side * es * 1.7, y, es * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(String(q.i + 1), ex - side * es * 1.7, y + 1, es * 0.9, '#fff', 'center', INK);
    text(`${Math.round(Math.abs(q.wx - me.wx))}m`, ex - side * es * 2.6, y, es, INK, align, SKY);
  }

  // 패널 HUD
  const hudX = d.x + 6;
  ctx.fillStyle = P.color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hudX + fs * 0.7, d.y + fs * 0.9, fs * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  text(String(me.i + 1), hudX + fs * 0.7, d.y + fs * 0.95, fs, '#fff', 'center', INK);
  text(`${P.name} ${rankOf(me)}위`, hudX + fs * 1.7, d.y + fs * 0.95, fs, INK, 'left', SKY);
  text(`${Math.floor(Math.min(me.wx, CONFIG.raceLength))}m`, d.x + d.w - 6, d.y + fs * 0.95, fs, INK, 'right', SKY);
  const status = [
    me.boost > 0 && ['부스터!', '#e8801a'],
    me.slow > 0 && [`감속 ${me.slow.toFixed(1)}s`, '#2f7be0'],
    me.slip > 0 && [`미끌미끌 ${me.slip.toFixed(1)}s`, '#e8a100'],
    me.freeze > 0 && [`꽁꽁 ${me.freeze.toFixed(1)}s`, '#2f7be0'],
    me.dizzy > 0 && [`해롱해롱 ${me.dizzy.toFixed(1)}s`, '#8e5bd0'],
    me.shield > 0 && [`무적 ${me.shield.toFixed(1)}s`, '#8e5bd0'],
    me.gasp > 0 && [`산소 부족 ${me.gasp.toFixed(1)}s`, '#e8433a'],
  ].filter(Boolean);
  status.forEach(([label, color], k) => text(label, d.x + d.w - 6, d.y + fs * (2.1 + k * 1.1), fs * 0.9, color, 'right', SKY));

  // 바다: 이름 아래 산소 게이지
  if (game.course === 'sea') {
    const gx = hudX;
    const gy = d.y + fs * 1.85;
    const gw = fs * 6;
    const gh = fs * 0.55;
    text('O₂', gx, gy + gh / 2, fs * 0.7, '#1fa9a0', 'left', SKY);
    rr(gx + fs * 1.3, gy, gw, gh, gh / 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    const low = me.oxy < 0.25 && !me.gasp;
    if (me.oxy > 0) {
      rr(gx + fs * 1.3, gy, Math.max(gh, gw * me.oxy), gh, gh / 2);
      ctx.fillStyle = me.gasp > 0 ? '#bbb' : low && Math.sin(game.time * 12) > 0 ? '#e8433a' : me.oxy < 0.25 ? '#f08a2e' : '#1fa9a0';
      ctx.fill();
    }
    rr(gx + fs * 1.3, gy, gw, gh, gh / 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (ended) {
    const won = game.winners.includes(me.i);
    text(`${P.name} ${won ? 'Win!' : 'Lose…'}`, d.x + d.w / 2, d.y + d.h * 0.17,
      clamp(Math.min(d.h * 0.2, d.w * 0.085), 16, 64), won ? P.color : '#8a8378', 'center', SKY);
  }
  ctx.restore();
}

// ---------- 그리기: 조작 공간 ----------

// 레이저를 가지고 있으면 버튼 줄 전체가 레이저 발사 버튼이다.
function drawLaserButton(b) {
  const armed = game.state === 'race';
  rr(b.x, b.y + 2, b.w, b.h - 4, 10);
  ctx.fillStyle = '#c9e8ff';
  ctx.fill();
  ctx.strokeStyle = armed ? INK : 'rgba(43,38,34,.3)';
  ctx.lineWidth = 2 + (armed ? 1.5 + Math.sin(game.time * 10) * 1.5 : 0);
  ctx.stroke();
  drawItem('laser', b.x + b.h * 0.85, b.y + b.h / 2, (b.h * 0.8) / 52 / 0.55);
  text('레이저 발사!', b.x + b.w / 2 + b.h * 0.4, b.y + b.h / 2 + 1, Math.min(b.h * 0.5, b.w * 0.09), '#2f7be0', 'center', '#fff');
}

function drawButtons(pan, p) {
  if (p.laser) return drawLaserButton(pan.btns);
  const b = pan.btns;
  const armed = p.attack && game.state === 'race';
  const cx = b.x + b.h * 0.55;
  const cy = b.y + b.h / 2;
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.attack ? INK : 'rgba(43,38,34,.3)';
  spiky(cx, cy, b.h * 0.42, b.h * 0.22, 8, p.attack ? game.time * 2 : 0);
  ctx.fillStyle = p.attack ? '#e8433a' : 'rgba(43,38,34,.06)';
  ctx.fill();
  ctx.stroke();

  for (const btn of attackButtons(pan, p.i)) {
    const pulse = armed ? 1.5 + Math.sin(game.time * 10) * 1.5 : 0;
    rr(btn.x, btn.y + 2, btn.w, btn.h - 4, 10);
    ctx.globalAlpha = armed ? 1 : 0.25;
    ctx.fillStyle = btn.target < 0 ? '#e8433a' : PLAYERS[btn.target].color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = armed ? INK : 'rgba(43,38,34,.3)';
    ctx.lineWidth = 2 + pulse;
    ctx.stroke();
    const label = btn.target < 0 ? `바로 앞 ${nearestAhead(p).i + 1}번에게 공격!` : String(btn.target + 1);
    const fs = btn.target < 0 ? Math.min(btn.h * 0.45, btn.w * 0.06) : Math.min(btn.h * 0.55, btn.w * 0.5);
    text(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, fs,
      armed ? '#fff' : 'rgba(43,38,34,.45)', 'center', armed ? INK : undefined);
  }
}

function drawPad(pan, p) {
  const pad = pan.pad;
  const P = PLAYERS[p.i];
  rr(pad.x, pad.y, pad.w, pad.h, 12);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = P.color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = P.color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.45;
  text(`${P.name} 터치 화면`, pad.x + pad.w / 2, pad.y + pad.h / 2, clamp(pad.h * 0.16, 12, 30), P.color);
  ctx.globalAlpha = 1;
  const lock = p.gasp > 0 ? '산소 부족! 3초 동안 멈춰요' : p.freeze > 0 ? '꽁꽁! 움직일 수 없어요' : p.slip > 0 ? '미끌! 움직일 수 없어요' : p.dizzy > 0 ? '해롱해롱~ 조작이 반대로!' : '';
  if (lock) text(lock, pad.x + pad.w / 2, pad.y + pad.h * 0.22, clamp(pad.h * 0.14, 11, 24), p.dizzy > 0 ? '#8e5bd0' : '#2f7be0', 'center', '#fff');

  // 주행 영역 속 카트 위치를 조작 공간에 대응시켜 보여준다.
  const inr = padInner(pad);
  ctx.fillStyle = P.color;
  ctx.beginPath();
  ctx.arc(inr.x + (p.off / OFF_MAX) * inr.w, inr.y + p.lat * inr.h, 5, 0, Math.PI * 2);
  ctx.fill();

  if (p.touch) {
    const tx = pad.x + p.touch.u * pad.w;
    const ty = pad.y + p.touch.v * pad.h;
    const rad = clamp(pad.h * 0.2, 18, 40);
    ctx.beginPath();
    ctx.arc(tx, ty, rad, 0, Math.PI * 2);
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.color;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function drawHelpCell(pan) {
  rr(pan.x, pan.y, pan.w, pan.h, 12);
  ctx.strokeStyle = 'rgba(43,38,34,.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  const lines = ['조작 안내', '터치 화면에 손가락 → 카트 이동', '≫ 부스터: 빨라져요 (1등은 못 먹어요)', '✸ 공격 칸 → 상대 번호 터치', '레이저 칸 → 레이저 발사! 앞쪽 끝까지',
    '레이저 폭풍 → 무작위 레이저, 나는 무적', '로켓 → 상대 모두에게 발사!', COURSES[game.course].hint];
  const fs = clamp(Math.min(pan.h / (lines.length * 1.8), pan.w * 0.055), 10, 24);
  lines.forEach((ln, k) => {
    text(ln, pan.x + pan.w / 2, pan.y + pan.h / 2 + (k - (lines.length - 1) / 2) * fs * 1.6, k ? fs : fs * 1.3, k ? 'rgba(43,38,34,.75)' : INK);
  });
}

// ---------- 그리기: 공통 ----------

function drawBar() {
  const { barH, pauseBtn } = game.layout;
  const x0 = 40;
  const x1 = pauseBtn.x - 84;
  const y = barH / 2;
  const fs = barH * 0.36;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  line(x0, y, x1, y);
  ctx.lineWidth = 1.5;
  for (let m = 0; m <= 10; m++) {
    const x = x0 + ((x1 - x0) * m) / 10;
    line(x, y - 5, x, y + 5);
  }
  text('0m', x0 - 20, y, fs);
  text(`${CONFIG.raceLength}m`, x1 + 48, y, fs);

  const order = [...game.players].sort((a, b) => a.wx - b.wx);
  for (const p of order) {
    const x = x0 + (x1 - x0) * clamp(p.wx / CONFIG.raceLength, 0, 1);
    ctx.fillStyle = PLAYERS[p.i].color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, barH * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    text(String(p.i + 1), x, y + 1, barH * 0.42, '#fff', 'center', INK);
  }

  if (game.state === 'race' || game.state === 'countdown') {
    rr(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h, 8);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 4;
    const cx = pauseBtn.x + pauseBtn.w / 2;
    const cy = pauseBtn.y + pauseBtn.h / 2;
    line(cx - 5, cy - 7, cx - 5, cy + 7);
    line(cx + 5, cy - 7, cx + 5, cy + 7);
  }
}

function drawCenterCall(label) {
  const r = Math.min(W, H) * 0.13;
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  text(label, W / 2, H / 2 + r * 0.05, label.length > 1 ? r * 0.7 : r * 1.3, '#e8433a');
}

function drawRaceScreen() {
  drawBar();
  game.layout.panels.forEach((pan, i) => {
    if (i >= game.humans) return drawHelpCell(pan);
    const p = game.players[i];
    rr(pan.x, pan.y, pan.w, pan.h, 12);
    ctx.fillStyle = SKY;
    ctx.fill();
    drawDrive(pan.drive, p);
    drawButtons(pan, p);
    drawPad(pan, p);
    rr(pan.x, pan.y, pan.w, pan.h, 12);
    ctx.strokeStyle = PLAYERS[i].color;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
  if (game.state === 'countdown') drawCenterCall(String(Math.ceil(game.countdown)));
  else if (game.state === 'race' && game.goFlash > 0) drawCenterCall('출발!');
  else if (game.state === 'cutscene') drawCutscene();
  if (game.banner && game.state === 'race') drawBanner(game.banner);
}

// 모든 화면 위쪽 가운데에 잠깐 뜨는 알림(레이저 폭풍)
function drawBanner(b) {
  const fs = clamp(Math.min(W * 0.045, H * 0.07), 18, 44);
  const y = game.layout.barH + fs * 1.2;
  ctx.globalAlpha = Math.min(1, (2 - b.t) / 0.3);
  ctx.font = `${fs}px ${FONT}`;
  const w = ctx.measureText(b.text).width + fs * 1.6;
  rr(W / 2 - w / 2, y - fs * 0.8, w, fs * 1.6, fs * 0.4);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 4;
  ctx.stroke();
  text(b.text, W / 2, y, fs * (1 + Math.max(0, 0.2 - b.t)), b.color, 'center', '#fff');
  ctx.globalAlpha = 1;
}

// 로켓 컷신: 모든 화면을 덮고, 로켓을 얻은 카트가 상대 수만큼 로켓을 쏘아 올린다.
function drawCutscene() {
  const t = game.cut.t;
  if (t > CONFIG.cutShow) return;
  const by = game.cut.by;
  const P = PLAYERS[by];
  const a = Math.min(1, t / 0.2, (CONFIG.cutShow - t) / 0.3);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(30,24,40,.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = ctx.lineCap = 'round';

  // 뒤에서 도는 집중선
  const cx = W * 0.3;
  const cy = H * 0.62;
  ctx.fillStyle = P.color;
  ctx.globalAlpha = a * 0.5;
  spiky(cx, cy, Math.max(W, H) * 0.5, Math.min(W, H) * 0.18, 18, t * 0.8);
  ctx.fill();
  ctx.globalAlpha = a;

  const ks = Math.min((H * 0.36) / 136, (W * 0.26) / 116);
  const shake = t < 0.5 ? 0 : Math.sin(t * 60) * 3;
  drawKart(cx + shake, cy + 60 * ks, ks, P.color, 'win', { boost: true, tag: by + 1 });

  // 상대 수만큼 로켓이 차례로 오른쪽 위로 솟아오른다.
  const foes = game.players.filter((p) => p.i !== by);
  const rs = ks * 0.9;
  foes.forEach((p, k) => {
    const q = clamp((t - 0.45 - k * 0.12) / 0.9, 0, 1);
    if (q <= 0) return;
    const e = q * q;
    const x0 = cx + 40 * ks;
    const y0 = cy - 40 * ks;
    const x1 = W * 1.15;
    const y1 = H * (0.12 + (0.6 * k) / Math.max(1, foes.length - 1));
    const x = x0 + (x1 - x0) * e;
    const y = y0 + (y1 - y0) * e - Math.sin(q * Math.PI) * H * 0.15;
    // 연기 자국
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let j = 1; j <= 5; j++) {
      const qe = Math.max(0, q - j * 0.06) ** 2;
      ctx.beginPath();
      ctx.arc(x0 + (x1 - x0) * qe, y0 + (y1 - y0) * qe - Math.sin(Math.max(0, q - j * 0.06) * Math.PI) * H * 0.15, (6 + j * 3) * rs, 0, Math.PI * 2);
      ctx.fill();
    }
    const qn = Math.min(1, q + 0.02);
    const nx = x0 + (x1 - x0) * qn * qn;
    const ny = y0 + (y1 - y0) * qn * qn - Math.sin(qn * Math.PI) * H * 0.15;
    drawRocket(x, y, rs, Math.atan2(ny - y, nx - x), P.color, String(p.i + 1));
  });

  const fs = clamp(Math.min(W * 0.07, H * 0.12), 24, 84);
  const pop = 1 + Math.max(0, 0.3 - t) * 2;
  text(`${P.name} 로켓 발사!`, W / 2, H * 0.16, fs * pop, P.color, 'center', '#fff');
  text('상대 모두에게 명중!', W / 2, H * 0.16 + fs * 1.05, fs * 0.5, '#ffe27a', 'center', INK);
  ctx.restore();
}

// 레이스가 끝나고 3초 뒤 나오는 시상대. 1등이 가운데, 2등은 왼쪽, 3등은 오른쪽, 그다음은 바깥쪽으로 번갈아 선다.
function drawPodium() {
  const list = standings();
  const cols = [];
  list.forEach((e, k) => (k % 2 ? cols.unshift(e) : cols.push(e)));
  const n = cols.length;
  const slotW = Math.min((W * 0.92) / n, H * 0.34);
  const left = (W - slotW * n) / 2;
  const baseY = H * 0.68;
  const topH = H * 0.2;
  const cs = Math.min((slotW * 0.75) / 90, (H * 0.22) / 150);
  const fs = clamp(slotW * 0.13, 12, 26);
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  line(left - 10, baseY, left + slotW * n + 10, baseY);
  cols.forEach(({ p, rank, rec }, k) => {
    const P = PLAYERS[p.i];
    const cx = left + slotW * (k + 0.5);
    const h = topH * (1 - (rank - 1) * 0.14);
    rr(cx - slotW * 0.44, baseY - h, slotW * 0.88, h, 6);
    ctx.fillStyle = rank === 1 ? '#ffe27a' : '#fff';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(String(rank), cx, baseY - h / 2, Math.min(h * 0.6, slotW * 0.5), INK);
    drawBuddy(cx, baseY - h, cs, P.color, rank === 1 ? 'win' : rank === 2 ? 'wave' : 'cry');
    text(P.name, cx, baseY + fs * 0.9, fs, P.color, 'center', PAPER);
    text(`${rec} · ${game.wins[p.i]} Win`, cx, baseY + fs * 2, fs * 0.75, INK);
  });
}

// 타이틀 배경은 고른 코스의 모습이다.
function drawTitleScene() {
  const s = Math.min((H * 0.42) / 136, (W * 0.25) / 116);
  const roadTop = H * 0.9 - 70 * s;
  ctx.lineJoin = ctx.lineCap = 'round';
  drawRoad({ x: 0, y: 0, w: W, h: H }, s, roadTop, W / CONFIG.viewMeters, 0);
  drawSign(W * 0.8, roadTop, s * 1.4, 'Goal');
  if (game.course === 'jungle') {
    drawMonkey(W * 0.6, roadTop + 4 * s, s * 1.2, Math.sin(game.time * 3) > 0.6);
    drawBanana(W * 0.64, H * 0.95, s * 1.2);
  } else if (game.course === 'arctic') {
    drawPuddle(W * 0.64, H * 0.94, 90 * s, 18 * s, s);
  } else if (game.course === 'sea') {
    drawBubble(W * 0.62, H * 0.95, s * 1.4);
    drawBubble(W * 0.7, H * 0.9, s * 1.1, 2);
  } else if (game.course === 'desert') {
    drawSnake(W * 0.64, H * 0.84 + Math.sin(game.time * 2) * 20 * s, s * 1.2, 1, true);
  }
  drawKart(W * 0.38, H * 0.9, s, PLAYERS[0].color, 'drive');
}

function render() {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // 메뉴 화면(인원수·난이도·코스 선택) 뒤에는 타이틀 장면을 그린다. 아직 경기가 없으면 그릴 카트도 없다.
  if (['title', 'select', 'level', 'course'].includes(game.state)) drawTitleScene();
  else if (game.state === 'result') drawPodium();
  else drawRaceScreen();
}

// ---------- 시작 ----------

let last = performance.now();
// 다음 프레임을 먼저 예약해서, 한 프레임에서 오류가 나도 게임 루프가 멈춰 화면이 굳지 않게 한다.
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  updateEngine();
  render();
}

resize();
requestAnimationFrame(frame);
