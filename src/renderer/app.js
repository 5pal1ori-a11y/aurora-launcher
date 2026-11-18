/* global skinview3d, api */
const $ = (id) => document.getElementById(id);
// window.api 는 preload.js 가 노출한 전역입니다.

const state = { profile: null, settings: null, versions: [], installed: [], latest: null, busy: false, variant: 'classic' };
let viewer = null;

// ───────── 공통 ─────────
let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// IPC 오류 메시지의 "Error invoking remote method ..." 접두사 제거
const errText = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(errText(e), true);
    return undefined;
  }
}

// ───────── 페이지 전환 ─────────
document.querySelectorAll('.nav').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav').forEach((n) => n.classList.toggle('active', n === b));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${b.dataset.page}`));
    document.body.dataset.page = b.dataset.page;
    if (b.dataset.page === 'wardrobe') renderWardrobe();
    if (b.dataset.page === 'home') drawBanner();
  })
);
$('btn-min').onclick = () => api.minimize();
$('btn-close').onclick = () => api.close();

// ───────── 계정 ─────────
function renderAccount() {
  const p = state.profile;
  $('acc-name').textContent = p ? p.name : '로그인 필요';
  $('acc-sub').textContent = 'Microsoft 계정';
  $('acc-action').textContent = p ? '로그아웃' : '로그인';
  const head = $('acc-head');
  // 스킨 텍스처(64x64)에서 얼굴(8,8 ~ 16,16)만 잘라 보여 줌
  head.style.background = p && p.skin ? `url("${p.skin.url}") 14.2857% 14.2857% / 800% 800%` : '';
  updatePlayButton();
  renderHomeChar();
  renderWardrobe();
}

async function login() {
  toast('로그인 창을 여는 중…');
  const p = await guard(() => api.login());
  if (p) {
    state.profile = p;
    renderAccount();
    toast(`${p.name}(으)로 로그인했습니다.`);
  }
}

$('acc-action').onclick = async () => {
  if (!state.profile) return login();
  await api.logout();
  state.profile = null;
  renderAccount();
};
$('wardrobe-login').onclick = login;

// ───────── 버전 ─────────
function renderVersions() {
  const sel = $('version');
  const show = state.versions.filter((v) => v.type === 'release' || state.settings.showSnapshots);
  sel.replaceChildren(
    ...show.map((v) => {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.id + (v.id === state.latest.release ? '  (최신)' : v.type === 'snapshot' ? '  (스냅샷)' : '');
      return o;
    })
  );
  const want = state.settings.lastVersion || state.latest.release;
  if (show.some((v) => v.id === want)) sel.value = want;
  renderSide();
}

function selectVersion(id) {
  if (state.busy) return;
  const sel = $('version');
  if (![...sel.options].some((o) => o.value === id)) {
    // 스냅샷이 숨겨져 있어도 고를 수 있게 목록에 추가
    const v = state.versions.find((x) => x.id === id);
    if (!v) return;
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    sel.append(o);
  }
  sel.value = id;
  patchSettings({ lastVersion: id });
  renderSide();
}

function ago(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
}

const versionType = (id) => (state.versions.find((v) => v.id === id) || {}).type;

// 사이드바: 최신 버전 + 내가 받은/플레이한 버전
function renderSide() {
  const cur = $('version').value;
  const hist = state.settings.history || {};
  const ids = [];
  const add = (id) => id && !ids.includes(id) && state.versions.some((v) => v.id === id) && ids.push(id);
  Object.entries(hist).sort((a, b) => b[1] - a[1]).forEach(([id]) => add(id));
  add(state.latest.release);
  if (state.settings.showSnapshots) add(state.latest.snapshot);
  state.installed.forEach(add);
  add(state.cosmeticsVersion);
  add(cur);

  $('vlist').replaceChildren(
    ...ids.map((id) => {
      const snap = versionType(id) === 'snapshot';
      const b = document.createElement('button');
      b.className = 'vitem' + (id === cur ? ' on' : '');
      const img = document.createElement('img');
      img.src = Pixel.blockIcon(snap ? 'stone' : id === state.cosmeticsVersion ? 'log' : 'grass');
      img.alt = '';
      const t = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = id;
      const sub = document.createElement('small');
      const bits = [];
      if (id === state.latest.release) bits.push('최신 릴리스');
      else if (id === state.latest.snapshot) bits.push('최신 스냅샷');
      if (id === state.cosmeticsVersion) bits.push('치장품');
      bits.push(hist[id] ? ago(hist[id]) : state.installed.includes(id) ? '설치됨' : '설치 안 됨');
      sub.textContent = bits.join(' · ');
      t.append(name, sub);
      b.append(img, t);
      b.onclick = () => selectVersion(id);
      return b;
    })
  );

  $('b-title').textContent = `Minecraft ${cur}`;
  const meta = [versionType(cur) === 'snapshot' ? '스냅샷' : '릴리스'];
  meta.push(state.installed.includes(cur) ? '설치됨' : '처음 실행할 때 내려받음');
  if (hist[cur]) meta.push(`마지막 플레이 ${ago(hist[cur])}`);
  if (cur === state.cosmeticsVersion && state.settings.cosmetics.length) meta.push('치장품 켜짐');
  $('b-meta').textContent = meta.join(' · ');
}

