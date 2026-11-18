// 게임 버전에 맞는 Java 런타임을 찾거나, 없으면 Eclipse Temurin(Adoptium) JRE를 내려받습니다.
const fs = require('fs');
const path = require('path');

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
  if (existing) return existing;

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
  if (!bin) throw new Error('Java 설치 후 실행 파일을 찾지 못했습니다.');
  return bin;
}

module.exports = { ensureJava };
