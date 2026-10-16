// main.js
// ------------------------------------------------------------
// 엔트리포인트. 각 모듈을 초기화하고 연결만 한다 (로직은 각 모듈에 위치).
// ------------------------------------------------------------
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { state, allEntities, addEntity, clearEntities, makeId, markEnvironmentDirty } from './state.js?v=a3299825';
import { makeSkyTexture } from './sky.js?v=af550388';
import { buildPathTracerScene } from './scene-build.js?v=4cc44fb7';
import { createPathTracerCore, stepFrame, onInteract, resetAdaptive, resetSceneGenerator, onWindowResize } from './renderer-core.js?v=6a94f712';
import { setupGUI } from './gui.js?v=0c55b0b8';
import { loadModelFile } from './loader.js?v=e811bb98';
import { SCENES, applyNightToMaterials } from './scenes.js?v=ea739e2e';
import { createPlayer } from './player.js?v=af925a16';
import { createRaster } from './raster.js?v=3c80f8cf';
import { PRESETS, detectQuality } from './quality.js?v=5baa9a25';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const params = state.params;
const infoEl = document.getElementById('samples-info');
const loadingEl = document.getElementById('loading');

// ---------- 렌더러 / 카메라 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
// [최적화] devicePixelRatio 1 고정: 레티나에서 픽셀 수 4배 → 패스트레이싱 비용 4배를 피함
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(params.fov, window.innerWidth / window.innerHeight, 0.05, 3000);

// ---------- 품질 자동 감지 ----------
const detected = detectQuality(renderer);
params.quality = detected.preset;
console.log(`GPU: ${detected.gpu} → 품질 '${detected.preset}'`, detected.reason);
function preset() { return PRESETS[params.quality]; }
function applyPresetParams() {
    const q = preset();
    params.bounces = q.bounces;
    params.movingBounces = q.movingBounces;
    params.maxSamples = q.maxSamples;
    params.resolutionScale = q.resolutionScale;
}
applyPresetParams();

// ---------- 코어 ----------
const raster = createRaster(renderer);
const core = createPathTracerCore(renderer, camera, raster.scene);
const ptMat = core.ptRenderer.material;
function applyRenderSettings() {
    const q = preset();
    ptMat.bounces = params.bounces;
    ptMat.transmissiveBounces = q.transmissiveBounces;
    ptMat.filterGlossyFactor = params.filterGlossy;
    raster.setShadowSize(q.shadowMapSize);
    renderer.toneMappingExposure = params.exposure;
}

const player = createPlayer(camera, renderer.domElement, {
    onSceneKey: (n) => {
        const name = ['city', 'wheat', 'showcase'][n - 1];
        if (name) { params.scene = name; gui.controllers[0].updateDisplay(); loadScene(name); }
    },
});

// ---------- 환경 (하늘/태양) ----------
let envTex = null;
let lastBuild = null;   // { materials, textures } — 밤 조명 갱신용
function refreshEnvironment() {
    if (envTex) envTex.dispose();
    // 512x256: 태양 원반이 각지게 보이지 않을 정도의 해상도 (CDF 계산도 수십 ms 이내)
    const sky = makeSkyTexture(renderer, params, 512, 256);
    envTex = sky.texture;
    ptMat.envMapInfo.updateFrom(envTex);
    ptMat.environmentIntensity = 1.0; // 하늘 밝기는 텍스처에 이미 반영
    raster.setEnvironment(params, sky.palette);
    // 밤에는 창문/가로등 발광
    if (lastBuild && applyNightToMaterials(lastBuild.materials, sky.palette.night)) {
        ptMat.materials.updateFrom(lastBuild.materials, lastBuild.textures);
    }
    state.dirty.environment = false;
    onInteract(core);
}

// ---------- 장면 ----------
function rebuildScene() {
    // 실패해도 매 프레임 재시도하지 않도록 먼저 플래그를 내림
    state.dirty.geometry = false;
    let res;
    try {
        res = buildPathTracerScene({
            entities: allEntities(), camera, renderer,
            ptRenderer: core.ptRenderer, ptSceneGenerator: core.ptSceneGenerator,
            textureSize: preset().textureSize,
        });
    } catch (err) {
        console.error('장면 빌드 실패:', err);
        infoEl.innerText = `Error: ${err.message}`;
        return false;
    }
    raster.setContent(res.group);
    if (!res.ok) { infoEl.innerText = 'Error: No BVH generated'; return false; }
    lastBuild = { materials: res.materials, textures: res.textures };
    // 새 머티리얼에도 현재 시간대 발광 적용
    refreshEnvironment();
    return true;
}