// ───────── 플레이 ─────────
function updatePlayButton() {
  const btn = $('btn-play');
  if (state.busy) return;
  btn.disabled = !state.versions.length;
  $('play-label').textContent = state.profile ? '플레이' : '로그인';
}

function setStatus(text, pct) {
  $('status-text').textContent = text;
  const bar = $('bar');
  bar.classList.toggle('busy', pct === null);
  if (typeof pct === 'number') $('bar-fill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function setBusy(busy, label) {
  state.busy = busy;
  $('btn-play').disabled = busy;
  $('version').disabled = busy;
  if (busy) $('play-label').textContent = label;
  else updatePlayButton();
}

$('btn-play').onclick = async () => {
  if (!state.profile) return login();
  $('log').textContent = '';
  $('status-text').classList.remove('err');
  setBusy(true, '준비 중…');
  setStatus('준비 중…', null);
  const ok = await guard(() => api.launch($('version').value));
  if (!ok) {
    setBusy(false);
    setStatus('대기 중', 0);
  }
};
$('sc-dir').onclick = () => api.openGameDir();
$('sc-log').onclick = () => api.openLog();

$('log-toggle').onclick = () => ($('logpanel').hidden = !$('logpanel').hidden);
$('log-close').onclick = () => ($('logpanel').hidden = true);
$('log-open').onclick = () => api.openLog();

const TASK_NAMES = { assets: '에셋', natives: '네이티브', classes: '라이브러리', 'classes-custom': '라이브러리', 'classes-maven-custom': '라이브러리', 'assets-copy': '에셋 복사' };

api.onProgress((p) => {
  const pct = p.total ? Math.round((p.task / p.total) * 100) : 0;
  setStatus(`${TASK_NAMES[p.type] || p.type} 다운로드 중… ${p.task}/${p.total}`, pct);
});

api.onState((s) => {
  if (s.state === 'preparing' || s.state === 'downloading') {
    setBusy(true, '준비 중…');
    setStatus(s.text + (typeof s.pct === 'number' ? ` ${s.pct}%` : ''), typeof s.pct === 'number' ? s.pct : null);
  } else if (s.state === 'running') {
    setBusy(true, '실행 중');
    setStatus('게임 실행 중', 100);
  } else {
    setBusy(false);
    refreshInstalled();
    setStatus(s.code ? (s.hint || `게임이 비정상 종료됐습니다 (코드 ${s.code})`).split('\n')[0] : '대기 중', 0);
    $('status-text').classList.toggle('err', !!s.code);
    if (s.code) {
      $('logpanel').hidden = false;
      $('log').scrollTop = $('log').scrollHeight;
    }
  }
});

api.onLog((line) => {
  const log = $('log');
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent = (log.textContent + line.replace(/\n?$/, '\n')).slice(-20000);
  if (stick) log.scrollTop = log.scrollHeight;
});

// ───────── 옷장 ─────────
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = { none: svg('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>') };
const ANIMS = {
  idle: () => new skinview3d.IdleAnimation(),
  walk: () => new skinview3d.WalkingAnimation(),
  run: () => new skinview3d.RunningAnimation(),
  fly: () => new skinview3d.FlyingAnimation(),
};
let currentAnim = 'idle';

// 홈 배너: 픽셀 풍경 + 그 위에 서 있는 내 캐릭터
let homeViewer = null;
let banner = null;
const CHAR_W = 150;
const CHAR_H = 210;
const CHAR_FOOT = 22; // 캔버스 아래쪽 여백 중 발 밑까지의 거리
function drawBanner() {
  if (!$('banner').clientHeight) return; // 다른 페이지에 있을 때
  if (banner) banner.stop();
  banner = Pixel.scene($('scene'), { charX: 0.58 });
  const c = $('home-canvas');
  c.style.left = `${banner.foot.x - CHAR_W / 2}px`;
  c.style.top = `${banner.foot.y - CHAR_H + CHAR_FOOT}px`;
}
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawBanner, 120);
}).observe($('banner'));

