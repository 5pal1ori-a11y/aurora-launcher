// 게임 파일 검사 / 복구
// 저장 공간이 꽉 찬 상태에서 다운로드가 끊기면 파일이 잘린 채로 남고,
// 다음 실행 때 Java 가 "A Java Exception has occurred" 로 바로 꺼집니다.
// 실행 전에 버전 JSON 에 적힌 크기와 SHA-1 로 파일을 확인하고, 맞지 않으면 지워서 다시 받게 합니다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha1File(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ok: false };
  }
}

// 반환값: 지운(손상된) 파일 목록
function verifyVersion(root, id, onStatus = () => {}) {
  const removed = [];
  const remove = (file) => {
    try {
      fs.rmSync(file, { force: true });
      removed.push(file);
    } catch {}
  };
  const check = (file, sha1, size, hash = true) => {
    if (!fs.existsSync(file)) return; // 없는 파일은 런처가 알아서 받음
    try {
      const st = fs.statSync(file);
      if ((size && st.size !== size) || (hash && sha1 && sha1File(file) !== sha1)) remove(file);
    } catch {
      remove(file);
    }
  };
  const loadVersion = (vid) => {
    const file = path.join(root, 'versions', vid, `${vid}.json`);
    if (!fs.existsSync(file)) return null;
    const r = readJson(file);
    if (!r.ok) {
      remove(file); // JSON 자체가 깨짐 → 지우고 다시 받기
      return null;
    }
    return r.value;
  };

  const chain = [];
  let v = loadVersion(id);
  while (v && chain.length < 3) {
    chain.push(v);
    v = v.inheritsFrom ? loadVersion(v.inheritsFrom) : null;
  }

  for (const ver of chain) {
    onStatus(`${ver.id} 파일 검사 중…`);
    const client = ver.downloads && ver.downloads.client;
    if (client) check(path.join(root, 'versions', ver.id, `${ver.id}.jar`), client.sha1, client.size);

    for (const lib of ver.libraries || []) {
      const d = lib.downloads || {};
      if (d.artifact && d.artifact.path) check(path.join(root, 'libraries', d.artifact.path), d.artifact.sha1, d.artifact.size);
      for (const c of Object.values(d.classifiers || {})) {
        if (c && c.path) check(path.join(root, 'libraries', c.path), c.sha1, c.size);
      }
      // Fabric 처럼 maven 좌표만 있는 라이브러리
      if (!lib.downloads && lib.name && lib.sha1) {
        const [group, name, ver2] = lib.name.split(':');
        if (group && name && ver2) {
          check(path.join(root, 'libraries', ...group.split('.'), name, ver2, `${name}-${ver2}.jar`), lib.sha1, lib.size);
        }
      }
    }

    if (ver.assetIndex && ver.assetIndex.id) {
      const idxFile = path.join(root, 'assets', 'indexes', `${ver.assetIndex.id}.json`);
      check(idxFile, ver.assetIndex.sha1, ver.assetIndex.size);
      const idx = fs.existsSync(idxFile) ? readJson(idxFile) : { ok: false };
      if (idx.ok && idx.value.objects) {
        onStatus('에셋 검사 중…');
        // 에셋은 수천 개라 크기만 확인 (잘린 파일은 크기가 다름)
        for (const o of Object.values(idx.value.objects)) {
          if (!o || !o.hash) continue;
          check(path.join(root, 'assets', 'objects', o.hash.slice(0, 2), o.hash), null, o.size, false);
        }
      }
    }
  }
  return removed;
}

// 게임 로그에서 흔한 실패 원인을 찾아 한국어로 설명합니다.
function explainLog(text) {
  if (/UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/.test(text)) {
    return 'Java 버전이 너무 낮습니다. 설정 → Java 에서 "초기화"를 누르면 이 게임 버전에 맞는 Java 를 자동으로 설치합니다.';
  }
  if (/ZipException|zip END header not found|invalid LOC header|error in opening zip file|Invalid or corrupt jarfile|ZipFile invalid/i.test(text)) {
    return '게임 파일이 손상됐습니다. 다시 플레이를 누르면 손상된 파일을 자동으로 다시 받습니다.';
  }
  if (/Could not reserve enough space|Invalid maximum heap size|Initial heap size set to a larger value/.test(text)) {
    return '메모리 설정이 컴퓨터에 맞지 않습니다. 설정 → 최대 메모리를 4 GB 정도로 낮춰 보세요.';
  }
  if (/Unrecognized VM option|Unrecognized option/.test(text)) {
    return 'Java 가 런처의 실행 옵션을 이해하지 못했습니다. 설정 → Java 에서 "초기화"를 눌러 자동 설치된 Java 를 사용해 보세요.';
  }
  if (/ClassNotFoundException|NoClassDefFoundError|Could not find or load main class/.test(text)) {
    return '게임 실행에 필요한 파일이 없거나 손상됐습니다. 다시 플레이를 누르면 파일을 확인하고 다시 받습니다.';
  }
  if (/No space left on device|ENOSPC|There is not enough space on the disk/i.test(text)) {
    return '저장 공간이 부족합니다. 공간을 비운 뒤 다시 시도해 주세요.';
  }
  return null;
}

module.exports = { verifyVersion, explainLog };
