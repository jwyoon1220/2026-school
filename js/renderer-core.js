// renderer-core.js
// ------------------------------------------------------------
// PathTracingRenderer 생성/관리 + 메인 루프(적응형 타일링, 비동기 셰이더
// 컴파일 대기). 씬 데이터(state)에는 의존하지만 "어떤 메시가 있는지"는
// 모르고, rebuildIfDirty 콜백으로만 통신한다.
//
// [핵심] 렌더 타깃 해상도는 resolutionScale이 바뀔 때(또는 윈도우 리사이즈)만
// applyScale()로 변경한다. 인터랙션(카메라 회전/오브젝트 이동) 중에는
// 해상도를 그대로 두고 타일 그리드만 1x1로 낮춘다 -> reset() 직후에도
// 1x1 타일이 화면 전체를 한 프레임에 채우므로 "검은 화면 -> 타일 채움"
// 현상이 발생하지 않는다 (TAA처럼 끊김 없이 전환).
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

        currentScale: -1,
        lastInteraction: performance.now(), // 시작 시점도 "인터랙션 중"으로 취급(1x1 타일로 즉시 표시)

        // 적응형 타일링: 컴파일 직후 첫 프레임은 1타일로 즉시 출력
        idleGrid: 1,
        appliedGrid: -1,
        prevSampleInt: -1,
        avgDt: -1,
        lastFrame: performance.now(),
        wasCompiling: false,
    };

    setGrid(core, core.idleGrid);
    return core;
}

function setGrid(core, n) {
    if (n === core.appliedGrid) return;
    core.appliedGrid = n;
    core.ptRenderer.tiles.set(n, n);
}

// 렌더 타깃 해상도 변경 (resolutionScale 변경 또는 윈도우 리사이즈 시에만 호출)
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

// 카메라/오브젝트 이동 등 "씬이 바뀜" 시그널.
// 해상도는 건드리지 않고 누적만 리셋 + 1x1 타일로 전환 -> 같은 프레임에
// 풀해상도 1샘플이 화면 전체를 채워 끊김/블랙플래시 없이 전환된다.
export function onInteract(core) {
    core.lastInteraction = performance.now();
    resetPathTracer(core);
    setGrid(core, 1);
}

function adaptTiles(core, targetFPS) {
    const targetMs = 1000 / targetFPS;
    if (core.avgDt > targetMs * 1.25 && core.idleGrid < 16) core.idleGrid++;
    else if (core.avgDt < targetMs * 0.7 && core.idleGrid > 1) core.idleGrid--;
}

// 메인 루프 1프레임 실행. onInfo(text)로 상태 문자열을 전달.
// rebuildIfDirty()는 지오메트리 변경 시에만 BVH를 재빌드하는 콜백 (boolean 반환)
export function stepFrame(core, renderer, camera, params, { rebuildIfDirty, onInfo }) {
    const now = performance.now();
    const dt = now - core.lastFrame;
    core.lastFrame = now;
    core.avgDt = core.avgDt < 0 ? dt : core.avgDt * 0.9 + dt * 0.1;

    // 해상도는 인터랙션과 무관하게 params.resolutionScale로 고정
    applyScale(core, renderer, params.resolutionScale);

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
        onInteract(core); // 컴파일 완료 직후 1x1 타일로 즉시 첫 프레임 표시
    }

    const interacting = (now - core.lastInteraction) < 250;
    const sampleInt = Math.floor(core.ptRenderer.samples);
    const converged = (!interacting && core.ptRenderer.samples >= params.maxSamples);

    if (interacting) {
        setGrid(core, 1); // 풀해상도 1샘플/프레임: 가볍고, reset 직후에도 화면 전체가 즉시 채워짐
    } else if (sampleInt !== core.prevSampleInt) {
        adaptTiles(core, params.targetFPS); // 정지 후엔 fps에 맞춰 타일을 늘려 더 많은 샘플 누적
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
    const tag = converged ? ' · done' : (interacting ? ' · live' : ` · ${core.idleGrid}×${core.idleGrid} tiles`);

    // innerText 쓰기는 리플로우를 유발하므로 4Hz로만 갱신
    if (now - (core.lastInfoUpdate || 0) > 250) {
        core.lastInfoUpdate = now;
        onInfo(`Samples: ${sampleInt} · ${fps}fps${tag}`);
    }
}

export function onWindowResize(core, renderer, camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    core.currentScale = -1; // 다음 stepFrame에서 applyScale이 새 크기로 재적용됨
    onInteract(core);
}
