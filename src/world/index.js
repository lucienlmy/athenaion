// Builds the full world by running each module's build(engine) in dependency order.
// A failing module is logged and skipped so one broken piece never blanks the whole world.
export const MODULE_ORDER = [
  'terrain', 'water', 'temple', 'acropolis', 'aqueducts', 'sets', 'statues',
  'city', 'ruins', 'banners', 'vegetation', 'flora', 'waterfalls', 'clouds', 'birds',
];

function yieldToBrowser() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

export async function buildWorld(engine, onProgress) {
  const skip = (engine.params.get('skip') || '').split(',').filter(Boolean);
  const only = (engine.params.get('only') || '').split(',').filter(Boolean);
  const list = MODULE_ORDER.filter((name) => !skip.includes(name) && (!only.length || only.includes(name)));
  const total = list.length;
  let done = 0;

  for (const name of list) {
    onProgress?.({ phase: 'module', module: name, index: done, total, pct: Math.round((done / total) * 100) });
    await yieldToBrowser();

    let mod;
    try {
      mod = await import(`../modules/${name}.js`);
    } catch (e) {
      if (String(e).includes('Failed to fetch') || String(e).includes('404')) {
        console.log(`[world] module ${name}: not present`);
        done++;
        continue;
      }
      console.error(`[world] module ${name} failed to load:`, e.stack || e);
      done++;
      continue;
    }
    if (typeof mod.build !== 'function') { done++; continue; }
    const t0 = performance.now();
    const before = new Set(engine.scene.children);
    try {
      await mod.build(engine);
      (engine.moduleRoots ||= {})[name] = engine.scene.children.filter((c) => !before.has(c));
      console.log(`[world] ${name} built in ${Math.round(performance.now() - t0)} ms`);
    } catch (e) {
      console.error(`[world] module ${name} threw during build:`, e.stack || e);
    }
    done++;
    onProgress?.({ phase: 'module', module: name, index: done, total, pct: Math.round((done / total) * 100), done: true });
  }

  onProgress?.({ phase: 'done', index: total, total, pct: 100 });
}
