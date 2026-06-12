// main.js
// ------------------------------------------------------------
// 엔트리포인트. 각 모듈을 초기화하고 연결만 한다 (로직은 각 모듈에 위치).
// ------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { state, allEntities, createDefaultEntities, addEntity, markEnvironmentDirty } from './state.js';
import { makeSkyTexture } from './sky.js';
import { buildPathTracerScene } from './scene-build.js';
import { createPathTracerCore, stepFrame, onInteract, onWindowResize } from './renderer-core.js';
import { createSelection } from './selection.js';
import { setupGUI } from './gui.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// ---------- 렌더러 / 카메라 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = state.params.exposure;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(6, 4.5, 9);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 1.2, 0);
orbitControls.update();

// 보조 씬 (선택 기즈모 등 래스터 오버레이용 — 패스트레이서와 별개)
const helperScene = new THREE.Scene();

// ---------- 패스트레이서 코어 ----------
const core = createPathTracerCore(renderer, camera);

// ---------- 초기 데이터 ----------
for (const e of createDefaultEntities()) addEntity(e);

let envTex = null;
function refreshEnvironment() {
    if (envTex) envTex.dispose();
    envTex = makeSkyTexture(renderer, state.params);
    core.ptRenderer.material.envMapInfo.updateFrom(envTex);
    core.ptRenderer.material.environmentIntensity = state.params.envIntensity;
    onInteract(core);
}

// ---------- 선택/이동 ----------
const selection = createSelection({
    renderer, camera, scene: helperScene, orbitControls,
    onDragStateChange: (dragging) => {
        if (!dragging) onInteract(core); // 드래그 종료 시 누적 리셋
    },
});

// ---------- GUI ----------
setupGUI({
    onEnvChange: () => { markEnvironmentDirty(); refreshEnvironment(); },
    onInteract: () => onInteract(core),
    onBouncesChange: () => { core.ptRenderer.bounces = state.params.bounces; onInteract(core); },
    onFilterChange: () => { core.ptRenderer.material.filterGlossyFactor = state.params.filterGlossy; onInteract(core); },
    onExposureChange: () => { renderer.toneMappingExposure = state.params.exposure; onInteract(core); },
    onRemoveSelected: (id) => selection.select(null),
});

// ---------- 초기 빌드 ----------
core.ptRenderer.material.filterGlossyFactor = state.params.filterGlossy;
core.ptRenderer.bounces = state.params.bounces;
refreshEnvironment();

camera.updateMatrixWorld();
core.ptRenderer.setCamera(camera);
rebuildScene(); // 최초 BVH

// ---------- 재빌드 ----------
function rebuildScene() {
    const info = document.getElementById('samples-info');
    const res = buildPathTracerScene({
        entities: allEntities(),
        camera,
        renderer,
        ptRenderer: core.ptRenderer,
        ptSceneGenerator: core.ptSceneGenerator,
    });
    state.dirty.geometry = false;
    if (!res.ok && info) info.innerText = 'Error: No BVH generated';
    else console.log(`✅ BVH 재빌드 (컬링: ${res.culled}/${res.total})`);
    return res.ok;
}

// 카메라 이동 시 컬링 갱신을 위해 재빌드 필요 -> orbit 종료 시 1회 dirty 표시
orbitControls.addEventListener('end', () => { state.dirty.geometry = true; });

// ---------- 윈도우 리사이즈 ----------
window.addEventListener('resize', () => onWindowResize(core, renderer, camera));

// ---------- 메인 루프 ----------
const infoEl = document.getElementById('samples-info');
function animate() {
    requestAnimationFrame(animate);
    stepFrame(core, renderer, camera, state.params, {
        rebuildIfDirty: () => {
            if (!state.dirty.geometry) return false;
            return rebuildScene();
        },
        onInfo: (text) => { if (infoEl) infoEl.innerText = text; },
    });

    // 기즈모 오버레이: 패스트레이서 출력 위에 추가 렌더 (depth 무시, 항상 위에 표시)
    if (state.selectedId) {
        renderer.autoClear = false;
        renderer.render(helperScene, camera);
        renderer.autoClear = true;
    }
}
animate();
