// renderer-core.js
// ------------------------------------------------------------
// PathTracingRenderer 생성/관리 + 메인 루프(적응형 해상도/타일링,
// 비동기 셰이더 컴파일 대기). 씬 데이터(state)에는 의존하지만
// "어떤 메시가 있는지"는 모르고, buildScene(callback)으로만 통신한다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { PathTracingRenderer, PhysicalPathTracingMaterial, PathTracingSceneGenerator } from 'three-gpu-pathtracer';

export function createPathTracerCore(renderer, camera) {
    const ptRenderer = new PathTracingRenderer(renderer);
    ptRenderer.camera = camera;
    ptRenderer.material = new PhysicalPathTracingMaterial();

    const ptSceneGenerator = new PathTracingSceneGenerator();
    ptSceneGenerator.generateBVH = true;

    // 화면 표시용 풀스크린 쿼드
    const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const displayScene = new THREE.Scene();
    const displayMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: ptRenderer.target.texture })
    );
    displayMesh.frustumCulled = false;
    displayScene.add(displayMesh);

    const core = {
        ptRenderer, ptSceneGenerator, displayScene, displayCamera, displayMesh,

        // 동적 해상도
        INTERACT_SCALE: 0.35,   // [최적화] 0.4→0.35: 인터랙션/초기 프리뷰를 더 가볍게
        currentScale: -1,
        lastInteraction: performance.now(), // [최적화] 시작을 "인터랙션 중" 상태로: 첫 프레임을 저해상도로

        // 적응형 타일링: 컴파일 직후 첫 프레임은 1타일로 즉시 출력
        idleGrid: 1,
        appliedGrid: -1,
        prevSampleInt: -1,
        avgDt: -1,
        lastFrame: performance.now(),
        wasCompiling: false,
        firstFramePainted: false, // [최적화] 컴파일 완료 후 첫 프레임 플래그
    };

    setGrid(core, core.idleGrid);
    return core;
}

function setGrid(core, n) {
    if (n === core.appliedGrid) return;
    core.appliedGrid = n;
    core.ptRenderer.tiles.set(n, n);
}

export function applyScale(core, renderer, s) {
    if (Math.abs(s - core.currentScale) < 1e-4) return;
    core.currentScale = s;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    core.ptRenderer.setSize(Math.ceil(w * s), Math.ceil(h * s));
    core.displayMesh.material.map = core.ptRenderer.target.texture;
    core.displayMesh.material.needsUpdate = true;
    resetPathTracer(core);
}

export function resetPathTracer(core) {
    core.ptRenderer.reset();
}

export function onInteract(core) {
    core.lastInteraction = performance.now();
    resetPathTracer(core);
}

function adaptTiles(core, targetFPS) {
    const targetMs = 1000 / targetFPS;
    if (core.avgDt > targetMs * 1.25 && core.idleGrid < 8) core.idleGrid++;
    else if (core.avgDt < targetMs * 0.7 && core.idleGrid > 1) core.idleGrid--;
}

// 메인 루프 1프레임 실행. onInfo(text)로 상태 문자열을 전달.
// rebuildIfDirty()는 지오메트리 변경 시에만 BVH를 재빌드하는 콜백 (boolean 반환: 실제로 재빌드했는지)
export function stepFrame(core, renderer, camera, params, { rebuildIfDirty, onInfo }) {
    const now = performance.now();
    const dt = now - core.lastFrame;
    core.lastFrame = now;
    core.avgDt = core.avgDt < 0 ? dt : core.avgDt * 0.9 + dt * 0.1;

    const rebuilt = rebuildIfDirty();
    if (rebuilt) onInteract(core);

    // 비동기 셰이더 컴파일 대기
    const materialReady = !core.ptRenderer.material.isCompiling;
    if (!materialReady) {
        core.wasCompiling = true;
        onInfo('Compiling shader...');
        renderer.setRenderTarget(null);
        renderer.render(core.displayScene, core.displayCamera);
        return;
    }
    if (core.wasCompiling) {
        core.wasCompiling = false;
        resetPathTracer(core);
        core.lastInteraction = now; // [최적화] 컴파일 완료 시점부터 250ms간 저해상도 프리뷰 보장 → 즉시 표시
    }

    const interacting = (now - core.lastInteraction) < 250;
    const target = interacting ? Math.min(core.INTERACT_SCALE, params.resolutionScale) : params.resolutionScale;
    applyScale(core, renderer, target);

    const sampleInt = Math.floor(core.ptRenderer.samples);
    const converged = (!interacting && core.ptRenderer.samples >= params.maxSamples);

    if (interacting) {
        setGrid(core, 1);
    } else if (sampleInt !== core.prevSampleInt) {
        adaptTiles(core, params.targetFPS);
        setGrid(core, core.idleGrid);
    }
    core.prevSampleInt = sampleInt;

    if (!converged) {
        camera.updateMatrixWorld();
        core.ptRenderer.setCamera(camera);
        core.ptRenderer.update();
    }

    renderer.setRenderTarget(null);
    renderer.render(core.displayScene, core.displayCamera);

    const fps = Math.round(1000 / Math.max(core.avgDt, 1));
    const tag = converged ? ' · done' : (interacting ? ' · preview' : ` · ${core.idleGrid}×${core.idleGrid} tiles`);
    onInfo(`Samples: ${sampleInt} · ${fps}fps${tag}`);
}

export function onWindowResize(core, renderer, camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    core.currentScale = -1;
    onInteract(core);
}