let loadToken = 0;
function loadScene(name, keepPlayer = false) {
    const token = ++loadToken;
    loadingEl.style.display = 'flex';
    // 로딩 문구가 먼저 그려지도록 다음 틱에 무거운 작업 실행
    setTimeout(() => {
        if (token !== loadToken) return;
        const t0 = performance.now();
        const built = SCENES[name](preset());
        clearEntities();
        resetSceneGenerator(core);
        for (const e of built.entities) addEntity(e);
        player.colliders = built.colliders;
        if (!keepPlayer) {
            player.spawn(built.spawn);
            Object.assign(params, built.env);
            gui.controllersRecursive().forEach((c) => c.updateDisplay());
        }
        applyRenderSettings();
        rebuildScene();
        resetAdaptive(core);
        let tris = 0;
        for (const e of built.entities) if (e.mesh) tris += e.mesh.geometry.attributes.position.count / 3;
        console.log(`장면 '${name}': ${built.entities.length} 메시, ${Math.round(tris)} 삼각형, ${(performance.now() - t0).toFixed(0)} ms`);
        loadingEl.style.display = 'none';
    }, 30);
}

// ---------- 오브젝트 추가 ----------
function addPrimitive(type) {
    const c = player.ahead(5);
    const r = type === 'sphere' ? 0.9 : 0.7;
    addEntity({
        id: makeId(type), type,
        transform: { position: [c.x, r, c.z], rotation: [0, 0, 0], scale: type === 'sphere' ? [r, r, r] : [1.4, 1.4, 1.4] },
        material: { color: Math.random() * 0xffffff, roughness: Math.random() * 0.6, metalness: Math.random() > 0.5 ? 1.0 : 0.0 },
        pinned: false,
    });
    player.colliders.push({ min: [c.x - r, 0, c.z - r], max: [c.x + r, 2 * r, c.z + r] });
}
const modelInput = document.getElementById('model-file-input');
modelInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    infoEl.innerText = `Loading ${file.name}...`;
    loadModelFile(file, () => { state.dirty.geometry = true; }, (err) => { infoEl.innerText = `Error: ${err.message}`; }, player.ahead(6));
    modelInput.value = '';
});

// ---------- GUI ----------
const gui = setupGUI({
    onScene: (name) => loadScene(name),
    onQuality: () => { applyPresetParams(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); loadScene(params.scene, true); },
    onEnvChange: () => { markEnvironmentDirty(); refreshEnvironment(); },
    onInteract: () => onInteract(core),
    onBouncesChange: () => { ptMat.bounces = params.bounces; onInteract(core); },
    onFilterChange: () => { ptMat.filterGlossyFactor = params.filterGlossy; onInteract(core); },
    onExposureChange: () => { renderer.toneMappingExposure = params.exposure; refreshEnvironment(); },
    onFov: () => { camera.fov = params.fov; camera.updateProjectionMatrix(); onInteract(core); },
    onAddSphere: () => addPrimitive('sphere'),
    onAddBox: () => addPrimitive('box'),
    onLoadModel: () => modelInput.click(),
});

window.addEventListener('resize', () => onWindowResize(core, renderer, camera));

// ---------- 메인 루프 ----------
let rafId = null;
let lastT = performance.now();
function animate(now = performance.now()) {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    player.speed = params.walkSpeed;
    const moved = player.update(dt);
    if (!lastBuild) { renderer.render(raster.scene, camera); return; }
    raster.follow(camera);
    stepFrame(core, renderer, camera, params, preset(), {
        moved,
        rebuildIfDirty: () => (state.dirty.geometry ? rebuildScene() : false),
        onInfo: ({ samples, fps, tag }) => {
            infoEl.innerText = `Samples: ${samples} · ${fps}fps · ${tag}${player.fly ? ' · 비행' : ''}`;
        },
    });
}

// [최적화] 탭이 백그라운드일 때 루프를 완전히 멈춰 GPU/배터리 절약
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (rafId === null) {
        lastT = performance.now();
        core.lastFrame = lastT;
        onInteract(core);
        animate();
    }
});

applyRenderSettings();
loadScene(params.scene);
animate();
window.__app = { params, player, core, loadScene, get fps() { return core.fps; } };
