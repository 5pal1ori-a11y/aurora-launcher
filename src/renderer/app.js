/* global skinview3d, api, Pixel */
// window.api 는 preload.js 가 노출한 전역입니다.
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const state = {
  profile: null,
  settings: null,
  versions: [],
  installed: [],
  latest: null,
  version: null, // 선택된 버전 id
  busy: false,
  variant: 'classic',
  verFilter: 'release',
  pings: {},
};
let viewer = null;

// ───────── 공통 ─────────
function toast(msg, isError = false) {
  const t = el('div', 'toast' + (isError ? ' error' : ''));
  t.append(el('span', '', msg));
  $('toasts').append(t);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, isError ? 6000 : 3500);
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

// ───────── 메뉴 / 페이지 전환 ─────────
function go(page) {
  document.querySelectorAll('.rail-items .nav').forEach((n, i) => {
    const on = n.dataset.page === page;
    n.classList.toggle('active', on);
    if (on) $('rail-ind').style.transform = `translateY(${i * 50}px)`;
  });
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  closeVerMenu();
  if (page === 'wardrobe') renderWardrobe();
  if (page === 'home') drawBanner();
  if (page === 'servers') renderServers(true);
}
document.querySelectorAll('.rail-items .nav').forEach((b) => (b.onclick = () => go(b.dataset.page)));
$('btn-min').onclick = () => api.minimize();
$('btn-close').onclick = () => api.close();
$('sc-dir').onclick = () => api.openGameDir();

// 아이콘 메뉴 툴팁
document.querySelectorAll('[data-tip]').forEach((b) => {
  b.addEventListener('mouseenter', () => {
    const r = b.getBoundingClientRect();
    const tip = $('tip');
    tip.textContent = b.dataset.tip;
    tip.style.left = `${r.right + 10}px`;
    tip.style.top = `${r.top + r.height / 2 - 13}px`;
    tip.classList.add('show');
  });
  b.addEventListener('mouseleave', () => $('tip').classList.remove('show'));
});

