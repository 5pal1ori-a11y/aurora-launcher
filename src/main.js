// Aurora Launcher - 메인 프로세스
// 비공식 런처입니다. Mojang / Microsoft 와 관련이 없으며,
// 정품 계정 로그인 + 공식 서버 다운로드만 사용합니다.
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ensureJava, javaMajorOf } = require('./java');
const { verifyVersion, explainLog } = require('./repair');
const { ping } = require('./ping');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MC_API = 'https://api.minecraftservices.com/minecraft/profile';
const NEWS_URL = 'https://launchercontent.mojang.com/v2/javaPatchNotes.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader';

// 치장품 모드(Fabric)가 지원하는 게임 버전과 치장품 목록
const COSMETICS_VERSION = '1.21.1';
const COSMETIC_IDS = ['tophat', 'crown', 'halo', 'wings'];
const SERVER_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
const MOD_JAR = path.join(__dirname, 'assets', 'aurora-cosmetics.jar');

let win = null;
let mcToken = null; // msmc Minecraft 객체 (로그인 상태)
let manifestCache = null;
let gameRunning = false;

// ───────────── 설정 ─────────────
const userDir = () => app.getPath('userData');
const settingsFile = () => path.join(userDir(), 'settings.json');
const tokenFile = () => path.join(userDir(), 'session.bin');

function defaultSettings() {
  const totalGb = Math.floor(os.totalmem() / 1024 ** 3);
  return {
    ram: Math.max(2, Math.min(4, Math.floor(totalGb / 2))),
    javaPath: '',
    gameDir: path.join(app.getPath('appData'), '.aurora-launcher'),
    lastVersion: '',
    showSnapshots: false,
    closeOnLaunch: false,
    cosmetics: [],
    history: {}, // 버전별 마지막 플레이 시각 (ms)
    servers: [], // { name, address }
    reduceMotion: false,
  };
}

