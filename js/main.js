// main.js
// ------------------------------------------------------------
// 엔트리포인트. 각 모듈을 초기화하고 연결만 한다 (로직은 각 모듈에 위치).
// ------------------------------------------------------------
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { state, allEntities, createDefaultEntities, addEntity, markEnvironmentDirty } from './state.js?v=6';
import { makeSkyTexture } from './sky.js?v=6';
import { buildPathTracerScene } from './scene-build.js?v=6';
import { createPathTracerCore, stepFrame, onInteract, onWindowResize } from './renderer-core.js?v=6';
import { createSelection } from './selection.js?v=6';
import { setupGUI } from './gui.js?v=6';
import { loadModelFile } from './loader.js?v=6';

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
orbitControls.enableDamping = true;   // [최적화] 관성 댐핑: 드래그 후 카메라가 부드럽게 멈춤
orbitControls.dampingFactor = 0.08;
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

// 씬 규모가 작아 컬링 재빌드 비용이 이득보다 크므로, 카메라 이동마다
// 재빌드하지 않음. 컬링은 cullEntities의 임계값(CULL_THRESHOLD) 이하에서 비활성화된다.

// ---------- 윈도우 리사이즈 ----------
window.addEventListener('resize', () => onWindowResize(core, renderer, camera));

// ---------- 모델 로더 ----------
const modelInput = document.getElementById('model-file-input');
if (modelInput) {
    modelInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (infoEl) infoEl.innerText = `Loading ${file.name}...`;
        loadModelFile(
            file,
            () => { state.dirty.geometry = true; }, // 다음 프레임에 rebuildIfDirty가 처리
            (err) => { if (infoEl) infoEl.innerText = `Error: ${err.message}`; }
        );
        modelInput.value = ''; // 같은 파일 다시 선택 가능하도록
    });
}

// ---------- 메인 루프 ----------
const infoEl = document.getElementById('samples-info');
let rafId = null;

function animate() {
    rafId = requestAnimationFrame(animate);
    orbitControls.update(); // [최적화] 댐핑 적용 (입력 없을 때도 호출해야 자연스럽게 감속)
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

// [최적화] 탭이 백그라운드일 때 루프를 완전히 멈춰 GPU/배터리 절약.
// 복귀 시 누적을 리셋하고 다시 시작 (백그라운드 동안 쌓인 비정상 dt 방지).
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (rafId === null) {
        core.lastFrame = performance.now();
        onInteract(core);
        animate();
    }
});

animate();