function renderHomeChar() {
  const p = state.profile;
  renderLoadout();
  $('home-canvas').hidden = !(p && p.skin);
  if (!p || !p.skin) return;
  const canvas = $('home-canvas');
  if (!homeViewer) {
    homeViewer = new skinview3d.SkinViewer({ canvas, width: CHAR_W, height: CHAR_H });
    homeViewer.fov = 30;
    homeViewer.zoom = 0.82;
    homeViewer.animation = ANIMS.idle();
    homeViewer.controls.enabled = false;
    homeViewer.playerObject.rotation.y = -0.5;
    homeViewer.globalLight.intensity = 2.4;
    homeViewer.cameraLight.intensity = 0.9;
  }
  Promise.resolve(homeViewer.loadSkin(p.skin.url, { model: p.skin.variant === 'slim' ? 'slim' : 'default' })).catch(() => {});
  const cape = p.capes.find((c) => c.active);
  if (cape) Promise.resolve(homeViewer.loadCape(cape.url)).catch(() => {});
  else homeViewer.loadCape(null);
  applyCosmetics(homeViewer);
}

function renderLoadout() {
  const p = state.profile;
  $('loadout').hidden = !p;
  if (!p) return;
  const cape = p.capes.find((c) => c.active);
  $('lo-skin').textContent = p.skin ? (p.skin.variant === 'slim' ? '슬림' : '클래식') : '기본';
  $('lo-cape').textContent = cape ? cape.name : '없음';
  const on = (state.settings && state.settings.cosmetics) || [];
  $('lo-cos').textContent = on.length ? COSMETICS.filter((c) => on.includes(c.id)).map((c) => c.name).join(', ') : '없음';
}
$('lo-open').onclick = () => document.querySelector('.nav[data-page="wardrobe"]').click();

// ───────── 치장품 3D 미리보기 ─────────
// 게임 안 모드(aurora-cosmetics)가 그리는 모양과 같은 치수의 상자들로 미리보기를 만듭니다.
const COSMETICS = [
  { id: 'tophat', name: '실크햇', slot: '머리' },
  { id: 'crown', name: '왕관', slot: '머리' },
  { id: 'halo', name: '후광', slot: '머리 위' },
  { id: 'wings', name: '날개', slot: '등' },
];