// ───────── 계정 ─────────
function renderAccount() {
  const p = state.profile;
  $('acc-name').textContent = p ? p.name : '로그인 필요';
  $('acc-sub').textContent = p ? '정품 계정' : '오프라인';
  $('acc-dot').classList.toggle('on', !!p);
  $('acc-action').textContent = p ? '로그아웃' : '로그인';
  $('acc-head').style.background = p && p.skin ? `url("${p.skin.url}") 14.2857% 14.2857% / 800% 800%` : '';
  const h = new Date().getHours();
  const hello = h < 6 ? '늦은 밤이에요' : h < 12 ? '좋은 아침이에요' : h < 18 ? '좋은 오후예요' : '좋은 저녁이에요';
  $('greet-title').textContent = p ? `${hello}, ${p.name}` : 'Aurora';
  $('greet-sub').textContent = p ? 'Minecraft: Java Edition' : '플레이하려면 Microsoft 계정으로 로그인하세요';
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

// ───────── 버전 선택 메뉴 ─────────
const versionType = (id) => (state.versions.find((v) => v.id === id) || {}).type;
const blockFor = (id) => Pixel.blockIcon(versionType(id) === 'snapshot' ? 'stone' : id === state.cosmeticsVersion ? 'log' : 'grass');

function selectVersion(id) {
  if (state.busy || !state.versions.some((v) => v.id === id)) return;
  state.version = id;
  patchSettings({ lastVersion: id });
  renderVersion();
}

function renderVersion() {
  const id = state.version;
  if (!id) return;
  $('ver-icon').src = blockFor(id);
  const hist = state.settings.history || {};
  const bits = [versionType(id) === 'snapshot' ? '스냅샷' : '릴리스'];
  if (id === state.latest.release) bits.push('최신');
  $('ver-name').textContent = `${id} · ${bits.join(' · ')}`;
  const sub = [];
  if (hist[id]) sub.push(`마지막 플레이 ${ago(hist[id])}`);
  else if (!state.installed.includes(id)) sub.push('처음 실행 시 내려받음');
  if (id === state.cosmeticsVersion && state.settings.cosmetics.length) sub.push('치장품 켜짐');
  if (!state.busy) $('play-sub').textContent = sub.join(' · ') || `Minecraft ${id}`;
}

function renderVerList() {
  const q = $('ver-search').value.trim().toLowerCase();
  const hist = state.settings.history || {};
  let list = state.versions;
  if (state.verFilter === 'release') list = list.filter((v) => v.type === 'release');
  else if (state.verFilter === 'snapshot') list = list.filter((v) => v.type === 'snapshot');
  else list = list.filter((v) => state.installed.includes(v.id));
  if (q) list = list.filter((v) => v.id.toLowerCase().includes(q));
  list = list.slice(0, 120);
  if (!list.length) return $('ver-list').replaceChildren(el('div', 'ver-empty', '해당하는 버전이 없습니다.'));
  $('ver-list').replaceChildren(
    ...list.map((v) => {
      const b = el('button', 'vrow' + (v.id === state.version ? ' on' : ''));
      const img = el('img');
      img.src = blockFor(v.id);
      img.alt = '';
      const note = v.id === state.latest.release ? '최신' : hist[v.id] ? ago(hist[v.id]) : state.installed.includes(v.id) ? '설치됨' : '';
      b.append(img, el('b', '', v.id), el('small', '', note));
      b.onclick = () => {
        selectVersion(v.id);
        closeVerMenu();
      };
      return b;
    })
  );
}

function openVerMenu() {
  $('ver-menu').hidden = false;
  $('ver-pill').classList.add('open');
  $('ver-search').value = '';
  renderVerList();
  setTimeout(() => $('ver-search').focus(), 30);
}
function closeVerMenu() {
  $('ver-menu').hidden = true;
  $('ver-pill').classList.remove('open');
}
$('ver-pill').onclick = (e) => {
  e.stopPropagation();
  $('ver-menu').hidden ? openVerMenu() : closeVerMenu();
};
$('ver-menu').onclick = (e) => e.stopPropagation();
document.addEventListener('click', closeVerMenu);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeVerMenu());
$('ver-search').oninput = renderVerList;
document.querySelectorAll('#ver-tabs button').forEach(
  (b) =>
    (b.onclick = () => {
      state.verFilter = b.dataset.f;
      document.querySelectorAll('#ver-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      renderVerList();
    })
);

// ───────── 플레이 ─────────
function updatePlayButton() {
  if (state.busy) return;
  const btn = $('btn-play');
  btn.disabled = !state.versions.length;
  btn.classList.remove('busy', 'indeterminate');
  $('bar-fill').style.width = '0';
  $('play-label').textContent = state.profile ? '플레이' : '로그인';
  $('ver-pill').disabled = false;
  renderVersion();
}

function setStatus(text, pct) {
  $('status-text').textContent = text;
  const btn = $('btn-play');
  btn.classList.toggle('indeterminate', state.busy && pct === null);
  if (typeof pct === 'number') $('bar-fill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function setBusy(busy, label, sub = '') {
  state.busy = busy;
  const btn = $('btn-play');
  btn.disabled = busy;
  btn.classList.toggle('busy', busy);
  $('ver-pill').disabled = busy;
  if (busy) {
    $('play-label').textContent = label;
    $('play-sub').textContent = sub;
    closeVerMenu();
  } else updatePlayButton();
}

async function launch(server) {
  if (!state.profile) return login();
  if (state.busy) return;
  $('log').textContent = '';
  $('status-text').classList.remove('err');
  setBusy(true, '준비 중', server ? `${server} 접속 예정` : '');
  setStatus('준비 중…', null);
  if (homeViewer) homeViewer.animation = ANIMS.run();
  const ok = await guard(() => api.launch(state.version, server || null));
  if (!ok) {
    setBusy(false);
    setStatus('대기 중', 0);
    if (homeViewer) homeViewer.animation = ANIMS.idle();
  }
}
$('btn-play').onclick = () => launch();

$('log-toggle').onclick = () => ($('logpanel').hidden = !$('logpanel').hidden);
$('log-close').onclick = () => ($('logpanel').hidden = true);
$('log-open').onclick = () => api.openLog();

const TASK_NAMES = { assets: '에셋', natives: '네이티브', classes: '라이브러리', 'classes-custom': '라이브러리', 'classes-maven-custom': '라이브러리', 'assets-copy': '에셋 복사' };

api.onProgress((p) => {
  const pct = p.total ? Math.round((p.task / p.total) * 100) : 0;
  $('play-label').textContent = `${pct}%`;
  $('play-sub').textContent = `${TASK_NAMES[p.type] || p.type} 다운로드 중`;
  setStatus(`${TASK_NAMES[p.type] || p.type} ${p.task.toLocaleString()} / ${p.total.toLocaleString()}`, pct);
});

api.onState((s) => {
  if (s.state === 'preparing' || s.state === 'downloading') {
    setBusy(true, typeof s.pct === 'number' ? `${s.pct}%` : '준비 중', s.text);
    setStatus(s.text + (typeof s.pct === 'number' ? ` ${s.pct}%` : ''), typeof s.pct === 'number' ? s.pct : null);
  } else if (s.state === 'running') {
    setBusy(true, '실행 중', `Minecraft ${state.version}`);
    setStatus('게임이 실행 중입니다', 100);
    if (homeViewer) homeViewer.animation = ANIMS.walk();
  } else {
    setBusy(false);
    refreshInstalled();
    if (homeViewer) homeViewer.animation = ANIMS.idle();
    setStatus(s.code ? (s.hint || `게임이 비정상 종료됐습니다 (코드 ${s.code})`).split('\n')[0] : '대기 중', 0);
    $('status-text').classList.toggle('err', !!s.code);
    if (s.code) {
      $('logpanel').hidden = false;
      $('log').scrollTop = $('log').scrollHeight;
    }
  }
});

api.onAppError((msg) => {
  toast(msg, true);
  setStatus(msg, 0);
  $('status-text').classList.add('err');
});

api.onLog((line) => {
  const log = $('log');
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
  log.textContent = (log.textContent + line.replace(/\n?$/, '\n')).slice(-20000);
  if (stick) log.scrollTop = log.scrollHeight;
});

// ───────── 3D 캐릭터 ─────────
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  none: svg('<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};
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
const CHAR_W = 190;
const CHAR_H = 260;
const CHAR_FOOT = 40;
function drawBanner() {
  if (!$('banner').clientHeight) return; // 다른 페이지에 있을 때
  if (banner) banner.stop();
  banner = Pixel.scene($('scene'), { charX: 0.24 });
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
  $('home-canvas').hidden = !(p && p.skin);
  if (!p || !p.skin) return;
  const canvas = $('home-canvas');
  if (!homeViewer) {
    homeViewer = new skinview3d.SkinViewer({ canvas, width: CHAR_W, height: CHAR_H });
    homeViewer.fov = 30;
    homeViewer.zoom = 0.82;
    homeViewer.animation = ANIMS.idle();
    homeViewer.controls.enabled = false;
    homeViewer.playerObject.rotation.y = 0.55;
    homeViewer.globalLight.intensity = 2.4;
    homeViewer.cameraLight.intensity = 0.9;
  }
  Promise.resolve(homeViewer.loadSkin(p.skin.url, { model: p.skin.variant === 'slim' ? 'slim' : 'default' })).catch(() => {});
  const cape = p.capes.find((c) => c.active);
  if (cape) Promise.resolve(homeViewer.loadCape(cape.url)).catch(() => {});
  else homeViewer.loadCape(null);
  applyCosmetics(homeViewer);
}

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
  v.playerObject.traverse((o) => {
    if (!sample && o.isMesh) sample = o;
  });
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
  let top = 8;
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

// ───────── 옷장 ─────────
function ensureViewer() {
  if (viewer) return viewer;
  const canvas = $('skin-canvas');
  viewer = new skinview3d.SkinViewer({ canvas, width: canvas.clientWidth, height: canvas.clientHeight });
  viewer.fov = 45;
  viewer.zoom = 0.42;
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
  v.zoom = name === 'fly' ? 0.32 : 0.42;
  applyCape();
  document.querySelectorAll('#anim-seg button').forEach((b) => b.classList.toggle('on', b.dataset.anim === name));
}

function moveTabInd() {
  const on = document.querySelector('#tabs button.on');
  if (!on) return;
  $('tab-ind').style.left = `${on.offsetLeft + 10}px`;
  $('tab-ind').style.width = `${on.offsetWidth - 20}px`;
}
document.querySelectorAll('#tabs button').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('on', x.id === `tab-${b.dataset.tab}`));
      moveTabInd();
      if (b.dataset.tab === 'cosmetics') renderCosmetics();
    })
);

