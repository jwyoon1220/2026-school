// renderer-core.js
// ------------------------------------------------------------
// PathTracingRenderer 생성/관리 + 메인 루프.
//
// [핵심 동작]
// - 인터랙션(카메라 회전/오브젝트 이동) 중에는 해상도 사다리의 가장 낮은
//   단계로 떨어져 1x1 타일 1샘플/프레임으로 가볍게 그린다.
// - 인터랙션이 멈추면, 매 프레임 해상도 사다리를 한 단계씩 올린다.
//   각 단계 전환은 setSize(reset)을 수반하지만, 그 즉시 1x1 타일로
//   화면 전체를 1샘플 채우므로 검은 화면이 보이지 않는다 — 즉
//   "프리뷰가 점점 고해상도화"되는 식으로 보인다.
// - 사다리 최상단(목표 resolutionScale)에 도달한 뒤에는 타일을 키우고
//   프레임당 update() 호출 수를 늘려가며 안티에일리어싱 샘플을 누적한다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { PathTracingRenderer, PhysicalPathTracingMaterial, PathTracingSceneGenerator } from 'three-gpu-pathtracer';

// 해상도 사다리: resolutionScale에 대한 비율. 마지막 값은 항상 1.0(목표 해상도).
const RES_LADDER = [0.18, 0.35, 0.55, 0.8, 1.0];

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

        currentScale: -1,
        resStep: 0, // 해상도 사다리 인덱스. 0=가장 낮은 프리뷰, RES_LADDER.length-1=목표 해상도
        lastInteraction: performance.now(),

        idleGrid: 1,
        appliedGrid: -1,
        prevSampleInt: -1,
        avgDt: -1,
        lastFrame: performance.now(),
        wasCompiling: false,

        // 프레임당 ptRenderer.update() 호출 수 (목표 해상도 도달 후의 AA 누적 처리량)
        updatesPerFrame: 1,
    };

    setGrid(core, core.idleGrid);
    return core;
}

function setGrid(core, n) {
    if (n === core.appliedGrid) return;
    core.appliedGrid = n;
    core.ptRenderer.tiles.set(n, n);
}

// 렌더 타깃 해상도 변경. scale이 바뀔 때만 setSize+reset 수행.
function applyScale(core, renderer, s) {
    if (Math.abs(s - core.currentScale) < 1e-4) return false;
    core.currentScale = s;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    core.ptRenderer.setSize(Math.max(1, Math.ceil(w * s)), Math.max(1, Math.ceil(h * s)));
    core.displayMesh.material.map = core.ptRenderer.target.texture;
    core.displayMesh.material.needsUpdate = true;
    resetPathTracer(core);
    return true;
}

export function resetPathTracer(core) {
    core.ptRenderer.reset();
}

// 카메라/오브젝트 이동 등 "씬이 바뀜" 시그널.
// 해상도 사다리를 최하단으로 내려 다음 프레임부터 다시 점진적으로 올라가게 한다.
export function onInteract(core) {
    core.lastInteraction = performance.now();
    core.resStep = 0;
    setGrid(core, 1);
    core.updatesPerFrame = 1;
    resetPathTracer(core);
}

function adaptTiles(core, targetFPS) {
    const targetMs = 1000 / targetFPS;
    if (core.avgDt > targetMs * 1.25 && core.idleGrid < 16) core.idleGrid++;
    else if (core.avgDt < targetMs * 0.7 && core.idleGrid > 1) core.idleGrid--;
}

function adaptThroughput(core, targetFPS) {
    const targetMs = 1000 / targetFPS;
    if (core.avgDt < targetMs * 0.6 && core.updatesPerFrame < 8) core.updatesPerFrame++;
    else if (core.avgDt > targetMs * 1.1 && core.updatesPerFrame > 1) core.updatesPerFrame--;
}

// 메인 루프 1프레임 실행.
export function stepFrame(core, renderer, camera, params, { rebuildIfDirty, onInfo }) {
    const now = performance.now();
    const dt = now - core.lastFrame;
    core.lastFrame = now;
    core.avgDt = core.avgDt < 0 ? dt : core.avgDt * 0.9 + dt * 0.1;

    const rebuilt = rebuildIfDirty();
    if (rebuilt) onInteract(core);

    const interacting = (now - core.lastInteraction) < 250;
    const atTargetRes = core.resStep >= RES_LADDER.length - 1;

    // 해상도 사다리 적용: interacting이면 최하단 유지, 아니면 한 단계씩 상승
    if (interacting) {
        core.resStep = 0;
    } else if (!atTargetRes) {
        core.resStep++;
    }
    const scale = RES_LADDER[core.resStep] * params.resolutionScale;
    const resized = applyScale(core, renderer, scale);
    if (resized) {
        setGrid(core, 1);          // 새 해상도의 1샘플로 화면 전체를 즉시 채움 (검은 화면 방지)
        core.updatesPerFrame = 1;
    }

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
        onInteract(core); // 컴파일 완료 직후 사다리 최하단부터 다시 상승
    }

    const sampleInt = Math.floor(core.ptRenderer.samples);
    const converged = (!interacting && atTargetRes && !resized && core.ptRenderer.samples >= params.maxSamples);

    // 사다리 상승 중(또는 막 도착)에는 1x1 타일 1샘플로 다음 단계 전환을 빠르게 준비
    const rampingRes = interacting || !atTargetRes || resized;
    if (rampingRes) {
        setGrid(core, 1);
        core.updatesPerFrame = 1;
    } else if (sampleInt !== core.prevSampleInt) {
        adaptTiles(core, params.targetFPS);
        adaptThroughput(core, params.targetFPS);
        setGrid(core, core.idleGrid);
    }
    core.prevSampleInt = sampleInt;

    if (!converged) {
        camera.updateMatrixWorld();
        core.ptRenderer.setCamera(camera);

        const calls = rampingRes ? 1 : core.updatesPerFrame;
        for (let i = 0; i < calls; i++) {
            core.ptRenderer.update();
            if (core.ptRenderer.samples >= params.maxSamples) break;
        }
    }

    renderer.setRenderTarget(null);
    renderer.render(core.displayScene, core.displayCamera);

    const fps = Math.round(1000 / Math.max(core.avgDt, 1));
    let tag;
    if (converged) tag = ' · done';
    else if (interacting) tag = ' · live';
    else if (!atTargetRes) tag = ` · ${Math.round(scale * 100)}%`;
    else tag = ` · ${core.idleGrid}×${core.idleGrid}t × ${core.updatesPerFrame}`;

    if (now - (core.lastInfoUpdate || 0) > 250) {
        core.lastInfoUpdate = now;
        onInfo(`Samples: ${sampleInt} · ${fps}fps${tag}`);
    }
}

export function onWindowResize(core, renderer, camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    core.currentScale = -1;
    onInteract(core);
}
