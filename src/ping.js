// Minecraft 서버 상태 확인 (Server List Ping, 1.7 이상)
// 서버 이름 옆에 접속자 수, 지연 시간, 아이콘을 보여 주는 데 씁니다.
const net = require('net');
const dns = require('dns').promises;

function varint(n) {
  const out = [];
  n >>>= 0;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
}
function readVarint(buf, off) {
  let n = 0;
  let shift = 0;
  for (let i = 0; i < 5; i++) {
    if (off + i >= buf.length) return null;
    const b = buf[off + i];
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: n, size: i + 1 };
    shift += 7;
  }
  throw new Error('bad varint');
}
const packet = (...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([varint(body.length), body]);
};
const str = (s) => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
};

// 채팅 컴포넌트(JSON) → 일반 텍스트
function plain(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d.replace(/§./g, '');
  let t = d.text || '';
  if (Array.isArray(d.extra)) t += d.extra.map(plain).join('');
  return t.replace(/§./g, '');
}

async function resolve(address) {
  let [host, port] = address.split(':');
  port = Number(port) || 25565;
  if (!address.includes(':')) {
    try {
      const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srv[0]) return { host: srv[0].name, port: srv[0].port, origHost: host };
    } catch {}
  }
  return { host, port, origHost: host };
}

async function ping(address, timeout = 5000) {
  const { host, port, origHost } = await resolve(address);
  return new Promise((ok, fail) => {
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let start = 0;
    const done = (err, val) => {
      clearTimeout(timer);
      sock.destroy();
      err ? fail(err) : ok(val);
    };
    const timer = setTimeout(() => done(new Error('timeout')), timeout);
    sock.on('error', (e) => done(e));
    sock.on('connect', () => {
      const p = Buffer.alloc(2);
      p.writeUInt16BE(port);
      sock.write(packet(varint(0), varint(767), str(origHost), p, varint(1)));
      start = Date.now();
      sock.write(packet(varint(0)));
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 2 * 1024 * 1024) return done(new Error('too large'));
      try {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len.size + len.value) return;
        let off = len.size;
        const id = readVarint(buf, off);
        off += id.size;
        const sl = readVarint(buf, off);
        off += sl.size;
        const json = JSON.parse(buf.slice(off, off + sl.value).toString('utf8'));
        done(null, {
          online: true,
          latency: Date.now() - start,
          players: json.players ? { online: json.players.online | 0, max: json.players.max | 0 } : null,
          version: json.version ? String(json.version.name || '') : '',
          motd: plain(json.description).trim().slice(0, 200),
          favicon: typeof json.favicon === 'string' && json.favicon.startsWith('data:image/png;base64,') ? json.favicon : null,
        });
      } catch (e) {
        done(e);
      }
    });
  });
}

module.exports = { ping };