const stagger = (nodes) => nodes.forEach((n, i) => (n.style.animationDelay = `${i * 45}ms`));

function renderCosmetics() {
  const on = new Set(state.settings.cosmetics || []);
  const ver = state.cosmeticsVersion;
  $('cos-notice').hidden = state.version === ver;
  $('cos-notice-title').textContent = `치장품은 ${ver} 에서만 적용됩니다. 현재 선택: ${state.version}`;
  $('cos-select').textContent = `${ver} 선택`;
  $('cnt-cos').textContent = on.size ? `${on.size}` : '';
  const tiles = COSMETICS.map((c) => {
    const b = el('button', 'item' + (on.has(c.id) ? ' on' : ''));
    const tile = el('div', 'tile');
    const img = el('img');
    img.src = Pixel.itemIcon(c.id);
    img.alt = '';
    tile.append(img);
    b.append(tile, el('div', 'item-name', c.name), el('div', 'item-sub', c.slot));
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
      renderCosmetics();
      renderVersion();
    };
    return b;
  });
  stagger(tiles);
  $('cosmetics').replaceChildren(...tiles);
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
  requestAnimationFrame(moveTabInd);

  $('cnt-capes').textContent = p.capes.length ? `${p.capes.length}` : '';
  const tiles = [capeTile(null, '없음', !p.capes.some((c) => c.active))];
  for (const c of p.capes) tiles.push(capeTile(c, c.name, c.active));
  stagger(tiles);
  if (!p.capes.length) tiles.push(el('div', 'foot', '이 계정에는 망토가 없습니다.'));
  $('capes').replaceChildren(...tiles);
}