function applyCosmetics(v) {
  if (!v) return;
  const skin = v.playerObject.skin;
  if (v._cos) v._cos.forEach((g) => g.parent && g.parent.remove(g));
  v._cos = [];
  const on = new Set((state.settings && state.settings.cosmetics) || []);
  if (!on.size) return;

  // skinview3d 가 쓰는 three.js 클래스를 기존 객체에서 얻어 옵니다.
  let sample = null;
  v.playerObject.traverse((o) => { if (!sample && o.isMesh) sample = o; });
  const Mesh = sample.constructor;
  const Box = sample.geometry.constructor;
  const Mat = sample.material.constructor;
  const Group = Object.getPrototypeOf(Object.getPrototypeOf(skin.head)).constructor;
  const box = (parent, w, h, d, x, y, z, color, glow) => {
    const m = new Mesh(new Box(w, h, d), new Mat(glow ? { color, emissive: color } : { color }));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const group = (parent) => {
    const g = new Group();
    parent.add(g);
    return g;
  };

  const head = group(skin.head);
  v._cos.push(head);
  let top = 8; // 머리 꼭대기 높이
  if (on.has('tophat')) {
    box(head, 11, 1, 11, 0, 8.5, 0, 0x1b1b24);
    box(head, 8.4, 1.5, 8.4, 0, 9.75, 0, 0xd63b4e);
    box(head, 8, 5.5, 8, 0, 13.25, 0, 0x1b1b24);
    top = 16;
  } else if (on.has('crown')) {
    box(head, 9, 2, 9, 0, 9, 0, 0xf7c948);
    for (const [x, z] of [[3.5, 3.5], [-3.5, 3.5], [3.5, -3.5], [-3.5, -3.5]]) box(head, 2, 2.5, 2, x, 11.25, z, 0xf7c948);
    box(head, 1.5, 1.5, 0.5, 0, 8.95, 4.65, 0x3df5c1, true);
    top = 12.5;
  }
  if (on.has('halo')) {
    const halo = group(head);
    halo.position.y = top + 3.5;
    for (let i = 0; i < 4; i++) {
      const bar = box(halo, 8, 1, 1, 0, 0, 0, 0xfff2a8, true);
      bar.rotation.y = (i * Math.PI) / 2;
      bar.position.set(Math.sin((i * Math.PI) / 2) * 4, 0, Math.cos((i * Math.PI) / 2) * 4);
    }
  }
  if (on.has('wings')) {
    for (const side of [1, -1]) {
      const wing = group(skin.body);
      v._cos.push(wing);
      wing.position.set(side, 5, -2.5);
      wing.rotation.set(0, side * 0.45, side * 0.21);
      box(wing, 7, 10, 1, side * 3.5, -5, 0, 0xf4f7ff);
      box(wing, 6, 12, 1, side * 10, -7, 0, 0xf4f7ff);
      box(wing, 4, 11, 1, side * 15, -9.5, 0, 0xafc8ff);
    }
  }
}

function ensureViewer() {
  if (viewer) return viewer;
  const canvas = $('skin-canvas');
  viewer = new skinview3d.SkinViewer({ canvas, width: canvas.clientWidth, height: canvas.clientHeight });
  viewer.fov = 45;
  viewer.zoom = 0.4;
  viewer.autoRotate = true;
  viewer.autoRotateSpeed = 0.6;
  viewer.animation = ANIMS.idle();
  viewer.controls.enableZoom = false;
  new ResizeObserver(() => {
    if (canvas.clientWidth && canvas.clientHeight) viewer.setSize(canvas.clientWidth, canvas.clientHeight);
  }).observe(canvas.parentElement);
  return viewer;
}

function setAnim(name) {
  currentAnim = name;
  const v = ensureViewer();
  v.animation = ANIMS[name]();
  v.zoom = name === 'fly' ? 0.3 : 0.4;
  applyCape();
  document.querySelectorAll('#anim-seg button').forEach((b) => b.classList.toggle('on', b.dataset.anim === name));
}

// 탭
document.querySelectorAll('#tabs button').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('on', x.id === `tab-${b.dataset.tab}`));
      if (b.dataset.tab === 'cosmetics') renderCosmetics();
    })
);

// 치장품 카드: 눌러서 착용/해제 (머리에는 모자·왕관 중 하나만)
function renderCosmetics() {
  const on = new Set(state.settings.cosmetics || []);
  const ver = state.cosmeticsVersion;
  const match = $('version').value === ver;
  $('cos-notice').hidden = match;
  $('cos-notice-title').textContent = `치장품은 ${ver} 에서만 적용됩니다. 현재 선택: ${$('version').value}`;
  $('cos-select').textContent = `${ver} 선택`;
  $('cnt-cos').textContent = on.size ? `${on.size}` : '';
  $('cosmetics').replaceChildren(
    ...COSMETICS.map((c) => {
      const b = document.createElement('button');
      b.className = 'item' + (on.has(c.id) ? ' on' : '');
      const tile = document.createElement('div');
      tile.className = 'tile';
      const img = document.createElement('img');
      img.src = Pixel.itemIcon(c.id);
      img.alt = '';
      tile.append(img);
      const n = document.createElement('div');
      n.className = 'item-name';
      n.textContent = c.name;
      const sub = document.createElement('div');
      sub.className = 'item-sub';
      sub.textContent = c.slot;
      b.append(tile, n, sub);
      b.onclick = async () => {
        const next = new Set(on);
        if (next.has(c.id)) next.delete(c.id);
        else {
          next.add(c.id);
          if (c.id === 'tophat') next.delete('crown');
          if (c.id === 'crown') next.delete('tophat');
        }
        await patchSettings({ cosmetics: [...next] });
        applyCosmetics(viewer);
        applyCosmetics(homeViewer);
        renderLoadout();
        renderCosmetics();
        renderSide();
      };
      return b;
    })
  );
}
$('cos-select').onclick = () => {
  selectVersion(state.cosmeticsVersion);
  renderCosmetics();
};


