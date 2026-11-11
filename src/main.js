import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { models, categories } from "./models.js";

/* ------------------------------------------------------------------ setup */

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const canvas = $("canvas");

const params = new URLSearchParams(location.search);
const THUMB_MODE = params.has("thumb");

const state = {
  active: null,
  cache: new Map(),
  local: [],
  category: "All",
  query: "",
  autoRotate: false,
  wireframe: false,
  grid: true,
  mixer: null,
  actions: [],
  action: null,
  clipIndex: 0,
  playing: true,
  speed: 1,
  scrubbing: false,
  loadToken: 0,
  bounds: null,
};

const el = {
  assetCount: $("assetCount"),
  filters: $("filters"),
  list: $("modelList"),
  resultLabel: $("resultLabel"),
  resultCount: $("resultCount"),
  search: $("search"),
  modelName: $("modelName"),
  modelCategory: $("modelCategory"),
  modelFile: $("modelFile"),
  stats: $("stats"),
  animPanel: $("animPanel"),
  statTris: $("statTris"),
  statVerts: $("statVerts"),
  statMeshes: $("statMeshes"),
  statMats: $("statMats"),
  statTex: $("statTex"),
  statBones: $("statBones"),
  statSize: $("statSize"),
  statClips: $("statClips"),
  playBtn: $("btnPlay"),
  clipSelect: $("clipSelect"),
  clipWrap: $("clipWrap"),
  speedSelect: $("speedSelect"),
  timeline: $("timeline"),
  timeNow: $("timeNow"),
  timeTotal: $("timeTotal"),
  loader: $("loader"),
  loadTitle: $("loadTitle"),
  loadFile: $("loadFile"),
  loadPct: $("loadPct"),
  loadBar: $("loadBar"),
  hint: $("hint"),
  dropzone: $("dropzone"),
  toast: $("toast"),
  btnRotate: $("btnRotate"),
  btnWire: $("btnWire"),
  btnGrid: $("btnGrid"),
  btnFull: $("btnFull"),
  btnReset: $("btnReset"),
  btnDownload: $("btnDownload"),
  menuBtn: $("menuBtn"),
  sidebarClose: $("sidebarClose"),
  scrim: $("scrim"),
  app: $("app"),
};

/* ------------------------------------------------------------- three.js */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
camera.position.set(4, 3, 5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.85;
controls.zoomSpeed = 0.95;
controls.panSpeed = 0.8;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 1.5;
controls.target.set(0, 1, 0);

/* lights */
const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x191c22, 0.55);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff5e8, 2.6);
key.position.set(6, 10, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);

const fill = new THREE.DirectionalLight(0x9db6ff, 0.85);
fill.position.set(-7, 4, 5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xb9a8ff, 1.7);
rim.position.set(-2, 6, -8);
scene.add(rim);

/* ground */
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.5, transparent: true }),
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = 0;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const gridGroup = new THREE.Group();
scene.add(gridGroup);

const modelRoot = new THREE.Group();
scene.add(modelRoot);

/* model loader */
const draco = new DRACOLoader();
draco.setDecoderPath("vendor/three/draco/");

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

/* ---------------------------------------------------------------- assets */

models.forEach((m, i) => {
  m.id = m.file;
  m.index = i;
});
state.all = () => [...state.local, ...models];

/* --------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const nf = new Intl.NumberFormat("en-US");

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function prettyName(file) {
  return file
    .replace(/\.glb$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || "?") + (words[1]?.[0] || "")).toUpperCase();
}

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 4200);
}

/* ------------------------------------------------------------- UI render */

let filterButtons = [];

function renderFilters() {
  const all = state.all();
  const cats = [...categories, ...(state.local.length ? ["Local"] : [])];
  filterButtons = [
    { key: "All", label: "All", count: all.length },
    ...cats.map((c) => ({ key: c, label: c, count: all.filter((m) => m.category === c).length })),
  ];

  el.filters.innerHTML = filterButtons
    .map(
      (f) => `<button class="chip${state.category === f.key ? " active" : ""}" data-cat="${esc(f.key)}" role="tab" aria-selected="${state.category === f.key}">
        ${esc(f.label)}<span class="n">${f.count}</span>
      </button>`,
    )
    .join("");
}