function capeTile(cape, name, active) {
  const b = el('button', 'item' + (active ? ' on' : ''));
  const tile = el('div', 'tile' + (cape ? '' : ' none'));
  if (cape) {
    const img = el('div', 'thumb');
    img.style.backgroundImage = `url("${cape.url}")`;
    tile.append(img);
  } else tile.innerHTML = ICONS.none;
  b.append(tile, el('div', 'item-name', name));
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

// ───────── 서버 ─────────
const servers = () => (state.settings && state.settings.servers) || [];

function pingBars(ms) {
  const b = el('span', 'bars ' + (ms == null ? '' : ms < 80 ? 'g' : ms < 200 ? 'y' : 'r'));
  const n = ms == null ? 0 : ms < 80 ? 4 : ms < 150 ? 3 : ms < 250 ? 2 : 1;
  for (let i = 0; i < 4; i++) b.append(el('i', i < n ? 'on' : ''));
  return b;
}

function serverRow(s, compact) {
  const p = state.pings[s.address];
  const row = el('div', 'srv');
  const icon = el('div', 'srv-icon');
  icon.style.backgroundImage = `url("${(p && p.favicon) || Pixel.blockIcon('grass')}")`;
  const main = el('div', 'srv-main');
  main.append(el('div', 'srv-name', s.name));
  const meta = el('div', 'srv-meta');
  if (!p) meta.append(el('span', '', '확인 중…'));
  else if (!p.online) meta.append(el('span', '', '오프라인'));
  else {
    meta.append(pingBars(p.latency), el('span', '', `${p.latency}ms`));
    if (p.players) meta.append(el('span', '', `${p.players.online.toLocaleString()} / ${p.players.max.toLocaleString()}명`));
  }
  if (!compact) main.append(el('div', 'srv-motd', p && p.online ? p.motd || s.address : s.address));
  main.append(meta);
  const join = el('button', 'srv-join', '접속');
  join.onclick = () => {
    go('home');
    launch(s.address);
  };
  row.append(icon, main, join);
  if (!compact) {
    const del = el('button', 'srv-del');
    del.innerHTML = ICONS.x;
    del.title = '삭제';
    del.onclick = async () => {
      await patchSettings({ servers: servers().filter((x) => x.address !== s.address) });
      renderServers();
    };
    row.append(del);
  }
  return row;
}

function renderServers(refresh) {
  const list = servers();
  const empty = () => {
    const e = el('div', 'srv-empty', '저장된 서버가 없습니다.');
    const b = el('button', 'btn', '서버 추가');
    b.onclick = () => {
      go('servers');
      showServerForm();
    };
    e.append(el('br'), b);
    return e;
  };
  const quick = list.slice(0, 4).map((s) => serverRow(s, true));
  stagger(quick);
  $('srv-quick').replaceChildren(...(quick.length ? quick : [empty()]));
  const full = list.map((s) => serverRow(s, false));
  stagger(full);
  $('srv-list').replaceChildren(...(full.length ? full : [empty()]));
  if (refresh) pingAll();
}

async function pingAll() {
  await Promise.all(
    servers().map(async (s) => {
      state.pings[s.address] = await api.pingServer(s.address).catch(() => ({ online: false }));
    })
  );
  renderServers(false);
}

function showServerForm() {
  $('srv-form').hidden = false;
  $('srv-name').value = '';
  $('srv-addr').value = '';
  setTimeout(() => $('srv-addr').focus(), 30);
}
$('srv-add-btn').onclick = showServerForm;
$('srv-cancel').onclick = () => ($('srv-form').hidden = true);
$('srv-more').onclick = () => go('servers');
$('srv-form').onsubmit = async (e) => {
  e.preventDefault();
  const address = $('srv-addr').value.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i.test(address)) {
    return toast('서버 주소 형식이 올바르지 않습니다.', true);
  }
  if (servers().some((s) => s.address === address)) return toast('이미 추가된 서버입니다.', true);
  const name = $('srv-name').value.trim() || address;
  await patchSettings({ servers: [...servers(), { name, address }] });
  $('srv-form').hidden = true;
  renderServers(true);
  toast(`'${name}' 서버를 추가했습니다.`);
};