function applyCape() {
  if (!viewer || !state.profile) return;
  const cape = state.profile.capes.find((c) => c.active);
  if (cape) Promise.resolve(viewer.loadCape(cape.url, { backEquipment: currentAnim === 'fly' ? 'elytra' : 'cape' })).catch(() => {});
  else viewer.loadCape(null);
}

function renderWardrobe() {
  const p = state.profile;
  $('wardrobe-locked').hidden = !!p;
  $('wardrobe').hidden = !p;
  if (!p || !$('page-wardrobe').classList.contains('active')) return;

  $('stage-name').textContent = p.name;
  const v = ensureViewer();
  if (p.skin) {
    Promise.resolve(v.loadSkin(p.skin.url, { model: p.skin.variant === 'slim' ? 'slim' : 'default' })).catch(() =>
      toast('스킨 이미지를 불러오지 못했습니다.', true)
    );
    state.variant = p.skin.variant;
  }
  applyCape();
  applyCosmetics(v);
  renderCosmetics();
  document.querySelectorAll('#variant-seg button').forEach((b) => b.classList.toggle('on', b.dataset.variant === state.variant));

  $('cnt-capes').textContent = p.capes.length ? `${p.capes.length}` : '';
  const tiles = [capeTile(null, '없음', !p.capes.some((c) => c.active))];
  for (const c of p.capes) tiles.push(capeTile(c, c.name, c.active));
  if (!p.capes.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '이 계정에는 망토가 없습니다.';
    tiles.push(e);
  }
  $('capes').replaceChildren(...tiles);
}

function capeTile(cape, name, active) {
  const b = document.createElement('button');
  b.className = 'item' + (active ? ' on' : '');
  const tile = document.createElement('div');
  tile.className = 'tile' + (cape ? '' : ' none');
  if (cape) {
    const img = document.createElement('div');
    img.className = 'thumb';
    img.style.backgroundImage = `url("${cape.url}")`;
    tile.append(img);
  } else tile.innerHTML = ICONS.none;
  const label = document.createElement('div');
  label.className = 'item-name';
  label.textContent = name;
  b.append(tile, label);
  b.onclick = async () => {
    if (active) return;
    const p = await guard(() => api.setCape(cape ? cape.id : null));
    if (p) {
      state.profile = p;
      renderWardrobe();
      renderHomeChar();
      toast(cape ? `망토를 '${name}'(으)로 바꿨습니다.` : '망토를 해제했습니다.');
    }
  };
  return b;
}

document.querySelectorAll('#anim-seg button').forEach((b) => (b.onclick = () => setAnim(b.dataset.anim)));
document.querySelectorAll('#variant-seg button').forEach(
  (b) =>
    (b.onclick = () => {
      state.variant = b.dataset.variant;
      document.querySelectorAll('#variant-seg button').forEach((x) => x.classList.toggle('on', x === b));
    })
);

$('btn-skin').onclick = async () => {
  const p = await guard(() => api.uploadSkin(state.variant));
  if (p) {
    state.profile = p;
    renderAccount();
    toast('스킨을 변경했습니다.');
  }
};

// ───────── 설정 ─────────
function renderSettings() {
  const s = state.settings;
  $('ram').max = Math.max(2, Math.min(32, s.totalRam || 16));
  $('ram').value = s.ram;
  $('ram-out').textContent = `${s.ram} GB`;
  $('java-path').value = s.javaPath;
  $('game-dir').value = s.gameDir;
  $('snapshots').checked = s.showSnapshots;
  $('close-on-launch').checked = s.closeOnLaunch;
}

async function patchSettings(patch) {
  const saved = await guard(() => api.setSettings(patch));
  if (saved) {
    state.settings = { ...state.settings, ...saved };
    renderSettings();
  }
}

$('ram').oninput = () => ($('ram-out').textContent = `${$('ram').value} GB`);
$('ram').onchange = () => patchSettings({ ram: Number($('ram').value) });
$('pick-java').onclick = async () => {
  const p = await api.pickJava();
  if (p) patchSettings({ javaPath: p });
};
$('clear-java').onclick = () => patchSettings({ javaPath: '' });
$('pick-dir').onclick = async () => {
  const p = await api.pickDir();
  if (p) patchSettings({ gameDir: p });
};
$('open-dir').onclick = () => api.openGameDir();
$('snapshots').onchange = async () => {
  await patchSettings({ showSnapshots: $('snapshots').checked });
  if (state.versions.length) renderVersions();
};
$('close-on-launch').onchange = () => patchSettings({ closeOnLaunch: $('close-on-launch').checked });
$('version').onchange = () => selectVersion($('version').value);

