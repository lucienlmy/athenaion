// Entry point.
// Interactive: ?shot=3&quality=preview  |  Offline: tools/render.mjs  |  Test: ?test=temple&view=0
import * as THREE from 'three';
import { createEngine } from './core/engine.js';
import { getQuality } from './core/quality.js';
import { SHOTS } from './world/shots.js';

const P = new URLSearchParams(location.search);

function setLoading(status, pct, meta) {
  const s = document.getElementById('load-status');
  const b = document.getElementById('load-bar');
  const m = document.getElementById('load-meta');
  if (s) s.textContent = status;
  if (b) b.style.width = `${Math.max(0, Math.min(100, pct ?? 0))}%`;
  if (m) m.textContent = meta ?? (pct != null ? `${Math.round(pct)}%` : '');
}

function showProgressUI() {
  const picker = document.getElementById('quality-picker');
  const progress = document.getElementById('load-progress');
  const subtitle = document.getElementById('load-subtitle');
  if (picker) picker.style.display = 'none';
  if (progress) progress.classList.add('active');
  if (subtitle) subtitle.textContent = 'Building the world — please keep this tab in the foreground';
}

function chooseQuality() {
  // URL ?quality= already set → skip picker (tools / deep links)
  if (P.get('quality')) return Promise.resolve(P.get('quality'));
  // Non-interactive offline modes also skip
  if ((P.get('mode') || 'interactive') !== 'interactive') return Promise.resolve('preview');

  return new Promise((resolve) => {
    const picker = document.getElementById('quality-picker');
    if (!picker) return resolve('preview');
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-quality]');
      if (!btn) return;
      const q = btn.getAttribute('data-quality') || 'preview';
      // Reflect choice in the URL without full reload
      try {
        const u = new URL(location.href);
        u.searchParams.set('quality', q);
        history.replaceState(null, '', u);
      } catch { /* ignore */ }
      resolve(q);
    });
  });
}

async function boot() {
  const mode = P.get('mode') || 'interactive';
  const qualityName = await chooseQuality();
  showProgressUI();

  const quality = getQuality(qualityName);
  if (P.get('spp')) quality.spp = Number(P.get('spp'));
  const W = Number(P.get('w')) || (mode === 'interactive' ? Math.round(innerWidth * Math.min(devicePixelRatio, 1)) : 1672);
  const H = Number(P.get('h')) || (mode === 'interactive' ? Math.round(innerHeight * Math.min(devicePixelRatio, 1)) : 941);
  if (mode === 'interactive') document.body.classList.add('interactive');

  setLoading(`creating engine (${quality.name})…`, 2);
  const engine = await createEngine({ width: W, height: H, quality, params: P });
  window.engine = engine;
  const t0 = performance.now();

  let testInfo = null;
  if (P.get('test')) {
    setLoading('building test scene…', 10);
    const { buildTestScene } = await import('./test/testScene.js');
    testInfo = await buildTestScene(engine, P.get('test'), Number(P.get('view') || 0));
  } else {
    const { buildWorld } = await import('./world/index.js');
    await buildWorld(engine, (p) => {
      if (p.phase === 'module') {
        const label = p.done ? `finished ${p.module}` : `building ${p.module}…`;
        const pct = 5 + (p.pct * 0.85);
        setLoading(label, pct, `${p.index}/${p.total} · ${Math.round(pct)}% · ${quality.name}`);
      } else if (p.phase === 'done') {
        setLoading('world modules done', 90, `90% · ${quality.name}`);
      }
    });
  }

  setLoading('preparing scene…', 92);
  engine.prepareScene();
  const buildMs = Math.round(performance.now() - t0);
  window.__STATS = { buildMs };
  console.log(`[main] world built in ${buildMs} ms (quality=${quality.name})`);

  const shotById = (id) => SHOTS.find((s) => String(s.id) === String(id));

  window.__renderShot = async (id) => {
    const s = shotById(id);
    if (!s) throw new Error('unknown shot ' + id);
    engine.applyShot(s);
    return await engine.renderStill(quality.spp);
  };
  window.__SHOTS = SHOTS;
  window.__renderShotObj = async (s, spp) => {
    engine.applyShot(s);
    return await engine.renderStill(spp ?? quality.spp);
  };
  window.__profile = async (shotId, spp = 2) => {
    engine.applyShot(shotById(shotId));
    const time = async () => { await engine.renderStill(spp); return engine.stats.renderMs / spp; };
    await time();
    const base = await time();
    const rows = [];
    const tris = (objs) => {
      let t = 0;
      for (const o of objs) o.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
        t += n * (m.isInstancedMesh ? m.count : 1);
      });
      return t;
    };
    for (const [name, roots] of Object.entries(engine.moduleRoots || {})) {
      const vis = roots.map((r) => r.visible);
      roots.forEach((r) => (r.visible = false));
      const ms = await time();
      roots.forEach((r, i) => (r.visible = vis[i]));
      rows.push({ module: name, msSaved: Math.round(base - ms), mTris: +(tris(roots) / 1e6).toFixed(2), objects: roots.length });
    }
    rows.sort((a, b) => b.msSaved - a.msSaved);
    return { shot: shotId, msPerSample: Math.round(base), calls: engine.stats.calls, mTrisDrawn: +((engine.stats.triangles || 0) / 1e6).toFixed(1), rows };
  };
  if (!P.get('test')) {
    const { setupVideo } = await import('./video/player.js');
    setupVideo(engine, SHOTS);
  }
  window.__renderTest = async () => {
    engine.applyShot(testInfo.shot);
    return await engine.renderStill(quality.spp);
  };

  setLoading('compiling shaders…', 95);
  if (!P.get('test')) engine.applyShot(shotById(P.get('shot') || 1) || SHOTS[0]);
  else engine.applyShot(testInfo.shot);
  const tc = performance.now();
  await engine.renderer.compileAsync(engine.scene, engine.camera);
  console.log(`[main] shaders compiled in ${Math.round(performance.now() - tc)} ms`);
  window.__READY = true;

  setLoading('ready', 100, '100%');
  document.getElementById('loading')?.remove();

  if (mode === 'interactive') startInteractive(engine, shotById);
}