// ───────── 설정 ─────────
function renderSettings() {
  const s = state.settings;
  $('ram').max = Math.max(2, Math.min(32, s.totalRam || 16));
  $('ram').value = s.ram;
  $('ram-out').textContent = `${s.ram} GB`;
  $('ram-chip-text').textContent = `${s.ram} GB`;
  $('java-path').value = s.javaPath;
  $('game-dir').value = s.gameDir;
  $('disk-free').textContent = s.freeGb == null ? '' : `${s.drive} 드라이브 남은 공간 ${s.freeGb} GB` + (s.freeGb < 2 ? ' · 부족합니다' : '');
  $('disk-free').classList.toggle('warn', s.freeGb != null && s.freeGb < 2);
  $('snapshots').checked = s.showSnapshots;
  $('close-on-launch').checked = s.closeOnLaunch;
  $('reduce-motion').checked = !!s.reduceMotion;
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.querySelector('#ver-tabs [data-f="snapshot"]').hidden = !s.showSnapshots;
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
  if (p) {
    await patchSettings({ gameDir: p });
    state.settings = { ...state.settings, ...(await api.getSettings()) };
    renderSettings();
    refreshInstalled();
  }
};
$('open-dir').onclick = () => api.openGameDir();
$('snapshots').onchange = () => patchSettings({ showSnapshots: $('snapshots').checked });
$('close-on-launch').onchange = () => patchSettings({ closeOnLaunch: $('close-on-launch').checked });
$('reduce-motion').onchange = () => patchSettings({ reduceMotion: $('reduce-motion').checked });