document.body.dataset.page = 'home';
$('tb-icon').src = Pixel.blockIcon('grass');

async function refreshInstalled() {
  state.installed = await api.listInstalled().catch(() => []);
  if (state.versions.length) renderSide();
}

// ───────── 자동 업데이트 ─────────
let updateReady = false;
api.onUpdate((u) => {
  const pill = $('update-pill');
  const text = $('update-text');
  if (u.state === 'checking') text.textContent = '업데이트 확인 중…';
  else if (u.state === 'latest') text.textContent = `v${state.appVersion} · 최신 버전입니다`;
  else if (u.state === 'error') text.textContent = `v${state.appVersion} · 업데이트를 확인하지 못했습니다`;
  else if (u.state === 'downloading') {
    pill.hidden = false;
    pill.disabled = true;
    pill.classList.remove('ready');
    pill.textContent = `업데이트 다운로드 ${u.pct || 0}%`;
    text.textContent = `v${state.appVersion} · 새 버전 다운로드 중`;
  } else if (u.state === 'ready') {
    updateReady = true;
    pill.hidden = false;
    pill.disabled = false;
    pill.classList.add('ready');
    pill.textContent = `재시작하여 v${u.version} 설치`;
    text.textContent = `v${state.appVersion} · v${u.version} 다운로드 완료, 재시작하면 설치됩니다`;
    
  }
});
$('update-pill').onclick = () => updateReady && guard(() => api.installUpdate());
$('update-check').onclick = async () => {
  const ok = await api.checkUpdate();
  if (!ok) $('update-text').textContent = `v${state.appVersion} · 개발 모드에서는 업데이트를 확인하지 않습니다`;
};

// ───────── 소식 ─────────
async function loadNews() {
  const news = await api.listNews().catch(() => []);
  if (!news || !news.length) {
    $('news-row').replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: '패치 노트를 불러오지 못했습니다.' }));
    return;
  }
  $('news-row').replaceChildren(
    ...news.map((n) => {
      const b = document.createElement('button');
      b.className = 'nrow';
      const th = document.createElement('div');
      th.className = 'nthumb';
      if (n.image) th.style.backgroundImage = `url("${n.image}")`;
      const body = document.createElement('div');
      body.className = 'nbody';
      const title = document.createElement('div');
      title.className = 'ntitle';
      title.textContent = n.title;
      const meta = document.createElement('div');
      meta.className = 'nmeta';
      const tag = document.createElement('span');
      tag.className = 'tag' + (n.type === 'snapshot' ? ' snap' : '');
      tag.textContent = n.type === 'snapshot' ? '스냅샷' : '릴리스';
      const d = n.date ? new Date(n.date) : null;
      meta.append(tag, d && !isNaN(d) ? d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '');
      const text = document.createElement('div');
      text.className = 'ntext';
      text.textContent = n.text;
      body.append(title, meta, text);
      b.append(th, body);
      b.title = `${n.version} 선택`;
      b.onclick = () => {
        if (state.versions.some((v) => v.id === n.version)) selectVersion(n.version);
        else toast('버전 목록에 없는 버전입니다.');
      };
      return b;
    })
  );
}

// ───────── 시작 ─────────
(async function init() {
  drawBanner();
  state.settings = await api.getSettings();
  state.cosmeticsVersion = (await api.cosmeticsInfo()).version;
  state.appVersion = await api.appVersion();
  $('update-text').textContent = `v${state.appVersion}`;
  renderSettings();
  loadNews();
  renderAccount();

  setStatus('버전 목록 불러오는 중…', null);
  const [list, profile] = await Promise.all([guard(() => api.listVersions()), api.restore().catch(() => null)]);
  state.installed = await api.listInstalled().catch(() => []);
  if (list) {
    state.versions = list.versions;
    state.latest = list.latest;
    renderVersions();
    setStatus('대기 중', 0);
  } else {
    setStatus('버전 목록을 불러오지 못했습니다. 인터넷 연결을 확인하세요.', 0);
  }
  if (profile) state.profile = profile;
  renderAccount();
})();
