// Quality presets. Modules must scale their density/resolution with these numbers so the
// interactive preview stays usable on an integrated GPU while offline renders go all out.
export const QUALITY = {
  low: {
    name: 'low', spp: 1, msaa: 1,
    shadowMapSize: 1024, cascades: 2, shadowMaxFar: 900, softShadows: false,
    terrainRes: 0.3,
    density: 0.25,
    detail: 0.35,
    cloudSteps: 8, bloom: false, ao: false,
  },
  preview: {
    name: 'preview', spp: 1, msaa: 4,
    shadowMapSize: 2048, cascades: 3, shadowMaxFar: 1400, softShadows: false,
    terrainRes: 0.5,
    density: 0.45,
    detail: 0.5,
    cloudSteps: 16, bloom: true, ao: false,
  },
  high: {
    name: 'high', spp: 12, msaa: 4,
    shadowMapSize: 4096, cascades: 4, shadowMaxFar: 2400, softShadows: true,
    terrainRes: 1.0, density: 1.0, detail: 1.0,
    cloudSteps: 32, bloom: true, ao: true,
  },
  ultra: {
    name: 'ultra', spp: 48, msaa: 4,
    shadowMapSize: 4096, cascades: 4, shadowMaxFar: 3200, softShadows: true,
    terrainRes: 1.0, density: 1.0, detail: 1.0,
    cloudSteps: 64, bloom: true, ao: true,
  },
};

export function getQuality(name) { return { ...(QUALITY[name] || QUALITY.preview) }; }
