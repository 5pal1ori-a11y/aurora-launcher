/* 치장품 3D 미리보기
 * cosmetics/cosmetics.data.js (게임 모드의 cosmetics.json 과 같은 내용)를 읽어 skinview3d 캐릭터에 붙입니다.
 * 좌표·텍스처 배치·애니메이션 계산은 모드의 Java 코드(CosmeticModel)와 같습니다.
 */
const Cosmetics3D = (() => {
  let data = null;
  const textures = {};

  async function load() {
    if (data) return data;
    data = window.AURORA_COSMETICS || { items: [], texelsPerUnit: 2 };
    return data;
  }
  const items = () => (data ? data.items : []);

  // three.js 클래스는 skinview3d 가 번들 안에 숨겨 두었으므로 기존 객체에서 얻습니다.
  function classes(viewer) {
    let mesh = null;
    viewer.playerObject.skin.traverse((o) => {
      if (!mesh && o.isMesh && o.material && o.material.map) mesh = o;
    });
    if (!mesh) return null;
    const geo = mesh.geometry;
    return {
      Mesh: mesh.constructor,
      Material: mesh.material.constructor,
      Texture: mesh.material.map.constructor,
      BufferGeometry: Object.getPrototypeOf(geo.constructor.prototype).constructor,
      Attr: geo.getAttribute('position').constructor,
      Group: Object.getPrototypeOf(Object.getPrototypeOf(viewer.playerObject.skin.head)).constructor,
    };
  }

  function texture(C, item) {
    if (textures[item.id]) return textures[item.id];
    const img = new Image();
    const tex = new C.Texture(img);
    tex.magFilter = tex.minFilter = 1003; // NearestFilter
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.colorSpace = 'srgb';
    img.onload = () => (tex.needsUpdate = true);
    img.src = item.textureData;
    textures[item.id] = tex;
    return tex;
  }

  // 상자 하나의 6면 (모드의 Java 코드와 같은 순서·방향)
  function cubeGeometry(C, c, tw, th, S) {
    const [x0, y0, z0] = c.from;
    const x1 = x0 + c.size[0];
    const y1 = y0 + c.size[1];
    const z1 = z0 + c.size[2];
    const W = Math.max(1, Math.ceil(c.size[0] * S));
    const H = Math.max(1, Math.ceil(c.size[1] * S));
    const D = Math.max(1, Math.ceil(c.size[2] * S));
    const [u, v] = c.uv;
    const F = [
      // [사각형(u,v,w,h), 법선, 왼위·오위·오아래·왼아래 꼭짓점]
      [[u + D, v + D, W, H], [0, 0, -1], [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]],
      [[u + 2 * D + W, v + D, W, H], [0, 0, 1], [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]]],
      [[u, v + D, D, H], [-1, 0, 0], [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]]],
      [[u + D + W, v + D, D, H], [1, 0, 0], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[u + D, v, W, D], [0, -1, 0], [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]],
      [[u + D + W, v, W, D], [0, 1, 0], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]],
    ];
    const pos = [];
    const nor = [];
    const uvs = [];
    const idx = [];
    F.forEach(([[fu, fv, fw, fh], n, q], i) => {
      const uv = [[fu, fv], [fu + fw, fv], [fu + fw, fv + fh], [fu, fv + fh]];
      q.forEach((p, k) => {
        pos.push(...p);
        nor.push(...n);
        uvs.push(uv[k][0] / tw, uv[k][1] / th);
      });
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new C.BufferGeometry();
    g.setAttribute('position', new C.Attr(new Float32Array(pos), 3));
    g.setAttribute('normal', new C.Attr(new Float32Array(nor), 3));
    g.setAttribute('uv', new C.Attr(new Float32Array(uvs), 2));
    g.setIndex(idx);
    return g;
  }

  // 애니메이션: 모드의 CosmeticModel.animate 와 같은 계산
  function animate(anims, t, move, fly) {
    const r = { x: 0, y: 0, z: 0, bob: 0 };
    for (const a of anims) {
      const side = a.side == null ? 1 : a.side;
      const ph = a.phase || 0;
      const axis = a.axis || 'y';
      if (a.type === 'spin') r.y += t * a.speed;
      else if (a.type === 'bob') r.bob += a.amp * Math.sin(t * a.speed + ph);
      else if (a.type === 'sway') r[axis] += side * a.amp * Math.sin(t * a.speed + ph) * (1 + move * 1.5);
      else if (a.type === 'flap') {
        const k = 1 + move * 0.8 + fly * 1.2;
        r[axis] += side * a.amp * k * Math.sin(t * a.speed * (1 + move * 0.6 + fly * 1.4) + ph);
      } else if (a.type === 'twitch') r[axis] += side * a.amp * Math.pow(Math.max(0, Math.sin(t * a.speed + ph)), 12);
    }
    return r;
  }

  function buildPart(C, p, mat, glowMat, tw, th, S, animated, glow) {
    const base = new C.Group();
    base.position.set(...p.pivot);
    base.rotation.set(p.rot[0], p.rot[1], p.rot[2], 'ZYX');
    if (p.scale) base.scale.setScalar(p.scale);
    const anim = new C.Group();
    anim.rotation.order = 'ZYX';
    base.add(anim);
    const g = glow || p.glow;
    for (const c of p.cubes) anim.add(new C.Mesh(cubeGeometry(C, c, tw, th, S), g ? glowMat : mat));
    for (const ch of p.children || []) anim.add(buildPart(C, ch, mat, glowMat, tw, th, S, animated, g));
    if (p.anims && p.anims.length) animated.push({ group: anim, anims: p.anims });
    return base;
  }

  // viewer: skinview3d.SkinViewer, ids: 켤 치장품 id 목록
  function apply(viewer, ids) {
    if (!viewer || !data) return;
    if (viewer._aurora) viewer._aurora.roots.forEach((g) => g.parent && g.parent.remove(g));
    viewer._aurora = { roots: [], animated: [] };
    const on = items().filter((i) => ids.includes(i.id));
    if (!on.length) return;
    const C = classes(viewer);
    if (!C) {
      // 스킨이 아직 안 불러와짐 → 잠시 뒤 다시
      clearTimeout(viewer._auroraRetry);
      viewer._auroraRetry = setTimeout(() => apply(viewer, ids), 200);
      return;
    }
    const S = data.texelsPerUnit;
    for (const item of on) {
      const tex = texture(C, item);
      // 게임 속 밝기에 가깝게 살짝 자체 발광
      const mat = new C.Material({ map: tex, transparent: true, alphaTest: 0.1, side: 2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 });
      const glowMat = new C.Material({ map: tex, transparent: true, alphaTest: 0.1, side: 2, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 });
      // 모드 좌표(y 아래, 앞 -z)를 three.js 좌표로: x축 기준 180도 회전 = scale(1,-1,-1)
      const root = new C.Group();
      root.scale.set(1, -1, -1);
      const skin = viewer.playerObject.skin;
      if (item.bone === 'head') {
        skin.head.add(root);
      } else {
        root.position.set(0, 6, 0); // skinview 몸통 원점은 몸통 가운데
        skin.body.add(root);
      }
      for (const p of item.parts) root.add(buildPart(C, p, mat, glowMat, item.tw, item.th, S, viewer._aurora.animated, false));
      viewer._aurora.roots.push(root);
    }
  }

  // 매 프레임 애니메이션 갱신 (move: 0~1 걷기 정도, fly: 0/1)
  function tick(viewer, move = 0, fly = 0) {
    if (!viewer || !viewer._aurora) return;
    const t = performance.now() / 50; // 게임 틱 단위
    for (const a of viewer._aurora.animated) {
      const r = animate(a.anims, t, move, fly);
      a.group.position.set(0, r.bob, 0);
      a.group.rotation.set(r.x, r.y, r.z, 'ZYX');
    }
  }

  // 슬롯별 하나만: 모자·귀는 같은 머리 공간을 써서 함께 못 씀
  const SLOT_GROUP = { hat: 'head', ears: 'head', halo: 'halo', back: 'back', tail: 'tail' };
  function toggle(ids, id) {
    const item = items().find((i) => i.id === id);
    if (!item) return ids;
    if (ids.includes(id)) return ids.filter((x) => x !== id);
    const grp = SLOT_GROUP[item.slot] || item.slot;
    const keep = ids.filter((x) => {
      const other = items().find((i) => i.id === x);
      return other && (SLOT_GROUP[other.slot] || other.slot) !== grp;
    });
    return [...keep, id];
  }

  return { load, items, apply, tick, toggle };
})();