async function startInteractive(engine, shotById) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const cam = engine.camera;
  const controls = new OrbitControls(cam, engine.canvas);
  const syncTarget = () => {
    const s = engine.shot;
    if (s) controls.target.set(...s.target);
    controls.update();
  };
  syncTarget();
  let moving = true;
  controls.addEventListener('change', () => { moving = true; });
  const hud = document.createElement('div');
  hud.id = 'hud';
  document.body.appendChild(hud);
  addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') {
      const s = shotById(e.key);
      if (s) { engine.applyShot(s); syncTarget(); moving = true; }
    }
    if (e.key === 'p' || e.key === 'P') {
      const p = cam.position, t = controls.target;
      const txt = JSON.stringify({
        pos: [p.x, p.y, p.z].map((v) => +v.toFixed(1)),
        target: [t.x, t.y, t.z].map((v) => +v.toFixed(1)),
        fov: cam.fov,
      });
      console.log(txt);
      navigator.clipboard?.writeText(txt).catch(() => {});
    }
  });
  const clock = new THREE.Clock();
  let animate = P.get('animate') === '1';
  const loop = () => {
    requestAnimationFrame(loop);
    if (animate) { engine.setTime(engine.time + clock.getDelta()); moving = true; }
    if (moving) engine.lighting.refreshCSM();
    engine.renderInteractive(moving);
    moving = false;
    const p = cam.position;
    hud.textContent =
      `shot ${engine.shot?.id ?? '-'}  quality ${engine.quality.name}  samples ${engine._accFrames}\n` +
      `cam ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}  fov ${cam.fov}\n` +
      `calls ${engine.renderer.info.render.calls}  tris ${(engine.renderer.info.render.triangles / 1e6).toFixed(2)}M\n` +
      `keys: 1-9 shots · P copy camera · ?animate=1 for motion`;
  };
  loop();
}

boot().catch((e) => {
  console.error(e);
  window.__RENDER_ERROR = (e && (e.stack || e.message)) || String(e);
  showProgressUI();
  setLoading(`error: ${e?.message || e}`, 0, 'failed');
});