function matches(m) {
  if (state.category === "All") {
    // everything
  } else if (state.category === "Local") {
    if (m.category !== "Local") return false;
  } else if (m.category !== state.category) {
    return false;
  }
  if (!state.query) return true;
  const q = state.query.toLowerCase();
  return m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q) || (m.tag || "").toLowerCase().includes(q);
}

function renderList() {
  const all = state.all().filter(matches);
  el.resultCount.textContent = `${all.length}`;
  el.resultLabel.textContent = state.category === "All" ? (state.query ? "Search results" : "All assets") : state.category;

  if (!all.length) {
    el.list.innerHTML = `<div class="empty-list">No models match “${esc(state.query || state.category)}”.</div>`;
    return;
  }

  el.list.innerHTML = all
    .map((m) => {
      const active = state.active?.id === m.id;
      const meta = [
        m.tag ? `<span>${esc(m.tag)}</span>` : "",
        m.compression ? `<span>${esc(m.compression)}</span>` : "",
        m.clips ? `<span class="anim">${m.clips} clip${m.clips > 1 ? "s" : ""}</span>` : "",
        `<span>${formatBytes(m.bytes)}</span>`,
      ]
        .filter(Boolean)
        .join('<i class="sep"></i>');

      return `<button class="model-card${active ? " active" : ""}" data-id="${esc(m.id)}" aria-current="${active ? "true" : "false"}">
        <span class="thumb">
          ${m.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy" decoding="async" />` : ""}
          <span class="thumb-fallback">${esc(initials(m.name))}</span>
        </span>
        <span class="card-body">
          <span class="card-name" title="${esc(m.name)}">${esc(m.name)}</span>
          <span class="card-file" title="${esc(m.file)}">${esc(m.file)}</span>
          <span class="card-meta">${meta}</span>
        </span>
      </button>`;
    })
    .join("");

  // reveal thumbnails once decoded
  el.list.querySelectorAll(".thumb img").forEach((img) => {
    const done = () => img.classList.add("loaded");
    if (img.complete && img.naturalWidth > 0) done();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

function selectCardInList(id) {
  el.list.querySelectorAll(".model-card").forEach((card) => {
    const on = card.dataset.id === id;
    card.classList.toggle("active", on);
    card.setAttribute("aria-current", on ? "true" : "false");
    if (on) card.scrollIntoView({ block: "nearest" });
  });
}

function updateHeading(entry) {
  el.modelName.textContent = entry.name;
  el.modelCategory.textContent = entry.local ? "Local file" : entry.category;
  el.modelFile.textContent = entry.file;
  document.title = `${entry.name} — Model Vault`;
  el.btnDownload.disabled = false;
}

/* -------------------------------------------------------------- loading UI */

let loaderTimer = null;

function beginLoading(entry) {
  clearTimeout(loaderTimer);
  el.loadTitle.textContent = entry ? `Loading ${entry.name}` : "Loading model";
  el.loadFile.textContent = entry ? entry.file : "";
  el.loadPct.textContent = "0";
  el.loadBar.style.width = "0%";
  loaderTimer = setTimeout(() => el.loader.classList.add("show"), 140);
}

function progressLoading(loaded, total) {
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  el.loadPct.textContent = total > 0 ? String(pct) : "…";
  el.loadBar.style.width = total > 0 ? `${pct}%` : "35%";
}

function endLoading() {
  clearTimeout(loaderTimer);
  el.loader.classList.remove("show");
}

/* --------------------------------------------------------------- the model */

const tmpBox = new THREE.Box3();
const tmpSize = new THREE.Vector3();
const tmpCenter = new THREE.Vector3();

function clearModel() {
  if (state.action) {
    state.action.stop();
    state.action = null;
  }
  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer.uncacheRoot(state.mixer.getRoot());
    state.mixer = null;
  }
  state.actions = [];
  while (modelRoot.children.length) modelRoot.remove(modelRoot.children[0]);
  modelRoot.position.set(0, 0, 0);
}

function configureShadows(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (mat && mat.isMeshStandardMaterial && mat.envMapIntensity !== undefined) {
        mat.envMapIntensity = 0.9;
      }
    }
  });
}

function applyWireframe() {
  modelRoot.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (mat && "wireframe" in mat) {
        mat.wireframe = state.wireframe;
        mat.needsUpdate = true;
      }
    }
  });
}

/**
 * A few assets ship with a giant low-poly enclosure/backdrop (a diorama box).
 * Use the remaining meshes to frame the camera so the actual subject fills the view,
 * while still rendering the backdrop.
 */
function computeFocusBox(root) {
  const items = [];
  root.updateWorldMatrix(true, true);

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (o.visible === false || (mats.length && mats.every((m) => m && m.visible === false))) return;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingBox) return;
    const bb = geo.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const s = bb.getSize(new THREE.Vector3());
    const tris = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
    items.push({ bb, vol: s.x * s.y * s.z, tris });
  });

  if (items.length < 2) return null;

  items.sort((a, b) => b.vol - a.vol);
  let excluded = 0;

  while (items.length > 1) {
    const [first, second] = items;
    if (first.tris > 200 || first.vol < second.vol * 25) break;

    let contained = 0;
    const p = new THREE.Vector3();
    for (let i = 1; i < items.length; i++) {
      items[i].bb.getCenter(p);
      if (first.bb.containsPoint(p)) contained++;
    }
    if (contained / (items.length - 1) < 0.6) break;

    items.shift();
    excluded++;
  }

  if (!excluded) return null;

  const box = new THREE.Box3();
  for (const item of items) box.union(item.bb);
  return box;
}

function rebuildGround(radius, cx = 0, cz = 0) {
  // Grid
  while (gridGroup.children.length) {
    const c = gridGroup.children[0];
    gridGroup.remove(c);
    c.geometry?.dispose();
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
    else c.material?.dispose();
  }

  const rawStep = radius / 2.5;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / pow;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * pow;
  const size = step * 24;
  const grid = new THREE.GridHelper(size, Math.round(size / step), 0x525d75, 0x2a3242);
  grid.position.set(0, 0.002, 0);
  gridGroup.position.set(cx, 0, cz);
  grid.material.transparent = true;
  grid.material.opacity = 0.38;
  grid.material.depthWrite = false;
  gridGroup.add(grid);
  gridGroup.visible = state.grid;

  // shadow catcher
  shadowPlane.scale.setScalar(size * 1.6);
  shadowPlane.position.set(cx, 0, cz);

  // shadow camera
  const s = Math.max(radius * 1.6, 0.5);
  key.position.set(radius * 2.2, radius * 4.2, radius * 2.6);
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.camera.near = radius * 0.05;
  key.shadow.camera.far = radius * 14;
  key.shadow.normalBias = Math.max(radius * 0.002, 0.0005);
  key.shadow.camera.updateProjectionMatrix();

  fill.position.set(-radius * 2.4, radius * 1.8, radius * 2.2);
  rim.position.set(-radius * 1.2, radius * 2.6, -radius * 3.2);
}

function frameModel() {
  if (!state.bounds) return;
  const { radius, centerX = 0, centerY, centerZ = 0 } = state.bounds;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fitFov = Math.min(vFov, hFov);
  const dist = (radius / Math.sin(fitFov / 2)) * 1.08;

  const dir = new THREE.Vector3(0.92, 0.5, 1.1).normalize();
  controls.target.set(centerX, centerY, centerZ);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 2000, 0.0001);
  camera.far = dist * 120;
  camera.updateProjectionMatrix();

  controls.minDistance = Math.max(radius * 0.18, 0.001);
  controls.maxDistance = Math.max(radius * 40, 2);
  controls.update();
}

function showModel(gltf, entry) {
  clearModel();

  const root = gltf.scene || gltf.scenes?.[0];
  if (!root) throw new Error("The file has no scene to display.");

  configureShadows(root);
  modelRoot.add(root);
  modelRoot.position.set(0, 0, 0);
  modelRoot.updateMatrixWorld(true);

  tmpBox.setFromObject(root);
  tmpBox.getSize(tmpSize);
  tmpBox.getCenter(tmpCenter);

  if (!Number.isFinite(tmpSize.x) || tmpSize.lengthSq() === 0) {
    throw new Error("The model appears to be empty.");
  }

  // Frame the actual subject even if the asset ships with a large diorama box.
  const focusBox = computeFocusBox(root);
  const focusSize = (focusBox || tmpBox).getSize(new THREE.Vector3());
  const focusCenter = (focusBox || tmpBox).getCenter(new THREE.Vector3());
  const radius = Math.max(focusSize.length() / 2, 0.001);

  // rest it on the ground, centered on the origin (bounds are relative to that shift)
  modelRoot.position.set(-tmpCenter.x, -tmpBox.min.y, -tmpCenter.z);
  modelRoot.updateMatrixWorld(true);

  const centerX = focusCenter.x - tmpCenter.x;
  const centerY = focusCenter.y - tmpBox.min.y;
  const centerZ = focusCenter.z - tmpCenter.z;
  state.bounds = { radius, centerX, centerY, centerZ };

  rebuildGround(radius, centerX, centerZ);
  if (!THUMB_MODE) frameModel();

  applyWireframe();
  updateStats(root, entry);
  setupAnimations(gltf, entry);

  if (THUMB_MODE) {
    // a nicer three-quarter angle for the sidebar thumbnails
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dir = new THREE.Vector3(0.85, 0.42, 1.15).normalize();
    controls.target.set(centerX, centerY, centerZ);
    camera.position.copy(controls.target).addScaledVector(dir, dist * 0.98);
    camera.near = Math.max(dist / 2000, 0.0001);
    camera.far = dist * 120;
    camera.updateProjectionMatrix();
    controls.update();
    scene.background = null;
    shadowPlane.visible = false;
    gridGroup.visible = false;
    hemi.intensity = 0.9;
    key.intensity = 2.2;
    fill.intensity = 1.0;
    rim.intensity = 1.2;
    if (state.mixer) {
      state.mixer.update(0.55);
      state.mixer.timeScale = 0;
    }
    window.__thumbReady = true;
  }
}

/* ------------------------------------------------------------------ stats */

function updateStats(root, entry) {
  let tris = 0;
  let verts = 0;
  let meshes = 0;
  let bones = 0;
  const materials = new Set();
  const textures = new Set();
  const textureKeys = [
    "map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap",
    "specularMap", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughnessMap", "sheenColorMap",
    "sheenRoughnessMap", "transmissionMap", "thicknessMap", "iridescenceMap", "iridescenceThicknessMap",
  ];

  root.traverse((o) => {
    if (o.isBone) bones++;
    if (!o.isMesh) return;
    meshes++;
    const geo = o.geometry;
    const pos = geo?.attributes?.position;
    if (pos) verts += pos.count;
    if (geo?.index) tris += geo.index.count / 3;
    else if (pos) tris += pos.count / 3;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      materials.add(mat);
      for (const k of textureKeys) if (mat[k]) textures.add(mat[k]);
    }
  });

  el.statTris.textContent = nf.format(Math.round(tris));
  el.statVerts.textContent = nf.format(verts);
  el.statMeshes.textContent = nf.format(meshes);
  el.statMats.textContent = nf.format(materials.size);
  el.statTex.textContent = nf.format(textures.size);
  el.statBones.textContent = bones ? nf.format(bones) : "—";
  el.statSize.textContent = formatBytes(entry?.bytes ?? 0);
  el.statClips.textContent = nf.format(entry?.clips ?? 0);
  el.stats.hidden = THUMB_MODE;

  const anims = entry?.clips ?? 0;
  el.statClips.textContent = nf.format(anims);
}

/* -------------------------------------------------------------- animation */

function setupAnimations(gltf, entry) {
  if (!gltf.animations?.length) {
    el.animPanel.hidden = true;
    return;
  }

  state.mixer = new THREE.AnimationMixer(gltf.scene);
  state.actions = gltf.animations.map((clip, i) => {
    const action = state.mixer.clipAction(clip);
    action.loop = THREE.LoopRepeat;
    action.clampWhenFinished = false;
    action.enabled = true;
    return action;
  });

  el.clipSelect.innerHTML = gltf.animations
    .map((clip, i) => {
      const name = clip.name?.trim() || `Clip ${i + 1}`;
      return `<option value="${i}">${esc(name)}</option>`;
    })
    .join("");
  el.clipWrap.style.visibility = gltf.animations.length > 1 ? "visible" : "hidden";

  state.speed = parseFloat(el.speedSelect.value) || 1;
  state.mixer.timeScale = state.speed;

  selectClip(0);
  el.animPanel.hidden = THUMB_MODE;
  el.animPanel.style.display = "";

  // duration of the selected clip
  updateTimelineUI(true);
}

function selectClip(index) {
  if (!state.actions.length) return;
  if (state.action) state.action.stop();

  state.clipIndex = index;
  const action = state.actions[index];
  state.action = action;
  el.clipSelect.value = String(index);

  action.reset();
  action.setEffectiveWeight(1);
  action.paused = !state.playing;
  action.play();

  el.timeTotal.textContent = action.getClip().duration.toFixed(2);
  el.timeline.value = "0";
  updateRangeFill(el.timeline, 0);
  el.timeNow.textContent = "0.00";
}

function updateTimelineUI(force = false) {
  const action = state.action;
  if (!action) return;
  const duration = action.getClip().duration || 1;
  let t = action.time;
  if (!Number.isFinite(t)) t = 0;
  t = THREE.MathUtils.clamp(t, 0, duration);

  if (!state.scrubbing || force) {
    const p = duration > 0 ? (t / duration) * 1000 : 0;
    el.timeline.value = String(Math.round(p));
    updateRangeFill(el.timeline, p);
  }
  el.timeNow.textContent = t.toFixed(2);
  el.timeTotal.textContent = duration.toFixed(2);
}

function updateRangeFill(input, pct) {
  input.style.setProperty("--fill", `${THREE.MathUtils.clamp(pct, 0, 100)}%`);
}

function setPlaying(playing) {
  state.playing = playing;
  if (state.action) state.action.paused = !playing;
  el.playBtn.classList.toggle("playing", playing);
  el.playBtn.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
}

/* ---------------------------------------------------------- model selection */

async function loadGLTF(entry, onProgress) {
  if (state.cache.has(entry.id)) return state.cache.get(entry.id);

  let gltf;
  if (entry.localFile) {
    const buffer = await entry.localFile.arrayBuffer();
    gltf = await loader.parseAsync(buffer, "");
  } else {
    gltf = await new Promise((resolve, reject) => {
      loader.load(entry.file, resolve, onProgress, reject);
    });
  }

  state.cache.set(entry.id, gltf);
  return gltf;
}

async function selectModel(entry, { initial = false } = {}) {
  if (!entry) return;
  if (state.active?.id === entry.id && !initial) {
    frameModel();
    return;
  }

  const token = ++state.loadToken;
  state.active = entry;

  updateHeading(entry);
  renderList();
  selectCardInList(entry.id);
  if (!THUMB_MODE) {
    el.stats.hidden = true;
    el.animPanel.hidden = true;
    beginLoading(entry);
  }
  setPlaying(true);

  if (!THUMB_MODE) {
    history.replaceState(null, "", `#${encodeURIComponent(entry.file)}`);
  }

  try {
    const gltf = await loadGLTF(entry, (e) => {
      if (token === state.loadToken) progressLoading(e.loaded, e.total);
    });
    if (token !== state.loadToken) return;

    progressLoading(1, 1);
    if (entry.local) entry.clips = gltf.animations?.length || 0;
    showModel(gltf, entry);
    if (!THUMB_MODE) {
      el.stats.hidden = false;
      hideHintSoon();
      if (entry.local) renderList();
    }
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error(err);
    toast(`Could not load “${entry.name}”. ${err?.message || "The file may be corrupt."}`);
    el.stats.hidden = true;
    el.animPanel.hidden = true;
  } finally {
    if (token === state.loadToken) endLoading();
  }
}