async function refreshInstalled() {
  state.installed = await api.listInstalled().catch(() => []);
  if (state.versions.length) renderVersion();
}

// ───────── 자동 업데이트 ─────────
let updateReady = false;
api.onUpdate((u) => {
  const pill = $('update-pill');
  const text = $('update-text');
  if (u.state === 'checking') text.textContent = `v${state.appVersion} · 업데이트 확인 중…`;
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
    $('news-row').replaceChildren(el('div', 'news-empty', '소식을 불러오지 못했습니다.'));
    return;
  }
  const cards = news.map((n) => {
    const b = el('button', 'ncard');
    const img = el('div', 'ncard-img');
    if (n.image) img.style.backgroundImage = `url("${n.image}")`;
    const body = el('div', 'ncard-body');
    body.append(el('span', 'ncard-tag' + (n.type === 'snapshot' ? ' snap' : ''), n.version || (n.type === 'snapshot' ? '스냅샷' : '릴리스')));
    body.append(el('div', 'ncard-title', n.title));
    const d = n.date ? new Date(n.date) : null;
    if (d && !isNaN(d)) body.append(el('div', 'ncard-date', d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })));
    b.append(img, body);
    b.title = n.text || n.title;
    b.onclick = () => {
      if (state.versions.some((v) => v.id === n.version)) {
        selectVersion(n.version);
        toast(`${n.version} 버전을 선택했습니다.`);
      } else toast('버전 목록에 없는 버전입니다.');
    };
    return b;
  });
  cards.forEach((c, i) => (c.style.animationDelay = `${i * 70}ms`));
  $('news-row').replaceChildren(...cards);
}
$('news-prev').onclick = () => $('news-row').scrollBy({ left: -250 });
$('news-next').onclick = () => $('news-row').scrollBy({ left: 250 });

// ───────── 시작 ─────────
(async function init() {
  const started = Date.now();

  state.settings = await api.getSettings();
  state.cosmeticsVersion = (await api.cosmeticsInfo()).version;
  state.appVersion = await api.appVersion();
  $('update-text').textContent = `v${state.appVersion}`;
  renderSettings();
  renderAccount();
  renderServers(true);
  loadNews();

  const [list, profile] = await Promise.all([guard(() => api.listVersions()), api.restore().catch(() => null)]);
  state.installed = await api.listInstalled().catch(() => []);
  if (list) {
    state.versions = list.versions;
    state.latest = list.latest;
    const want = state.settings.lastVersion;
    state.version = state.versions.some((v) => v.id === want) ? want : list.latest.release;
    setStatus('대기 중', 0);
  } else {
    setStatus('버전 목록을 불러오지 못했습니다. 인터넷 연결을 확인하세요.', 0);
  }
  if (profile) state.profile = profile;
  renderAccount();

  // 시작 화면은 최소 0.8초 보여 준 뒤 사라짐
  setTimeout(() => {
    document.body.classList.remove('booting');
    drawBanner();
  }, Math.max(0, 800 - (Date.now() - started)));
})();
