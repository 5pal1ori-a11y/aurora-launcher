/* 픽셀 아트 그래픽 (직접 그린 것만 사용합니다)
 * - 홈 배너의 블록 풍경 (시간대에 따라 낮/노을/밤)
 * - 사이드바 버전 아이콘 (잔디 블록, 돌 블록)
 * - 치장품 아이콘
 */
const Pixel = (() => {
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  const GRASS = ['#5f9e3b', '#6aac43', '#55902f', '#73b44a'];
  const DIRT = ['#7b5636', '#6c4b2f', '#86603d', '#714f31'];
  const DIRT_DARK = '#563a24';
  const STONE = ['#7e7e7e', '#717171', '#888888', '#6a6a6a'];
  const STONE_DARK = '#5a5a5a';
  const LOG = ['#6c5033', '#5d442a', '#7a5c3b'];
  const LEAF = ['#3f7d2b', '#4a8f33', '#366e24', '#438530'];

  // ── 블록 텍스처 (8x8 또는 16x16) ──
  function grassTex(ctx, x, y, s, r) {
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const edge = Math.floor(s / 4) + (r() < 0.45 ? 1 : 0);
        let c;
        if (j < edge) c = pick(r, GRASS);
        else c = r() < 0.12 ? DIRT_DARK : pick(r, DIRT);
        ctx.fillStyle = c;
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  function fillTex(ctx, x, y, s, r, pal, dark, p) {
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        ctx.fillStyle = r() < p ? dark : pick(r, pal);
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  function logTex(ctx, x, y, s, r) {
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        ctx.fillStyle = i % 3 === 1 && r() < 0.7 ? '#4f3a24' : pick(r, LOG);
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }
  function leafTex(ctx, x, y, s, r) {
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        ctx.fillStyle = r() < 0.14 ? '#24501a' : pick(r, LEAF);
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  // ── 16x16 아이콘 ──
  function iconCanvas(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    draw(c.getContext('2d'));
    return c.toDataURL();
  }
  const blockIcons = {};
  function blockIcon(kind) {
    if (blockIcons[kind]) return blockIcons[kind];
    const r = rng(kind === 'grass' ? 11 : 23);
    blockIcons[kind] = iconCanvas((ctx) => {
      if (kind === 'grass') grassTex(ctx, 0, 0, 16, r);
      else if (kind === 'stone') fillTex(ctx, 0, 0, 16, r, STONE, STONE_DARK, 0.1);
      else if (kind === 'log') logTex(ctx, 0, 0, 16, r);
    });
    return blockIcons[kind];
  }

  // 문자 지도로 그리는 아이콘
  function mapIcon(rows, pal) {
    return iconCanvas((ctx) => {
      rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (pal[ch]) {
            ctx.fillStyle = pal[ch];
            ctx.fillRect(x, y, 1, 1);
          }
        })
      );
    });
  }
  const ITEM_ICONS = {
    tophat: () =>
      mapIcon(
        ['', '', '', '....hkkkkkkk....', '....hkkkkkkk....', '....hkkkkkkk....', '....hkkkkkkk....', '....hkkkkkkk....', '....hkkkkkkk....', '....RRRRRRRr....', '....RRRRRRRr....', '.hkkkkkkkkkkkkk.', '.kkkkkkkkkkkkkd.', '..dddddddddddd..'],
        { k: '#1f1f28', h: '#3a3a48', d: '#121218', R: '#c73446', r: '#9c2635' }
      ),
    crown: () =>
      mapIcon(
        ['', '', '', '..Y....YY....Y..', '..YY..YyyY..YY..', '..YYYYYyyYYYYY..', '..YyyyyyyyyyyY..', '..YyyRyyyyByyY..', '..YyyyyyyyyyyY..', '..dddddddddddd..', '..dddddddddddd..'],
        { Y: '#ffe07a', y: '#f2c23c', d: '#b8861c', R: '#e0354b', B: '#36d1b0' }
      ),
    halo: () =>
      mapIcon(
        ['', '', '', '', '', '....LLLLLLLL....', '..LLllllllllLL..', '.Ll..........lL.', '..LLllllllllLL..', '....LLLLLLLL....'],
        { L: '#fff6c2', l: '#ffe98a' }
      ),
    wings: () =>
      mapIcon(
        ['', '', '.W............W.', '.WW..........WW.', '.WWW........WWW.', '.WWWw......wWWW.', '..WWWw....wWWW..', '..WWWWw..wWWWW..', '..BWWWw..wWWWB..', '...BWWw..wWWB...', '...BBWw..wWBB...', '....BBw..wBB....', '.....BB..BB.....'],
        { W: '#f4f7ff', w: '#c9d3ea', B: '#9db6ef' }
      ),
  };
  const itemIconCache = {};
  const itemIcon = (id) => (itemIconCache[id] ||= ITEM_ICONS[id]());

  // ── 배너 풍경 ──
  const THEMES = {
    day: { sky: ['#4f86de', '#5e92e3', '#6e9fe9', '#80acee', '#94bbf2', '#aacbf5'], cloud: ['#ffffff', '#dfe8f8'], far: '#8aa6cc', farTop: '#a9bfdd', mid: '#5c8c55', midTop: '#6c9f62', sun: '#fff4bf', tint: null },
    dusk: { sky: ['#2c336f', '#4b3f86', '#83528a', '#c16478', '#e88a66', '#f5b874'], cloud: ['#ffd7bd', '#e1a29b'], far: '#6b5a8c', farTop: '#8a6f9e', mid: '#3e5847', midTop: '#4b6a52', sun: '#ffcf7a', tint: 'rgba(90,30,50,0.22)' },
    night: { sky: ['#060a1c', '#091027', '#0d1531', '#121b3b', '#172245', '#1d2a50'], cloud: ['#363f61', '#2a3252'], far: '#1b2643', farTop: '#25325a', mid: '#152a1f', midTop: '#1b3527', sun: '#e8ecf5', tint: 'rgba(6,12,40,0.55)' },
  };
  function timeOfDay() {
    if (window.__tod) return window.__tod;
    const h = new Date().getHours();
    if (h >= 7 && h < 17) return 'day';
    if ((h >= 17 && h < 20) || (h >= 5 && h < 7)) return 'dusk';
    return 'night';
  }

  function heights(r, n, min, max, step) {
    const out = [];
    let h = (min + max) / 2;
    for (let i = 0; i < n; i++) {
      h += (r() - 0.5) * step * 2;
      h = Math.max(min, Math.min(max, h));
      out.push(Math.round(h));
    }
    return out;
  }

  // canvas 에 풍경을 그리고, 캐릭터를 세울 지면 위치를 돌려줍니다.
  function scene(canvas, opts) {
    const SCALE = 3;
    const B = 8;
    const W = Math.max(64, Math.ceil(canvas.clientWidth / SCALE));
    const H = Math.ceil(canvas.clientHeight / SCALE);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const theme = THEMES[timeOfDay()];
    const tod = timeOfDay();

    // 하늘 (단계별 띠 + 경계 디더링)
    const sky = document.createElement('canvas');
    sky.width = W;
    sky.height = H;
    const sx = sky.getContext('2d');
    const band = Math.ceil((H * 0.75) / theme.sky.length);
    theme.sky.forEach((c, i) => {
      sx.fillStyle = c;
      sx.fillRect(0, i * band, W, i === theme.sky.length - 1 ? H : band);
      if (i > 0) {
        sx.fillStyle = theme.sky[i - 1];
        for (let x = 0; x < W; x += 2) sx.fillRect(x + ((i * band) % 2), i * band, 1, 1);
        for (let x = 0; x < W; x += 4) sx.fillRect(x, i * band + 1, 1, 1);
      }
    });
    const r0 = rng(5);
    if (tod === 'night') {
      for (let i = 0; i < W * 0.35; i++) {
        sx.fillStyle = r0() < 0.2 ? '#ffffff' : '#9aa8d6';
        sx.fillRect(Math.floor(r0() * W), Math.floor(r0() * H * 0.6), 1, 1);
      }
    }
    // 해 / 달
    const sunX = Math.floor(W * (tod === 'dusk' ? 0.2 : 0.16));
    const sunY = tod === 'dusk' ? Math.floor(H * 0.42) : 12;
    sx.fillStyle = theme.sun;
    sx.globalAlpha = 0.35;
    sx.fillRect(sunX - 2, sunY - 2, 14, 14);
    sx.globalAlpha = 1;
    sx.fillRect(sunX, sunY, 10, 10);
    if (tod === 'night') {
      sx.fillStyle = '#c3c9d8';
      sx.fillRect(sunX + 2, sunY + 2, 2, 2);
      sx.fillRect(sunX + 6, sunY + 5, 2, 2);
      sx.fillRect(sunX + 3, sunY + 7, 1, 1);
    }

    // 먼 산, 언덕, 지형
    const land = document.createElement('canvas');
    land.width = W;
    land.height = H;
    const lx = land.getContext('2d');
    const r1 = rng(42);
    const farH = heights(r1, Math.ceil(W / 3) + 1, H * 0.34, H * 0.55, 2.2);
    farH.forEach((h, i) => {
      lx.fillStyle = theme.far;
      lx.fillRect(i * 3, h, 3, H - h);
      lx.fillStyle = theme.farTop;
      lx.fillRect(i * 3, h, 3, 2);
    });
    const midH = heights(r1, Math.ceil(W / 4) + 1, H * 0.5, H * 0.66, 2);
    midH.forEach((h, i) => {
      lx.fillStyle = theme.mid;
      lx.fillRect(i * 4, h, 4, H - h);
      lx.fillStyle = theme.midTop;
      lx.fillRect(i * 4, h, 4, 1);
    });

    // 앞쪽 블록 지형
    const cols = Math.ceil(W / B) + 1;
    const charCol = Math.floor((W * opts.charX) / B);
    const r2 = rng(7);
    const ground = [];
    let g = 4;
    for (let c = 0; c < cols; c++) {
      if (r2() < 0.35) g += r2() < 0.5 ? -1 : 1;
      g = Math.max(3, Math.min(5, g));
      ground.push(g);
    }
    for (let c = charCol - 1; c <= charCol + 1; c++) if (ground[c] !== undefined) ground[c] = 4;
    const topY = (c) => H - ground[c] * B;

    const r3 = rng(99);
    for (let c = 0; c < cols; c++) {
      const x = c * B;
      for (let k = 0; k < ground[c]; k++) {
        const y = topY(c) + k * B;
        if (k === 0) grassTex(lx, x, y, B, r3);
        else if (k < 2) fillTex(lx, x, y, B, r3, DIRT, DIRT_DARK, 0.12);
        else fillTex(lx, x, y, B, r3, STONE, STONE_DARK, 0.1);
      }
      // 풀, 꽃
      for (let i = 0; i < B; i++) {
        const t = r3();
        if (t < 0.18) {
          lx.fillStyle = pick(r3, GRASS);
          lx.fillRect(x + i, topY(c) - 1, 1, 1);
          if (t < 0.07) lx.fillRect(x + i, topY(c) - 2, 1, 1);
        } else if (t < 0.2 && Math.abs(c - charCol) > 1) {
          lx.fillStyle = r3() < 0.5 ? '#e0403a' : '#f2d23b';
          lx.fillRect(x + i, topY(c) - 2, 1, 1);
          lx.fillStyle = '#3f7d2b';
          lx.fillRect(x + i, topY(c) - 1, 1, 1);
        }
      }
    }
    // 나무
    const r4 = rng(3);
    const used = new Set();
    for (let c = 2; c < cols - 2; c++) {
      if (Math.abs(c - charCol) < 4 || used.has(c) || r4() > 0.16) continue;
      [c - 2, c - 1, c, c + 1, c + 2, c + 3].forEach((u) => used.add(u));
      const base = topY(c);
      const trunk = 3;
      for (let k = 1; k <= trunk; k++) logTex(lx, c * B, base - k * B, B, r4);
      const ly = base - (trunk + 1) * B;
      for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy < 2; dy++) leafTex(lx, (c + dx) * B, ly + dy * B, B, r4);
      for (let dx = -1; dx <= 1; dx++) leafTex(lx, (c + dx) * B, ly - B, B, r4);
      leafTex(lx, c * B, ly - 2 * B, B, r4);
    }
    if (theme.tint) {
      lx.globalCompositeOperation = 'source-atop';
      lx.fillStyle = theme.tint;
      lx.fillRect(0, 0, W, H);
      lx.globalCompositeOperation = 'source-over';
    }

    // 구름 (천천히 흘러감)
    const r5 = rng(17);
    const clouds = Array.from({ length: Math.ceil(W / 70) + 2 }, () => ({
      x: r5() * (W + 80),
      y: 6 + Math.floor(r5() * H * 0.25),
      parts: Array.from({ length: 3 + Math.floor(r5() * 3) }, () => [Math.floor(r5() * 26), Math.floor(r5() * 4), 8 + Math.floor(r5() * 14), 3 + Math.floor(r5() * 3)]),
      speed: 0.6 + r5() * 0.6,
    }));

    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < 90) return;
      last = now;
      const t = (now - t0) / 1000;
      ctx.drawImage(sky, 0, 0);
      for (const cl of clouds) {
        const x = Math.floor(((cl.x + t * cl.speed) % (W + 80)) - 40);
        for (const [px, py, w, h] of cl.parts) {
          ctx.fillStyle = theme.cloud[1];
          ctx.fillRect(x + px, cl.y + py + 1, w, h);
          ctx.fillStyle = theme.cloud[0];
          ctx.fillRect(x + px, cl.y + py, w, h);
        }
      }
      ctx.drawImage(land, 0, 0);
    }
    raf = requestAnimationFrame(frame);

    return {
      stop: () => cancelAnimationFrame(raf),
      // 캐릭터 발이 닿을 화면 좌표 (CSS 픽셀)
      foot: { x: (charCol * B + B / 2) * SCALE, y: topY(charCol) * SCALE },
    };
  }

  return { scene, blockIcon, itemIcon };
})();
