// 게임 버전에 맞는 Java 런타임을 찾거나, 없으면 Eclipse Temurin(Adoptium) JRE를 내려받습니다.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// javaw.exe 옆의 java.exe 로 -version 을 실행해 주 버전(8, 17, 21 …)을 알아냅니다. 실행이 안 되면 null.
function javaMajorOf(javaPath) {
  const cli = javaPath.replace(/javaw(\.exe)?$/i, (m) => (m.toLowerCase().endsWith('.exe') ? 'java.exe' : 'java'));
  const exe = fs.existsSync(cli) ? cli : javaPath;
  const r = spawnSync(exe, ['-version'], { windowsHide: true, timeout: 20000, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = String(r.stderr || r.stdout).match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const first = Number(m[1]);
  return first === 1 ? Number(m[2]) : first; // "1.8.0" → 8
}

const OS_MAP = { win32: 'windows', darwin: 'mac', linux: 'linux' };
const ARCH_MAP = { x64: 'x64', arm64: 'aarch64', ia32: 'x86' };

function findJavaBin(dir) {
  const exe = process.platform === 'win32' ? 'javaw.exe' : 'java';
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    for (const sub of ['bin', path.join('Contents', 'Home', 'bin')]) {
      const candidate = path.join(dir, entry, sub, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function ensureJava(major, runtimeRoot, onStatus = () => {}) {
  const dir = path.join(runtimeRoot, `java-${major}`);
  const existing = findJavaBin(dir);
  if (existing) {
    if (javaMajorOf(existing) !== null) return existing;
    // 설치가 중간에 끊겨 망가진 Java → 지우고 다시 설치
    onStatus(`Java ${major} 이(가) 손상돼 다시 설치합니다…`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 자동 설치는 Windows 만 지원. 그 외에는 시스템 java 사용.
  if (process.platform !== 'win32') return 'java';

  const osName = OS_MAP[process.platform];
  const arch = ARCH_MAP[process.arch] || 'x64';
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`;

  onStatus(`Java ${major} 다운로드 중…`, 0);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Java ${major} 자동 설치에 실패했습니다. 설정에서 Java 경로를 직접 지정해 주세요.`);
  }
  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let got = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    got += chunk.length;
    if (total) onStatus(`Java ${major} 다운로드 중…`, Math.round((got / total) * 100));
  }

  onStatus(`Java ${major} 설치 중…`);
  const AdmZip = require('adm-zip');
  fs.mkdirSync(dir, { recursive: true });
  new AdmZip(Buffer.concat(chunks)).extractAllTo(dir, true);

  const bin = findJavaBin(dir);
  if (!bin || javaMajorOf(bin) === null) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error('Java 설치에 실패했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.');
  }
  return bin;
}

module.exports = { ensureJava, javaMajorOf };