function loadSettings() {
  try {
    return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(patch) {
  const allowed = Object.keys(defaultSettings());
  const next = loadSettings();
  for (const k of allowed) if (patch && k in patch) next[k] = patch[k];
  next.ram = Math.max(1, Math.min(64, Number(next.ram) || 4));
  next.reduceMotion = !!next.reduceMotion;
  const hist = next.history && typeof next.history === 'object' ? next.history : {};
  next.history = Object.fromEntries(
    Object.entries(hist)
      .filter(([k, v]) => typeof k === 'string' && k.length < 64 && Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
  );
  next.servers = (Array.isArray(next.servers) ? next.servers : [])
    .filter((s) => s && typeof s.address === 'string' && SERVER_RE.test(s.address.trim()))
    .slice(0, 20)
    .map((s) => ({ name: String(s.name || s.address).trim().slice(0, 40), address: s.address.trim().toLowerCase() }));
  next.cosmetics = Array.isArray(next.cosmetics) ? COSMETIC_IDS.filter((id) => next.cosmetics.includes(id)) : [];
  if (next.cosmetics.includes('tophat') && next.cosmetics.includes('crown')) {
    next.cosmetics = next.cosmetics.filter((id) => id !== 'crown'); // 머리에는 하나만
  }
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

// ───────────── 로그인 (Microsoft 정품 계정) ─────────────
// 리프레시 토큰은 OS 보안 저장소(Windows DPAPI)로 암호화해서 보관합니다.
function saveRefreshToken(token) {
  if (!safeStorage.isEncryptionAvailable()) return; // 암호화 불가 시 저장하지 않음
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token));
}

function loadRefreshToken() {
  try {
    return safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch {
    return null;
  }
}

async function getAuthLib() {
  return require('msmc').Auth;
}

async function mcApi(method, suffix = '', body, headers = {}) {
  if (!mcToken) throw new Error('로그인이 필요합니다.');
  const res = await fetch(MC_API + suffix, {
    method,
    body,
    headers: { Authorization: `Bearer ${mcToken.mcToken}`, ...headers },
  });
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try {
      const j = await res.json();
      if (j.errorMessage) msg = j.errorMessage;
    } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const https = (u) => (u ? u.replace(/^http:/, 'https:') : u);

function shapeProfile(p) {
  const skin = (p.skins || []).find((s) => s.state === 'ACTIVE') || (p.skins || [])[0];
  return {
    id: p.id,
    name: p.name,
    skin: skin ? { url: https(skin.url), variant: (skin.variant || 'CLASSIC').toLowerCase() } : null,
    capes: (p.capes || []).map((c) => ({
      id: c.id,
      name: c.alias || '망토',
      url: https(c.url),
      active: c.state === 'ACTIVE',
    })),
  };
}

async function fetchProfile() {
  return shapeProfile(await mcApi('GET'));
}

async function finishLogin(xbox) {
  mcToken = await xbox.getMinecraft();
  if (!mcToken.profile || !mcToken.profile.id) {
    mcToken = null;
    throw new Error('이 계정에는 Minecraft: Java Edition 라이선스가 없습니다.');
  }
  saveRefreshToken(xbox.save());
  return fetchProfile();
}

ipcMain.handle('auth:login', async () => {
  const Auth = await getAuthLib();
  const auth = new Auth('select_account');
  const xbox = await auth.launch('electron', { width: 500, height: 650, resizable: false });
  return finishLogin(xbox);
});

ipcMain.handle('auth:restore', async () => {
  const rt = loadRefreshToken();
  if (!rt) return null;
  try {
    const Auth = await getAuthLib();
    return await finishLogin(await new Auth().refresh(rt));
  } catch {
    return null; // 만료됨 → 다시 로그인
  }
});

ipcMain.handle('auth:logout', async () => {
  mcToken = null;
  fs.rmSync(tokenFile(), { force: true });
  return true;
});

// ───────────── 옷장: 스킨 / 망토 (공식 API) ─────────────
ipcMain.handle('profile:get', fetchProfile);

ipcMain.handle('cape:set', async (_e, capeId) => {
  if (capeId === null) {
    await mcApi('DELETE', '/capes/active');
  } else {
    if (typeof capeId !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(capeId)) throw new Error('잘못된 망토입니다.');
    await mcApi('PUT', '/capes/active', JSON.stringify({ capeId }), { 'Content-Type': 'application/json' });
  }
  return fetchProfile();
});

ipcMain.handle('skin:upload', async (_e, variant) => {
  const r = await dialog.showOpenDialog(win, {
    title: '스킨 파일 선택 (64x64 PNG)',
    filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const buf = fs.readFileSync(r.filePaths[0]);
  if (buf.length > 1024 * 1024) throw new Error('스킨 파일이 너무 큽니다.');
  const form = new FormData();
  form.append('variant', variant === 'slim' ? 'slim' : 'classic');
  form.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  await mcApi('POST', '/skins', form);
  return fetchProfile();
});

// ───────────── 버전 목록 ─────────────
async function getManifest() {
  if (manifestCache) return manifestCache;
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error('버전 목록을 불러오지 못했습니다.');
  manifestCache = await res.json();
  return manifestCache;
}

ipcMain.handle('versions:list', async () => {
  const m = await getManifest();
  return {
    latest: m.latest,
    versions: m.versions
      .filter((v) => v.type === 'release' || v.type === 'snapshot')
      .map((v) => ({ id: v.id, type: v.type, date: v.releaseTime })),
  };
});

// 게임 폴더에 이미 받아 둔 버전 목록
ipcMain.handle('versions:installed', () => {
  const dir = path.join(loadSettings().gameDir, 'versions');
  try {
    return fs
      .readdirSync(dir)
      .filter((id) => fs.existsSync(path.join(dir, id, `${id}.json`)) && fs.existsSync(path.join(dir, id, `${id}.jar`)));
  } catch {
    return [];
  }
});

// ───────────── 소식 (공식 패치 노트 피드) ─────────────
ipcMain.handle('news:list', async () => {
  try {
    const res = await fetch(NEWS_URL);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.entries || []).slice(0, 4).map((e) => ({
      title: String(e.title || ''),
      version: String(e.version || ''),
      type: String(e.type || ''),
      date: String(e.date || ''),
      text: String(e.shortText || ''),
      image: e.image && e.image.url ? new URL(e.image.url, NEWS_URL).href : null,
    }));
  } catch {
    return [];
  }
});

// ───────────── 치장품 모드 (Fabric) ─────────────
function writeCosmeticsConfig(settings) {
  fs.mkdirSync(settings.gameDir, { recursive: true });
  fs.writeFileSync(path.join(settings.gameDir, 'aurora-cosmetics.json'), JSON.stringify({ enabled: settings.cosmetics }));
}

// Fabric 로더 프로필을 내려받고 모드 파일을 mods 폴더에 넣은 뒤, 실행할 커스텀 버전 이름을 돌려줍니다.
async function prepareCosmetics(settings) {
  const loaders = await (await fetch(`${FABRIC_META}/${COSMETICS_VERSION}`)).json();
  const pick = loaders.find((l) => l.loader.stable) || loaders[0];
  if (!pick) throw new Error('Fabric 로더 정보를 찾지 못했습니다.');
  const loader = pick.loader.version;
  if (!/^[\w.+-]+$/.test(loader)) throw new Error('Fabric 로더 버전이 올바르지 않습니다.');

  const id = `fabric-loader-${loader}-${COSMETICS_VERSION}`;
  const dir = path.join(settings.gameDir, 'versions', id);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${FABRIC_META}/${COSMETICS_VERSION}/${loader}/profile/json`);
    if (!res.ok) throw new Error('Fabric 프로필을 내려받지 못했습니다.');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, await res.text());
  }
  const mods = path.join(settings.gameDir, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  fs.writeFileSync(path.join(mods, 'aurora-cosmetics.jar'), fs.readFileSync(MOD_JAR));
  return id;
}

ipcMain.handle('cosmetics:info', () => ({ version: COSMETICS_VERSION, available: fs.existsSync(MOD_JAR) }));

// ───────────── 충돌 진단 ─────────────
const CRASH_HINTS = {
  3221225477: '게임이 메모리 접근 오류(0xC0000005)로 강제 종료됐습니다. 그래픽 드라이버를 최신으로 업데이트하고, 화면 오버레이 프로그램(디스코드 오버레이, 애프터버너 등)을 끈 뒤 다시 시도해 보세요.',
  3221225781: '필요한 시스템 파일(DLL)이 없습니다. Microsoft Visual C++ 재배포 패키지를 설치해 주세요.',
  1: '게임이 오류로 종료됐습니다. 실행 로그를 확인해 주세요.',
};

// 자바가 죽으면서 남긴 hs_err_pid*.log 에서 원인이 된 모듈을 찾아냅니다.
function findJvmCrash(gameDir, since) {
  try {
    const files = fs
      .readdirSync(gameDir)
      .filter((f) => /^hs_err_pid\d+\.log$/.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(gameDir, f)).mtimeMs }))
      .filter((x) => x.t >= since)
      .sort((a, b) => b.t - a.t);
    if (!files.length) return null;
    const lines = fs.readFileSync(path.join(gameDir, files[0].f), 'utf8').split(/\r?\n/).slice(0, 60);
    const i = lines.findIndex((l) => l.includes('Problematic frame'));
    return { file: path.join(gameDir, files[0].f), frame: i >= 0 ? (lines[i + 1] || '').replace(/^#\s*/, '').trim() : '' };
  } catch {
    return null;
  }
}

// ───────────── 저장 공간 ─────────────
// 폴더가 있는 드라이브의 남은 공간(바이트). 폴더가 아직 없으면 있는 상위 폴더로 확인합니다.
function freeBytes(dir) {
  let p = path.resolve(dir);
  while (!fs.existsSync(p) && path.dirname(p) !== p) p = path.dirname(p);
  try {
    const s = fs.statfsSync(p);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}
const gb = (b) => (b / 1024 ** 3).toFixed(1);
const driveOf = (dir) => (process.platform === 'win32' ? path.parse(path.resolve(dir)).root.replace(/\\$/, '') : path.parse(path.resolve(dir)).root);
const MIN_FREE = 2 * 1024 ** 3; // 새 버전 + Java 를 받으려면 대략 이 정도 필요

function diskFullMessage(dir) {
  const free = freeBytes(dir);
  return (
    `저장 공간이 부족합니다 (${driveOf(dir)} 드라이브` +
    (free !== null ? `, 남은 공간 ${gb(free)} GB` : '') +
    `). 공간을 비우거나 설정에서 게임 폴더를 다른 드라이브로 옮겨 주세요.`
  );
}

// 처리하지 못한 오류가 나도 영어 오류 창으로 멈추지 않고 런처 화면에 알려 줍니다.
process.on('uncaughtException', (err) => {
  const msg = err && err.code === 'ENOSPC' ? diskFullMessage(loadSettings().gameDir) : `예상하지 못한 오류: ${(err && err.message) || err}`;
  console.error(err);
  if (gameRunning && !gameProcessStarted) gameRunning = false;
  send('game:state', { state: 'idle' });
  send('app:error', msg);
});
process.on('unhandledRejection', (err) => console.error(err));

let gameProcessStarted = false;

// ───────────── 게임 실행 ─────────────
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

ipcMain.handle('server:ping', async (_e, address) => {
  if (typeof address !== 'string' || !SERVER_RE.test(address)) return { online: false };
  try {
    return await ping(address);
  } catch {
    return { online: false };
  }
});

ipcMain.handle('game:launch', async (_e, versionId, server) => {
  if (server != null && (typeof server !== 'string' || !SERVER_RE.test(server))) throw new Error('서버 주소가 올바르지 않습니다.');
  if (gameRunning) throw new Error('게임이 이미 실행 중입니다.');
  if (!mcToken) throw new Error('먼저 로그인해 주세요.');
  const manifest = await getManifest();
  const version = manifest.versions.find((v) => v.id === versionId);
  if (!version) throw new Error('알 수 없는 버전입니다.');

  const free = freeBytes(loadSettings().gameDir);
  if (free !== null && free < MIN_FREE) throw new Error(diskFullMessage(loadSettings().gameDir));

  gameRunning = true;
  gameProcessStarted = false;
  try {
    const settings = saveSettings({ lastVersion: versionId, history: { ...loadSettings().history, [versionId]: Date.now() } });
    send('game:state', { state: 'preparing', text: 'Java 확인 중…' });

    const meta = await (await fetch(version.url)).json();
    const javaMajor = (meta.javaVersion && meta.javaVersion.majorVersion) || 8;
    let javaPath;
    if (settings.javaPath) {
      // 직접 지정한 Java 가 실행되는지, 이 버전에 맞는지 확인
      const have = javaMajorOf(settings.javaPath);
      if (have === null) {
        throw new Error('설정에서 지정한 Java 가 실행되지 않습니다. 설정 → Java 에서 "초기화"를 누르면 자동으로 맞는 Java 를 사용합니다.');
      }
      if (have < javaMajor) {
        throw new Error(`Minecraft ${version.id} 은(는) Java ${javaMajor} 이상이 필요한데, 설정한 Java 는 ${have} 입니다. 설정 → Java 에서 "초기화"를 눌러 주세요.`);
      }
      javaPath = settings.javaPath;
    } else {
      javaPath = await ensureJava(javaMajor, path.join(userDir(), 'runtime'), (text, pct) =>
        send('game:state', { state: 'preparing', text, pct })
      );
    }

    // 토큰이 만료됐으면 갱신
    mcToken = await mcToken.refresh();

    // 치장품을 골랐고 지원 버전이면 Fabric + 치장품 모드로 실행
    writeCosmeticsConfig(settings);
    let custom;
    if (version.id === COSMETICS_VERSION && settings.cosmetics.length && fs.existsSync(MOD_JAR)) {
      send('game:state', { state: 'preparing', text: '치장품 모드 준비 중…' });
      custom = await prepareCosmetics(settings);
    }

    // 잘리거나 손상된 게임 파일을 찾아 지우면, 아래 실행 단계에서 다시 받습니다.
    const broken = verifyVersion(settings.gameDir, custom || version.id, (text) => send('game:state', { state: 'preparing', text }));

    const startedAt = Date.now();
    const logFile = path.join(userDir(), 'latest.log');
    const logStream = fs.createWriteStream(logFile);
    logStream.on('error', () => {}); // 로그 저장 실패는 무시 (게임 실행에는 영향 없음)
    let tail = ''; // 실패 원인 분석용 최근 로그
    const log = (l) => {
      const line = String(l).replace(/\n?$/, '\n');
      logStream.write(line);
      tail = (tail + line).slice(-60000);
      send('game:log', line);
    };
    if (broken.length) log(`[Aurora] 손상된 파일 ${broken.length}개를 찾아 다시 받습니다.`);

    const { Client } = require('minecraft-launcher-core');
    const client = new Client();
    client.on('progress', (p) => send('game:progress', p));
    client.on('debug', log);
    client.on('data', log);
    client.on('close', (code) => {
      gameRunning = false;
      let hint = null;
      if (code) {
        const crash = findJvmCrash(settings.gameDir, startedAt);
        hint = explainLog(tail) || CRASH_HINTS[code] || `게임이 비정상 종료됐습니다 (코드 ${code}).`;
        if (crash && crash.frame) hint += `\n충돌 위치: ${crash.frame}`;
        log(`[Aurora] 종료 코드 ${code} (0x${(code >>> 0).toString(16).toUpperCase()})`);
        log(`[Aurora] ${hint}`);
        if (crash) log(`[Aurora] 자바 충돌 보고서: ${crash.file}`);
        log(`[Aurora] 이 로그는 ${logFile} 에 저장됐습니다.`);
      }
      logStream.end();
      send('game:state', { state: 'idle', code, hint });
      if (win && !win.isDestroyed()) win.show();
    });

    send('game:state', { state: 'downloading', text: '게임 파일 확인 중…' });
    const proc = await client.launch({
      authorization: mcToken.mclc(),
      root: settings.gameDir,
      version: { number: version.id, type: version.type, custom },
      memory: { max: `${settings.ram}G`, min: '512M' },
      javaPath,
      // 공식 런처가 Windows 에서 쓰는 JVM 옵션 (일부 그래픽 드라이버 충돌 방지 포함)
      customArgs: [
        '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
        '-Xss1M',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+UseG1GC',
        '-XX:G1NewSizePercent=20',
        '-XX:G1ReservePercent=20',
        '-XX:MaxGCPauseMillis=50',
        '-XX:G1HeapRegionSize=32M',
      ],
      overrides: { detached: false },
      // 서버 목록에서 '접속'을 눌렀으면 게임이 켜지자마자 그 서버로 들어갑니다.
      ...(server ? { quickPlay: { type: 'multiplayer', identifier: server } } : {}),
    });
    if (!proc) throw new Error('게임을 시작하지 못했습니다. 로그를 확인해 주세요.');
    gameProcessStarted = true;
    send('game:state', { state: 'running' });
    if (settings.closeOnLaunch && win) win.hide();
    return true;
  } catch (err) {
    gameRunning = false;
    if (err && err.code === 'ENOSPC') err = new Error(diskFullMessage(loadSettings().gameDir));
    send('game:state', { state: 'idle' });
    throw err;
  }
});

// ───────────── 설정 / 창 ─────────────
ipcMain.handle('settings:get', () => {
  const s = loadSettings();
  const free = freeBytes(s.gameDir);
  return { ...s, totalRam: Math.floor(os.totalmem() / 1024 ** 3), freeGb: free === null ? null : Number(gb(free)), drive: driveOf(s.gameDir) };
});
ipcMain.handle('settings:set', (_e, patch) => {
  const saved = saveSettings(patch);
  if (patch && 'cosmetics' in patch) writeCosmeticsConfig(saved); // 게임 실행 중에도 바로 반영
  return saved;
});
ipcMain.handle('shell:openLog', () => shell.openPath(path.join(userDir(), 'latest.log')));

ipcMain.handle('dialog:pickJava', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Java 실행 파일 선택 (javaw.exe)',
    filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickDir', async () => {
  const r = await dialog.showOpenDialog(win, { title: '게임 폴더 선택', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('shell:openGameDir', () => {
  const dir = loadSettings().gameDir;
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

// ───────────── 자동 업데이트 (GitHub Releases) ─────────────
// 설치형(Setup.exe)으로 설치했을 때만 동작합니다. 새 버전이 있으면 받아 두고, 재시작할 때 교체합니다.
let updater = null;
function initUpdater() {
  if (!app.isPackaged) return;
  updater = require('electron-updater').autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => send('update:state', { state: 'checking' }));
  updater.on('update-available', (i) => send('update:state', { state: 'downloading', version: i.version, pct: 0 }));
  updater.on('download-progress', (p) => send('update:state', { state: 'downloading', pct: Math.round(p.percent) }));
  updater.on('update-downloaded', (i) => send('update:state', { state: 'ready', version: i.version }));
  updater.on('update-not-available', () => send('update:state', { state: 'latest' }));
  updater.on('error', (e) => send('update:state', { state: 'error', message: String((e && e.message) || e).split('\n')[0] }));
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:check', async () => {
  if (!updater) return false; // 개발 모드
  await updater.checkForUpdates().catch(() => {});
  return true;
});
ipcMain.handle('update:install', () => {
  if (gameRunning) throw new Error('게임을 먼저 종료해 주세요.');
  if (updater) updater.quitAndInstall(true, true);
});

ipcMain.on('win:min', () => win && win.minimize());
ipcMain.on('win:close', () => win && win.close());

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 1040,
    minHeight: 660,
    frame: false,
    backgroundColor: '#0b0c0f',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    initUpdater();
    if (updater) updater.checkForUpdates().catch(() => {});
  });
  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