/* ------------------------------------------------------------- local files */

async function openLocalFile(file) {
  if (!/\.glb$/i.test(file.name)) {
    toast("Only .glb files can be previewed. Drop a binary glTF file.");
    return;
  }

  const entry = {
    id: `local:${file.name}:${file.size}:${file.lastModified}`,
    file: file.name,
    name: prettyName(file.name),
    category: "Local",
    tag: "Local",
    bytes: file.size,
    clips: 0,
    compression: null,
    source: null,
    thumb: null,
    localFile: file,
    local: true,
  };

  const existing = state.local.findIndex((m) => m.id === entry.id);
  if (existing !== -1) {
    selectModel(state.local[existing]);
    return;
  }
  entry.objectUrl = URL.createObjectURL(file);
  state.local.unshift(entry);
  state.category = "All";
  state.query = "";
  el.search.value = "";
  renderFilters();

  await selectModel(entry);
  if (!state.active || state.active.id !== entry.id) {
    // failed; remove from the list
    state.local = state.local.filter((m) => m.id !== entry.id);
    renderFilters();
    renderList();
  }
}

/* ------------------------------------------------------------------- hint */

let hintTimer = setTimeout(() => el.hint.classList.add("hide"), 9000);

function hideHintSoon() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.hint.classList.add("hide"), 3500);
}

