// 헤드리스 검증. 시스템 Chrome으로 index.html을 열어 update(dt)를 직접 호출하며 window.game 상태를 판정한다.
// 실행: cd tests && npm install && npm test   (스크린샷은 tests/shots/에 저장된다)
// 실제 멀티터치, 6손가락 동시 입력, iOS 제스처 충돌, 아이패드 프레임은 실기기 확인 대상이다.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fails++; };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`file://${ROOT}/index.html`);

  // 실시간 루프의 update를 끊고 직접 시간을 감는다.
  await page.evaluate(() => {
    window.realUpdate = window.update;
    window.update = () => {};
    window.step = (sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) realUpdate(dt); };
    window.tapEl = (id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    window.startRace = (n) => {
      if (game.state === 'result' || game.state === 'win' || game.state === 'race') { game.state = 'title'; }
      game.state = 'title';
      tapEl('btnStart');
      document.querySelector(`#counts [data-n="${n}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      tapEl('btnSelect'); tapEl('btnGo');
      step(3.01);
    };
  });

  // --- 흐름 ---
  await page.evaluate(() => startRace(4));
  let st = await page.evaluate(() => ({ state: game.state, n: game.players.length, wx: game.players.map((p) => p.wx), lat: game.players.map((p) => p.lat) }));
  ok('카운트다운 뒤 race 상태', st.state === 'race' && st.n === 4, JSON.stringify(st));
  ok('출발 lat 분산', st.lat.every((l, i) => Math.abs(l - (i + 0.5) / 4) < 1e-9));

  // --- 속도: 가감속과 기본 속도 ---
  let r = await page.evaluate(() => { game.items = []; const b0 = game.players[0].base; step(0.2); const m = game.players[0].mul; step(1.8); const b1 = game.players[0].base; step(1); return { m, v: game.players[0].base - b1, mul: game.players[0].mul }; });
  ok('출발 직후 짧은 가속 (0.2초 시점 mul<1)', r.m > 0.3 && r.m < 0.6, r.m);
  ok('기본 속도 20m/s', Math.abs(r.v - 20) < 0.01 && r.mul === 1, r.v);

  // --- 상대 위치의 일관성 ---
  r = await page.evaluate(() => {
    const [A, B] = game.players;
    A.off = 2; B.off = 7; B.base = A.base; A.lag = 1.2; B.lag = 0;
    const va = view(0), vb = view(1);
    const inA = (kartPx(A, B).x - kartPx(A, A).x) / va.ppm;
    const inB = (kartPx(B, A).x - kartPx(B, B).x) / vb.ppm;
    A.lag = 0;
    return { inA, inB };
  });
  ok('A 화면에서 B가 5m 앞 ↔ B 화면에서 A가 5m 뒤', Math.abs(r.inA - 5) < 1e-6 && Math.abs(r.inB + 5) < 1e-6, JSON.stringify(r));

  // --- 공유 아이템: 선점 ---
  r = await page.evaluate(() => {
    startRace(2);
    const [A, B] = game.players;
    for (const p of game.players) { p.mul = 1; p.tLat = p.lat = 0.5; }
    A.lat = A.tLat = 0.5; B.lat = B.tLat = 0.5;
    A.base = 200; B.base = 192; // A가 8m 앞. 같은 lat이면 충돌로 밀리므로 조금 벌린다
    A.lat = A.tLat = 0.45; B.lat = B.tLat = 0.62;
    game.items = [{ wx: 215, lat: 0.53, type: 'attack', row: 0, takenBy: null }];
    step(1.5);
    return { takenBy: game.items[0].takenBy, aGot: A.attack, bGot: B.attack, bwx: B.wx, fx: game.fx.length };
  });
  ok('앞선 카트가 아이템을 가져감', r.takenBy === 0 && r.aGot);
  ok('뒤따르던 카트는 같은 자리를 지나도 획득 못 함', !r.bGot && r.bwx > 215, JSON.stringify(r));

  r = await page.evaluate(() => {
    startRace(4);
    const ps = game.players;
    ps.forEach((p, i) => { p.mul = 1; p.base = 300; p.off = p.tOff = 0; });
    ps[0].lat = ps[0].tLat = 0.40; ps[1].lat = ps[1].tLat = 0.60; ps[2].lat = ps[2].tLat = 0.05; ps[3].lat = ps[3].tLat = 0.95;
    game.items = [{ wx: 304, lat: 0.5, type: 'attack', row: 0, takenBy: null }];
    step(1 / 60);
    const first = game.items[0].takenBy;
    step(0.5);
    return { first, got: ps.filter((p) => p.attack).map((p) => p.i), picks: game.fx.filter((f) => f.kind === 'pick').length };
  });
  ok('같은 프레임 동시 접촉 → 정확히 한 명', r.got.length === 1 && r.picks === 1, JSON.stringify(r));

  r = await page.evaluate(() => {
    startRace(2);
    const [A, B] = game.players;
    A.mul = B.mul = 1; A.base = 300; B.base = 600; A.lat = A.tLat = 0.5; A.attack = true; // B가 1등이라 A는 부스터를 먹을 수 있다
    game.items = [{ wx: 306, lat: 0.5, type: 'attack', row: 0, takenBy: null }, { wx: 330, lat: 0.36, type: 'boost', row: 1, takenBy: null }, { wx: 330, lat: 0.56, type: 'boost', row: 1, takenBy: null }, { wx: 350, lat: 0.46, type: 'boost', row: 2, takenBy: null }, { wx: 370, lat: 0.46, type: 'boost', row: 3, takenBy: null }];
    A.tLat = 0.46; // 두 부스터 사이
    step(0.6); A.lat = A.tLat = 0.46; step(3);
    return { atk: game.items[0].takenBy, row1: game.items.slice(1, 3).map((i) => i.takenBy), next: game.items.slice(3).map((i) => i.takenBy) };
  });
  ok('공격 보유 중에는 공격 칸을 소비하지 않음', r.atk === null);

  ok('한 줄에서 한 칸만 획득', r.row1.filter((t) => t === 0).length === 1, JSON.stringify(r.row1));
  ok('바로 다음 줄은 못 얻고 그다음 줄은 얻음', r.next[0] === null && r.next[1] === 0, JSON.stringify(r.next));

  // --- 1등은 부스터를 못 먹음 ---
  r = await page.evaluate(() => {
    startRace(2);
    const [A, B] = game.players;
    A.mul = B.mul = 1; A.base = 300; B.base = 280; A.lat = A.tLat = 0.3; B.lat = B.tLat = 0.7;
    game.items = [{ wx: 310, lat: 0.3, type: 'boost', row: 0, takenBy: null }, { wx: 290, lat: 0.7, type: 'boost', row: 0, takenBy: null }];
    const dim = !canTake(A, game.items[0]) && canTake(B, game.items[1]);
    step(1);
    return { dim, taken: game.items.map((i) => i.takenBy), a: A.boost, b: B.boost > 0, aPassed: A.wx > 310 };
  });
  ok('1등은 부스터를 지나쳐도 못 먹고, 2등은 먹음', r.dim && r.taken[0] === null && r.taken[1] === 1 && r.a === 0 && r.b && r.aPassed, JSON.stringify(r));

  // --- 레이저 ---
  r = await page.evaluate(() => {
    startRace(5); game.items = [];
    const ps = game.players; ps.forEach((p) => (p.mul = 1));
    const [A, B, C, D, E] = ps;
    A.base = 300; B.base = 340; C.base = 600; D.base = 320; E.base = 290;
    A.lat = A.tLat = B.lat = B.tLat = C.lat = C.tLat = E.lat = E.tLat = 0.5; D.lat = D.tLat = 0.95;
    fireLaser(A); const noAmmo = game.beams.length;
    A.laser = true; fireLaser(A);
    A.lat = A.tLat = 0.1; E.boost = 5; // 쏜 뒤 뒤에 있던 E가 쏜 자리를 추월해도 맞지 않는다
    step(0.1); const early = B.slow;
    step(0.6); const bHit = B.slow > 0;
    step(3); const cHit = C.slow > 0, dHit = D.slow > 0, eHit = E.slow > 0, ePassed = E.wx > 300, aHit = A.slow > 0;
    step(3);
    return { noAmmo, early, bHit, cHit, dHit, eHit, ePassed, aHit, left: game.beams.length, laser: A.laser };
  });
  ok('레이저 미보유 시 발사 안 됨', r.noAmmo === 0);
  ok('레이저: 같은 줄의 앞쪽 카트는 끝까지 모두 맞음(날아가는 시간 있음)', r.early === 0 && r.bHit && r.cHit, JSON.stringify(r));
  ok('레이저: 다른 줄·뒤에 있던 카트·쏜 사람은 안 맞음', !r.dHit && !r.eHit && r.ePassed && !r.aHit && !r.laser, JSON.stringify(r));
  ok('레이저는 결승선 너머로 사라짐', r.left === 0);

  // --- 줄 단위 배치 ---
  r = await page.evaluate(() => {
    const out = {};
    for (const n of [2, 4, 6]) {
      const items = makeItems(n);
      const rows = {};
      for (const it of items) (rows[it.row] ||= []).push(it);
      const list = Object.values(rows);
      out[n] = {
        rows: list.length, cells: list[0].length,
        mixed: list.every((rw) => rw.some((i) => i.type === 'boost') && rw.some((i) => i.type !== 'boost')),
        laser: items.some((i) => i.type === 'laser'),
        range: items.every((i) => i.wx >= 100 && i.wx <= 900 && i.lat > 0 && i.lat < 1),
      };
    }
    return out;
  });
  ok('줄당 칸 수 2/3/3, 부스터·무기 혼합, 레이저 포함, 100~900m', r[2].cells === 2 && r[4].cells === 3 && r[6].cells === 3 && [2, 4, 6].every((n) => r[n].mixed && r[n].range && r[n].laser), JSON.stringify(r));

  // --- 공격 ---
  r = await page.evaluate(() => {
    startRace(2); game.items = [];
    const [A, B] = game.players;
    A.mul = B.mul = 1; A.base = 100; B.base = 300; B.off = B.tOff = 6;
    fire(A, 1); const noAmmo = game.shots.length;
    A.attack = true; fire(A, 1);
    const rec = { ...game.shots[0] };
    step(0.5); const mid = B.slow;
    step(0.2);
    const hitSlow = B.slow, prot = B.protect;
    step(0.5); const mul = B.mul;
    step(2.6); const after = B.slow;
    // 피하기
    A.attack = true; fire(A, 1); B.tLat = B.lat > 0.5 ? 0 : 1; step(1.1);
    return { noAmmo, rec, mid, hitSlow, prot, mul, after, dodged: B.slow, fx: game.fx.map((f) => f.kind) };
  });
  ok('공격 미보유 시 발사 안 됨', r.noAmmo === 0);
  ok('대상의 base 상대 좌표로 기록', r.rec.u === 6 && Math.abs(r.rec.v - 0.75) < 1e-9, JSON.stringify(r.rec));
  ok('공격은 1/1.5초 만에 도착(속도 1.5배), 도착 시 감속 3초·보호 1초', r.mid === 0 && r.hitSlow > 2.9 && r.prot > 0.9, r.hitSlow);
  ok('감속 배율 0.6 (따라잡기 없음: 선두)', Math.abs(r.mul - 0.6) < 1e-9, r.mul);
  ok('3초 뒤 해제', r.after === 0);
  ok('피하면 맞지 않음', r.dodged === 0 && r.fx.includes('miss'), JSON.stringify(r.fx));

  r = await page.evaluate(() => {
    startRace(2); game.items = [];
    const [A, B] = game.players;
    A.base = 100; B.base = 300; A.attack = true; fire(A, 1);
    const behind = shotStart(game.shots[0]).wx - B.base;
    game.shots = []; A.base = 500; A.attack = true; fire(A, 1);
    const ahead = shotStart(game.shots[0]).wx - B.base;
    game.shots = []; A.base = 305; A.attack = true; fire(A, 1);
    const near = shotStart(game.shots[0]).wx - A.wx;
    game.shots = [];
    return { behind, ahead, near };
  });
  ok('투사체 진입 방향: 뒤=왼쪽 밖, 앞=오른쪽 밖, 시야 안=공격자 위치', r.behind < -36 * 0.12 && r.ahead > 36 * 0.88 && r.near === 0, JSON.stringify(r));

  // --- 따라잡기 ---
  r = await page.evaluate(() => {
    startRace(3); game.items = [];
    const ps = game.players; ps.forEach((p) => (p.mul = 1));
    ps[0].base = 500; ps[1].base = 440; ps[2].base = 100;
    step(1);
    return ps.map((p) => p.mul);
  });
  ok('따라잡기: 60m 뒤 +4%, 400m 뒤 +10% 상한', Math.abs(r[0] - 1) < 1e-9 && Math.abs(r[1] - 1.04) < 1e-9 && Math.abs(r[2] - 1.1) < 1e-9, JSON.stringify(r));

  // --- 충돌 ---
  r = await page.evaluate(() => {
    startRace(6);
    const startFx = game.fx.filter((f) => f.kind === 'bump').length;
    startRace(2); game.items = [];
    const [A, B] = game.players; const v = view();
    A.mul = B.mul = 1; A.base = B.base = 200;
    A.lat = 0.5; B.lat = 0.52; A.tLat = B.tLat = 0.5;
    step(0.5);
    const sep = Math.abs(A.lat - B.lat), need = (18 * v.s) / v.rh;
    const bumps = game.fx.filter((f) => f.kind === 'bump').length;
    // 벽 쪽: 둘 다 맨 위로 가려 하면 한 대만 0에 닿는다
    A.tLat = B.tLat = 0; step(1);
    const wall = [A.lat, B.lat];
    // 뒤에서 빠르게 추월해도 전진은 막히지 않는다
    A.base = 200; B.base = 215; A.lat = B.lat = A.tLat = B.tLat = 0.5; A.boost = 2; const b0 = A.base;
    step(2);
    return { startFx, sep, need, bumps, wall, passed: A.wx > B.wx, adv: A.base - b0 };
  });
  ok('6인 출발 정렬에서는 충돌 없음', r.startFx === 0);
  ok('겹치면 좌우로 밀려남', r.sep >= r.need - 1e-6, `${r.sep.toFixed(3)} / ${r.need.toFixed(3)}`);
  ok('접촉 연출은 한 번만', r.bumps === 1, r.bumps);
  ok('벽에 막히면 상대가 밀려남', Math.min(...r.wall) === 0 && Math.max(...r.wall) >= r.need - 1e-6, JSON.stringify(r.wall));
  ok('충돌이 전진을 막지 않음(부스터 추월)', r.passed && r.adv > 55, r.adv);

  // --- 결승 ---
  r = await page.evaluate(() => {
    startRace(2); game.items = [];
    const [A, B] = game.players; A.mul = B.mul = 1;
    A.base = 985; A.off = A.tOff = 10; B.base = 900; game.wins = [0, 0];
    let frames = 0;
    while (game.state === 'race' && frames < 600) { realUpdate(1 / 60); frames++; }
    const wxAtWin = A.wx, state = game.state, winners = [...game.winners], wins = [...game.wins];
    step(1); const still = game.state; step(2.1);
    return { wxAtWin, state, winners, wins, still, end: game.state, title: document.getElementById('resultTitle').textContent, list: standings().map((e) => `${e.rank}위 ${e.rec}`).join(' ') };
  });
  ok('wx가 1000을 넘는 프레임에 승리 판정', r.state === 'win' && r.wxAtWin >= 1000 && r.wxAtWin < 1000.4, r.wxAtWin);
  ok('승수 +1, 3초 뒤 결과', r.winners[0] === 0 && r.wins[0] === 1 && r.still === 'win' && r.end === 'result', r.title);
  ok('시상대 순서와 완주/미완주 기록', /^1위 완주 2위 9\d\dm$/.test(r.list), r.list);
  r = await page.evaluate(() => { tapEl('btnAgain'); tapEl('btnAgain'); return { state: game.state, wins: [...game.wins], wx: game.players.map((p) => p.wx) }; });
  ok('다시하기: 승수 유지, 위치 초기화', r.state === 'countdown' && r.wins[0] === 1 && r.wx.every((w) => w === 0), JSON.stringify(r));

  // --- 멀티터치 입력 ---
  r = await page.evaluate(() => {
    startRace(4); game.items = [];
    const c = document.getElementById('game'); const rect = c.getBoundingClientRect();
    const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: rect.left + x, clientY: rect.top + y, bubbles: true, cancelable: true }));
    const pads = game.layout.panels.map((p) => padInner(p.pad));
    ev('pointerdown', 11, pads[0].x + pads[0].w, pads[0].y);                 // P1: 맨 앞·맨 위
    ev('pointerdown', 12, pads[3].x, pads[3].y + pads[3].h);                 // P4: 맨 뒤·맨 아래
    ev('pointermove', 11, pads[1].x + pads[1].w / 2, pads[1].y + pads[1].h / 2); // P1 손가락이 P2 패널로 넘어감
    const t = game.players.map((p) => [p.tOff, p.tLat]);
    step(3);
    const pos = game.players.map((p) => [p.off, p.lat]);
    // 공격 버튼
    game.players[1].attack = true;
    const b = attackButtons(game.layout.panels[1], 1).find((q) => q.target === 2);
    ev('pointerdown', 13, b.x + b.w / 2, b.y + b.h / 2);
    game.players[2].laser = true;
    const lb = game.layout.panels[2].btns;
    ev('pointerdown', 14, lb.x + lb.w * 0.8, lb.y + lb.h / 2);
    return { t, pos, offMax: OFF_MAX, shots: game.shots.map((s) => [s.from, s.to]), p2steer: game.players[1].tOff, beams: game.beams.map((b) => b.from), p3steer: game.players[2].tOff };
  });
  ok('터치가 처음 닿은 패널에 귀속', r.t[1][0] === 0 && Math.abs(r.t[1][1] - 0.375) < 1e-9 && r.t[3][0] === 0 && r.t[3][1] === 1, JSON.stringify(r.t));
  ok('가로축→off(10m/s 제한), 세로축→lat', Math.abs(r.pos[0][0] - r.t[0][0]) < 1e-6 && r.pos[3][1] === 1, JSON.stringify(r.pos[0]));
  ok('공격 버튼은 조향으로 전달되지 않고 발사', r.shots.length === 1 && r.shots[0][0] === 1 && r.shots[0][1] === 2 && r.p2steer === 0);
  ok('레이저 보유 시 버튼 줄이 레이저 발사', r.beams.length === 1 && r.beams[0] === 2 && r.p3steer === 0, JSON.stringify(r.beams));
  r = await page.evaluate(() => { startRace(2); game.items = []; game.players[0].tOff = OFF_MAX; step(0.5 + 0.417); return game.players[0].off; });
  ok('전후 이동은 10m/s', Math.abs(r - (0.5 + 0.417) * 10) < 0.2, r);

  // --- 봇 시뮬레이션: 선두가 아니어도 아이템을 여러 번 얻는가 ---
  r = await page.evaluate(() => {
    const runs = [];
    for (let k = 0; k < 12; k++) {
      const n = k < 6 ? 4 : 6;
      startRace(n);
      const got = Array(n).fill(0);
      let t = 0;
      while (game.state === 'race' && t < 120) {
        for (const p of game.players) {
          const next = game.items.filter((i) => i.takenBy === null && i.wx > p.wx + 1 && canTake(p, i)).sort((a, b) => a.wx - b.wx || Math.abs(a.lat - p.lat) - Math.abs(b.lat - p.lat))[0];
          if (next) p.tLat = next.lat;
          p.tOff = OFF_MAX * (0.2 + 0.13 * p.i);
          if (p.laser) fireLaser(p);
          if (p.attack) { const lead = [...game.players].sort((a, b) => b.wx - a.wx).find((q) => q !== p); fire(p, lead.i); }
        }
        realUpdate(1 / 60); t += 1 / 60;
      }
      for (const it of game.items) if (it.takenBy !== null) got[it.takenBy]++;
      const rank = game.players.map((p) => rankOf(p));
      runs.push({ t: +t.toFixed(1), got, rank, maxGap: Math.round(Math.max(...game.players.map((p) => p.wx)) - Math.min(...game.players.map((p) => p.wx))) });
    }
    return runs;
  });
  console.log(r.map((x) => JSON.stringify(x)).join('\n'));
  ok('모든 플레이어가 한 판에 아이템을 여러 번 획득', r.every((x) => x.got.every((g) => g >= 2)));
  ok('한 판 길이 40~55초', r.every((x) => x.t > 40 && x.t < 55));

  // --- 소리: 실제로 들리는지는 실기기 확인 대상이고, 여기서는 오프라인 렌더링의 음량만 본다 ---
  r = await page.evaluate(async () => {
    const render = async (play) => {
      setupAudio(new OfflineAudioContext(1, 44100 * 1.5, 44100));
      play();
      const data = (await ac.startRendering()).getChannelData(0);
      return +data.reduce((m, x) => Math.max(m, Math.abs(x)), 0).toFixed(3);
    };
    startRace(2);
    const out = {};
    game.state = 'paused'; // 실시간 루프의 updateEngine이 효과음 측정에 섞이지 않게 한다
    for (const name of Object.keys(SOUNDS)) out[name] = await render(SOUNDS[name]);
    out.paused = await render(updateEngine);
    game.state = 'race';
    out.engine = await render(updateEngine);
    out.all = await render(() => { updateEngine(); for (const name of Object.keys(SOUNDS)) SOUNDS[name](); });
    ac = null;
    return out;
  });
  const { paused, ...loud } = r;
  ok('모든 소리가 들리고 겹쳐도 클리핑 없음', Object.values(loud).every((p) => p > 0.02 && p < 1), JSON.stringify(r));
  ok('멈춤 중에는 엔진음 꺼짐', paused === 0);

  r = await page.evaluate(() => {
    const log = [];
    window.sfx = (name) => log.push(name);
    startRace(2);
    const [A, B] = game.players;
    A.mul = B.mul = 1; A.base = 200; B.base = 100;
    game.items = [{ wx: 105, lat: B.lat, type: 'boost', row: 0, takenBy: null }, { wx: 205, lat: A.lat, type: 'attack', row: 0, takenBy: null }];
    step(0.5);
    fire(A, 1); step(1.1);                                   // 명중
    A.attack = true; fire(A, 1); B.tLat = 1; step(1.1);      // 빗나감
    A.laser = true; fireLaser(A); step(0.05);                // 레이저 (뒤의 B는 안 맞음)
    B.boost = 0; A.base = B.base; A.off = B.off; A.lat = A.tLat = 0.5; B.lat = B.tLat = 0.52; step(0.1);
    A.base = 999; step(0.2);
    return log.join(' ');
  });
  ok('이벤트마다 효과음', r === 'tap tap tap tap count count count go boost attack fire hit fire miss beam bump win', r);

  // --- 스크린샷 ---
  await page.evaluate(() => { window.update = window.realUpdate; });
  const shot = async (name, n, setup) => {
    await page.evaluate(({ n, setup }) => { window.update = () => {}; startRace(n); eval(setup); step(1 / 60); }, { n, setup });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  await shot('s4', 4, `const ps=game.players; ps.forEach(p=>p.mul=1); ps[0].base=300; ps[1].base=306; ps[1].off=4; ps[2].base=290; ps[3].base=120; ps[0].off=ps[0].tOff=8; ps[0].boost=2; ps[0].mul=1.6; ps[0].lag=3; ps[2].slow=2; ps[2].mul=.6; ps[2].attack=true; fire(ps[2],0); step(0.45); ps[0].touch={u:.5,v:.5};`);
  await shot('s6', 6, `const ps=game.players; ps.forEach((p,i)=>{p.mul=1;p.base=100+i*4;}); step(0.3);`);
  await shot('s2start', 2, `step(0.25);`);
  await shot('s3laser', 3, `const ps=game.players; ps.forEach(p=>p.mul=1); ps[0].base=300; ps[1].base=318; ps[2].base=280; ps[0].lat=ps[0].tLat=ps[1].lat=ps[1].tLat=.5; ps[2].laser=true; ps[0].laser=true; fireLaser(ps[0]); step(0.08); game.items=game.items.map(i=>({...i}));`);
  const podium = async (name, n) => {
    await page.evaluate((n) => { window.update = () => {}; startRace(n); game.items = []; game.players.forEach((p, i) => { p.mul = 1; p.base = 990 - i * 23; }); step(1); step(3.1); }, n);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  };
  await podium('podium3', 3);
  await podium('podium6', 6);
  await shot('s2goal', 2, `const ps=game.players; ps.forEach(p=>p.mul=1); ps[0].base=975; ps[1].base=970; ps[0].off=ps[0].tOff=10; game.items=[]; step(1.2);`);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => resize());
  await shot('phone2', 2, `const ps=game.players; ps.forEach(p=>p.mul=1); ps[0].base=300; ps[1].base=380;`);
  await podium('phonePodium2', 2);

  ok('콘솔·페이지 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
