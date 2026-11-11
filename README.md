# Model Vault — GLB Viewer

A local, zero-build 3D viewer for every `.glb` asset in this repository.
Browse real rendered thumbnails, orbit the models, play their animations,
inspect mesh stats, and drop in any GLB from your machine — with no CDN calls
at runtime (three.js and all decoders are vendored in `vendor/three/`).

## Quick start

```bash
npm start        # → http://localhost:5173
```

`npm install` is only needed for regenerating thumbnails. Any static file
server works as well:

```bash
python3 -m http.server 5173
```

A server is required — GLB files cannot be fetched over `file://`. The
bundled `server.js` is a tiny zero-dependency Node static server; use
`PORT=5174 npm start` to change the port.

## The library

All 21 models live in the repo root and are catalogued in
[`src/models.js`](src/models.js) with names, categories, animation clips,
compression, and file size.

- **Search** by name or filename (`/` jumps to the search box)
- **Filter** by category: Vehicles · Characters · Weapons · Props · Scenes
- **Drag & drop** any `.glb` file onto the window to preview it locally —
  nothing is uploaded or written to the repo

## Viewer features

| Feature | Details |
| --- | --- |
| Orbit camera | Drag to orbit · scroll to zoom · right-drag to pan |
| Animations | Multi-clip selection, scrub timeline, play/pause, 0.25–2× speed |
| Mesh stats | Triangles, vertices, meshes, materials, textures, bones, file size |
| Toolbar | Frame model, auto-rotate, wireframe, ground grid |
| Extras | Download the GLB, fullscreen the stage |

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus the search box |
| `F` | Frame the model (reset camera) |
| `R` | Toggle auto-rotate |
| `W` | Toggle wireframe |
| `G` | Toggle ground grid |
| `Space` | Play / pause animation |
| `Esc` | Close menus |

## Regenerating thumbnails

The sidebar thumbnails are real renders of each model. To rebuild them after
adding or editing models:

```bash
npm start                     # terminal 1 — the viewer must be running
npm run thumbs                # terminal 2 — writes thumbs/*.webp
```

This needs Playwright's Chromium (`npx playwright install chromium`, once).
If that exact build is missing, the script falls back to any Chromium in the
Playwright cache, or set `CHROME_PATH=/path/to/chrome` explicitly. `BASE_URL`
overrides the viewer URL (default `http://localhost:5173`).

## Project layout

```
index.html            App shell (importmap → vendored three.js)
styles.css            Full UI styling, incl. mobile breakpoints
src/main.js           Viewer engine: loaders, framing, animations, UI wiring
src/models.js         Asset manifest for the 21 GLB files
server.js             Zero-dependency static server (port 5173)
scripts/render-thumbs.mjs  Headless thumbnail generator
thumbs/               Generated .webp thumbnails (21)
vendor/three/         three.js r187 + Draco WASM + Meshopt decoder
```

## Technical notes

- **Compression support** — the models use KHR_draco_mesh_compression,
  EXT_meshopt_compression, and EXT_texture_webp; the Draco WASM decoders are
  vendored in `vendor/three/draco/`, so no CDN or network access is needed.
- **Smart framing** — models are re-centred on load, and a "focus box"
  heuristic ignores giant low-poly diorama enclosures (e.g. the 1973
  Winnebago's display box) so the actual subject fills the view.
- **Local files** — dropped files are loaded via object URLs and tagged with a
  `Local` chip; the download button always gives you the real bytes.