function markInteraction() {
  el.hint.classList.add("hide");
}

/* ----------------------------------------------------------------- events */

el.filters.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.category = btn.dataset.cat;
  renderFilters();
  renderList();
});

el.list.addEventListener("click", (e) => {
  const card = e.target.closest(".model-card");
  if (!card) return;
  const entry = state.all().find((m) => m.id === card.dataset.id);
  if (entry) {
    selectModel(entry);
    closeNav();
  }
});

el.search.addEventListener("input", () => {
  state.query = el.search.value.trim();
  renderList();
});

el.search.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    el.search.value = "";
    state.query = "";
    renderList();
    el.search.blur();
  }
});

canvas.addEventListener("pointerdown", () => {
  markInteraction();
  el.hint.classList.add("hide");
});

el.btnReset.addEventListener("click", () => frameModel());

el.btnRotate.addEventListener("click", () => {
  state.autoRotate = !state.autoRotate;
  controls.autoRotate = state.autoRotate;
  el.btnRotate.setAttribute("aria-pressed", String(state.autoRotate));
});

el.btnWire.addEventListener("click", () => {
  state.wireframe = !state.wireframe;
  applyWireframe();
  el.btnWire.setAttribute("aria-pressed", String(state.wireframe));
});

el.btnGrid.addEventListener("click", () => {
  state.grid = !state.grid;
  gridGroup.visible = state.grid;
  el.btnGrid.setAttribute("aria-pressed", String(state.grid));
});

