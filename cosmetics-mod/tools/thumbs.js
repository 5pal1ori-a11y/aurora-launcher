// 옷장 카드용 치장품 썸네일을 만듭니다 (투명한 캐릭터에 치장품만 렌더링).
// 사용법: node tools/thumbs.js  (Playwright 필요, 저장소 루트의 src/renderer 기준)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '../../src/renderer');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  const html = path.join(R, '_thumbs.html');
  fs.writeFileSync(html, '<body style="margin:0;background:transparent"><script src="vendor/skinview3d.bundle.js"></script><script src="cosmetics/cosmetics.data.js"></script><script src="cosmetics3d.js"></script></body>');
  try {
    await p.goto('file://' + html);
    const shots = await p.evaluate(async () => {
      await Cosmetics3D.load();
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const blank = document.createElement('canvas');
      blank.width = blank.height = 64;
      const v = new skinview3d.SkinViewer({ canvas: c, width: 256, height: 256, preserveDrawingBuffer: true });
      v.renderer.setClearColor(0x000000, 0);
      v.background = null;
      v.fov = 30;
      v.animation = null;
      v.globalLight.intensity = 2.6;
      v.cameraLight.intensity = 1.0;
      await v.loadSkin(blank);
      // 캐릭터 몸은 숨기고 치장품만 보이게
      v.playerObject.traverse((o) => { if (o.isMesh) o.visible = false; });
      v.playerObject.cape.visible = false;
      v.playerObject.elytra.visible = false;
      const out = {};
      for (const it of Cosmetics3D.items()) {
        const back = it.bone === 'body';
        v.playerObject.position.set(0, 0, 0);
        v.playerObject.rotation.y = back ? Math.PI - 0.5 : 0.55;
        v.playerObject.rotation.x = it.slot === 'halo' ? 0.75 : back ? 0 : 0.22; // 머리 위 장식은 위에서 내려다보게
        Cosmetics3D.apply(v, [it.id]);
        await new Promise((r) => setTimeout(r, 300));
        Cosmetics3D.tick(v, 0, 0);
        // 치장품 크기에 맞춰 화면 가운데로 (Box3 는 geometry.boundingBox 에서 얻음)
        let Box = null;
        v.scene.updateMatrixWorld(true);
        v.scene.traverse((o) => { if (!Box && o.isMesh && o.visible) { o.geometry.computeBoundingBox(); Box = o.geometry.boundingBox.constructor; } });
        const box = new Box();
        v._aurora.roots.forEach((r) => box.expandByObject(r));
        const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
        const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        v.playerObject.position.set(-cx, -cy, -cz);
        v.zoom = Math.min(3, 30 / size);
        v.render();
        out[it.id] = c.toDataURL('image/png');
      }
      return out;
    });
    for (const [id, url] of Object.entries(shots)) {
      fs.writeFileSync(path.join(R, 'cosmetics', 'thumbs', `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
      console.log('thumb', id);
    }
  } finally {
    fs.rmSync(html, { force: true });
    await b.close();
  }
})();