el.btnFull.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  } catch {
    toast("Fullscreen is not available in this browser.");
  }
});

el.btnDownload.addEventListener("click", () => {
  const entry = state.active;
  if (!entry) return;
  const url = entry.objectUrl || entry.file;
  const a = document.createElement("a");
  a.href = url;
  a.download = entry.file;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

el.playBtn.addEventListener("click", () => {
  setPlaying(!state.playing);
});

el.clipSelect.addEventListener("change", () => {
  selectClip(parseInt(el.clipSelect.value, 10));
  setPlaying(true);
});

el.speedSelect.addEventListener("change", () => {
  state.speed = parseFloat(el.speedSelect.value) || 1;
  if (state.mixer) state.mixer.timeScale = state.speed;
});

el.timeline.addEventListener("pointerdown", () => {
  state.scrubbing = true;
});
el.timeline.addEventListener("input", () => {
  state.scrubbing = true;
  const action = state.action;
  if (!action) return;
  const duration = action.getClip().duration || 0;
  const p = parseFloat(el.timeline.value) / 1000;
  action.time = p * duration;
  if (state.mixer) state.mixer.update(0);
  updateRangeFill(el.timeline, p * 100);
  el.timeNow.textContent = (p * duration).toFixed(2);
});
const stopScrub = () => {
  state.scrubbing = false;
};
el.timeline.addEventListener("pointerup", stopScrub);
el.timeline.addEventListener("pointercancel", stopScrub);
el.timeline.addEventListener("change", stopScrub);
el.timeline.addEventListener("blur", stopScrub);

/* mobile nav */
function openNav() {
  el.app.classList.add("nav-open");
}
function closeNav() {
  el.app.classList.remove("nav-open");
}
el.menuBtn.addEventListener("click", openNav);
el.sidebarClose.addEventListener("click", closeNav);
el.scrim.addEventListener("click", closeNav);

/* drag + drop */
let dragDepth = 0;

window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  if (!THUMB_MODE) el.dropzone.classList.add("active");
});

window.addEventListener("dragover", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) el.dropzone.classList.remove("active");
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.dropzone.classList.remove("active");
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const glb = [...files].find((f) => /\.glb$/i.test(f.name));
  if (!glb) {
    toast("No .glb file found in that drop.");
    return;
  }
  openLocalFile(glb);
});

/* keyboard shortcuts */
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;
  if (THUMB_MODE) return;

  if (e.key === "/" && !typing) {
    e.preventDefault();
    el.search.focus();
    el.search.select();
    return;
  }
  if (e.key === "Escape") {
    closeNav();
    return;
  }
  if (typing) return;
  if (e.code === "Space" && tag === "BUTTON") return;

  switch (e.key.toLowerCase()) {
    case "r":
      el.btnRotate.click();
      break;
    case "w":
      el.btnWire.click();
      break;
    case "g":
      el.btnGrid.click();
      break;
    case "f":
      el.btnReset.click();
      break;
    case " ":
      if (!el.animPanel.hidden) {
        e.preventDefault();
        setPlaying(!state.playing);
      }
      break;
  }
});

/* resize */
const resize = () => {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};

new ResizeObserver(resize).observe(stage);
resize();

/* ------------------------------------------------------------- animation loop */

const timer = new THREE.Timer();
timer.connect(document);

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);

  if (state.mixer && !state.scrubbing && state.playing) {
    state.mixer.update(dt);
  }
  if (state.action) updateTimelineUI();

  controls.update();
  renderer.render(scene, camera);
});

/* ------------------------------------------------------------------- boot */

function boot() {
  renderFilters();
  renderList();

  if (THUMB_MODE) {
    document.body.classList.add("thumb-mode");
    el.stats.hidden = true;
    el.animPanel.hidden = true;
    el.loader.classList.remove("show");
    el.hint.style.display = "none";
    const file = params.get("thumb");
    const entry =
      models.find((m) => m.file === file) || {
        id: `thumb:${file}`,
        file,
        name: prettyName(file),
        category: "Local",
        tag: "",
        bytes: 0,
        clips: 0,
        compression: null,
        thumb: null,
      };
    selectModel(entry, { initial: true });
    return;
  }

  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const fromQuery = params.get("model");
  const wanted = hash || fromQuery;
  const initial =
    state.all().find((m) => m.file === wanted || m.id === wanted) || state.all()[0];

  selectModel(initial, { initial: true });
}

boot();

// handy for debugging / automated checks
window.__MODEL_VAULT__ = { THREE, state, scene, camera, controls, renderer, selectModel, modelRoot, computeFocusBox };
