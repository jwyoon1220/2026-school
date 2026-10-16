// renderer-core.js
// ------------------------------------------------------------
// 하이브리드 렌더 루프 (저사양 크롬북에서도 이동 중 30fps 유지가 목표).
//
// [이동 중]
//  - 'pathtrace' 미리보기: 낮은 해상도(previewScale) + 적은 바운스로 1샘플/프레임.
//    프레임 시간을 측정해 previewScale을 자동 조절한다 (목표 FPS 유지).
//    엣지 보존 블러로 1샘플 노이즈를 줄여 표시.
//  - 'raster' 미리보기: 같은 메시/머티리얼을 WebGL 래스터라이저 + 그림자맵으로 그림.
//    패스트레이싱이 최저 해상도에서도 목표 FPS를 못 내면 'auto' 모드가 여기로 전환.
// [정지 시]
//  - 목표 해상도(resolutionScale)로 누적 패스트레이싱. 타일(NxN)로 쪼개
//    프레임당 GPU 작업량을 목표 FPS에 맞춘다 → 수렴 중에도 입력이 끊기지 않음.
//  - 아직 덮이지 않은 타일/첫 샘플 전에는 래스터 이미지가 아래에 비치고,
//    패스트레이싱 결과가 그 위로 페이드 인 된다 (검은 화면 없음).
// ------------------------------------------------------------
import * as THREE from 'three';
import { PathTracingRenderer, PhysicalPathTracingMaterial, PathTracingSceneGenerator } from 'three-gpu-pathtracer';

// 패스트레이서 결과(Float 렌더타깃) 표시용: 수동 바이리니어 + 엣지 보존 블러 + 톤매핑
// (Float 텍스처 선형 필터링을 지원하지 않는 GPU가 있어 texelFetch로 직접 보간)
const displayShader = {
    uniforms: {
        map: { value: null },
        srcSize: { value: new THREE.Vector2(1, 1) },
        blur: { value: 0 },
        opacity: { value: 1 },
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */`
        uniform sampler2D map;
        uniform vec2 srcSize;
        uniform float blur;
        uniform float opacity;
        varying vec2 vUv;
        vec4 fetch(ivec2 p) {
            p = clamp(p, ivec2(0), ivec2(srcSize) - 1);
            return texelFetch(map, p, 0);
        }
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main() {
            vec2 s = vUv * srcSize - 0.5;
            ivec2 b = ivec2(floor(s));
            vec2 f = s - vec2(b);
            vec4 c = mix(mix(fetch(b), fetch(b + ivec2(1, 0)), f.x),
                         mix(fetch(b + ivec2(0, 1)), fetch(b + ivec2(1, 1)), f.x), f.y);
            if (blur > 0.0) {
                // 3x3 바이래터럴: 밝기 차가 큰 이웃은 덜 섞어 윤곽 보존
                ivec2 ci = ivec2(floor(s + 0.5));
                float lc = luma(c.rgb);
                vec3 acc = c.rgb * 2.0; float w = 2.0;
                for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
                    if (i == 0 && j == 0) continue;
                    vec4 n = fetch(ci + ivec2(i, j));
                    float wl = exp(-abs(luma(n.rgb) - lc) / (0.25 + lc * 0.6)) * (i == 0 || j == 0 ? 1.0 : 0.6);
                    acc += n.rgb * wl; w += wl;
                }
                c.rgb = mix(c.rgb, acc / w, blur);
            }
            gl_FragColor = vec4(max(c.rgb, vec3(0.0)), clamp(c.a, 0.0, 1.0) * opacity);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
};

export function createPathTracerCore(renderer, camera, rasterScene) {
    const ptRenderer = new PathTracingRenderer(renderer);
    ptRenderer.camera = camera;
    ptRenderer.material = new PhysicalPathTracingMaterial();
    ptRenderer.tiles.set(1, 1);
    // DOF 미사용 → 셰이더 분기 제거
    ptRenderer.material.physicalCamera.bokehSize = 0;

    const ptSceneGenerator = new PathTracingSceneGenerator();
    ptSceneGenerator.generateBVH = true;

    const displayMat = new THREE.ShaderMaterial({
        ...displayShader,
        uniforms: THREE.UniformsUtils.clone(displayShader.uniforms),
        transparent: true, depthTest: false, depthWrite: false,
    });
    const displayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMat);
    displayMesh.frustumCulled = false;
    const displayScene = new THREE.Scene();
    displayScene.add(displayMesh);
    const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
        ptRenderer, ptSceneGenerator, displayScene, displayCamera, displayMat, rasterScene,
        currentScale: -1,
        previewScale: 0.25,
        autoRaster: false,      // auto 모드에서 패스트레이싱 미리보기가 너무 느리면 true
        slowTime: 0,
        lastMove: -1e9,
        wasMoving: true,
        avgDt: 16, lastFrame: performance.now(),
        fps: 0, fpsFrames: 0, fpsT: performance.now(),
        idleGrid: 1, appliedGrid: 1,
        updatesPerFrame: 1,
        prevSampleInt: -1,
        lastAdapt: 0,
        mode: 'init',
        compiling: false,
    };
}

function setGrid(core, n) {
    if (n === core.appliedGrid) return;
    core.appliedGrid = n;
    core.ptRenderer.tiles.set(n, n);
}

function applyScale(core, renderer, s) {
    if (Math.abs(s - core.currentScale) < 1e-4) return false;
    core.currentScale = s;
    const w = renderer.domElement.width, h = renderer.domElement.height;
    core.ptRenderer.setSize(Math.max(1, Math.ceil(w * s)), Math.max(1, Math.ceil(h * s)));
    core.ptRenderer.reset();
    return true;
}

export function resetPathTracer(core) {
    core.ptRenderer.reset();
}

// 씬/조명이 바뀜 → 누적 리셋 (카메라 이동은 stepFrame이 직접 처리)
export function onInteract(core) {
    core.ptRenderer.reset();
    setGrid(core, 1);
    core.updatesPerFrame = 1;
}

// 장면 교체 시: 지오메트리 생성기를 새로 만든다.
// (0.0.21의 생성기는 이전 병합 버퍼를 재사용하다가 크기가 다른 장면이 오면
//  copyAttributeContents에서 RangeError를 낸다)
export function resetSceneGenerator(core) {
    const old = core.ptSceneGenerator;
    if (old && old.geometry) old.geometry.dispose();
    core.ptSceneGenerator = new PathTracingSceneGenerator();
    core.ptSceneGenerator.generateBVH = true;
}

// 장면 교체 시: 자동 판단을 다시 시작
export function resetAdaptive(core) {
    core.autoRaster = false;
    core.slowTime = 0;
    onInteract(core);
}

function drawRaster(core, renderer, camera) {
    renderer.setRenderTarget(null);
    renderer.render(core.rasterScene, camera);
}

function drawPT(core, renderer, opacity, blur) {
    const t = core.ptRenderer.target;
    const u = core.displayMat.uniforms;
    u.map.value = t.texture;
    u.srcSize.value.set(t.width, t.height);
    u.opacity.value = opacity;
    u.blur.value = blur;
    renderer.setRenderTarget(null);
    renderer.render(core.displayScene, core.displayCamera);
}

// 메인 루프 1프레임. moved: 이번 프레임에 카메라가 움직였는지
export function stepFrame(core, renderer, camera, params, quality, { moved, rebuildIfDirty, onInfo }) {
    const now = performance.now();
    const dt = Math.min(250, now - core.lastFrame);
    core.lastFrame = now;
    core.avgDt = core.avgDt * 0.85 + dt * 0.15;
    core.fpsFrames++;
    if (now - core.fpsT > 500) { core.fps = Math.round(core.fpsFrames * 1000 / (now - core.fpsT)); core.fpsFrames = 0; core.fpsT = now; }

    if (rebuildIfDirty()) onInteract(core);
    if (moved) core.lastMove = now;
    const moving = now - core.lastMove < 140;
    const pt = core.ptRenderer;
    const mat = pt.material;
    const targetMs = 1000 / params.targetFPS;

    // 셰이더 컴파일 중(저사양에서 수 초 걸릴 수 있음)에는 래스터로 바로 보여줌
    if (mat.isCompiling) {
        core.compiling = true;
        drawRaster(core, renderer, camera);
        report(core, onInfo, now, '셰이더 컴파일 중… (래스터 미리보기)');
        return;
    }
    if (core.compiling) { core.compiling = false; core.wasMoving = true; core.lastAdapt = now; }

    const useRaster = params.previewMode === 'raster' || (params.previewMode === 'auto' && core.autoRaster);

    if (moving) {
        core.wasMoving = true;
        if (useRaster) {
            core.mode = 'raster';
            drawRaster(core, renderer, camera);
        } else {
            core.mode = 'pt-preview';
            // 프레임 시간으로 미리보기 해상도 조절
            if (now - core.lastAdapt > 250) {
                core.lastAdapt = now;
                if (core.avgDt > targetMs * 1.08) core.previewScale = Math.max(quality.previewMin, core.previewScale * 0.88);
                else if (core.avgDt < targetMs * 0.75) core.previewScale = Math.min(quality.previewMax, core.previewScale * 1.06);
            }
            // 최저 해상도로도 목표 FPS의 85%를 1초 넘게 못 내면 래스터 미리보기로 전환
            if (params.previewMode === 'auto' && core.previewScale <= quality.previewMin + 1e-3 && core.avgDt > targetMs / 0.85) {
                core.slowTime += dt;
                if (core.slowTime > 1000) core.autoRaster = true;
            } else core.slowTime = Math.max(0, core.slowTime - dt * 0.5);

            applyScale(core, renderer, core.previewScale);
            mat.bounces = params.movingBounces;
            setGrid(core, 1);
            pt.reset();
            pt.setCamera(camera);
            pt.update();
            drawPT(core, renderer, 1, params.denoise);
        }
        report(core, onInfo, now, core.mode === 'raster' ? '이동 중 · 래스터 미리보기' : `이동 중 · 패스트레이싱 ${Math.round(core.previewScale * 100)}%`);
        return;
    }

    // ---- 정지: 목표 해상도로 누적 ----
    if (core.wasMoving) {
        core.wasMoving = false;
        applyScale(core, renderer, params.resolutionScale);
        mat.bounces = params.bounces;
        pt.reset();
        pt.setCamera(camera);
        setGrid(core, 1);
        core.updatesPerFrame = 1;
        core.idleGrid = Math.max(1, core.idleGrid);
        core.prevSampleInt = -1;
    }
    if (applyScale(core, renderer, params.resolutionScale)) pt.setCamera(camera);

    const converged = pt.samples >= params.maxSamples;
    const sampleInt = Math.floor(pt.samples);
    if (!converged) {
        // 한 바퀴(모든 타일) 끝날 때마다 타일 수/프레임당 호출 수 조절
        if (sampleInt !== core.prevSampleInt) {
            core.prevSampleInt = sampleInt;
            if (sampleInt >= 1) {
                if (core.avgDt > targetMs * 1.2 && core.idleGrid < 12) core.idleGrid++;
                else if (core.avgDt < targetMs * 0.65 && core.idleGrid > 1) core.idleGrid--;
                if (core.idleGrid === 1) {
                    if (core.avgDt < targetMs * 0.55 && core.updatesPerFrame < 6) core.updatesPerFrame++;
                    else if (core.avgDt > targetMs * 1.05 && core.updatesPerFrame > 1) core.updatesPerFrame--;
                } else core.updatesPerFrame = 1;
            }
            // 첫 샘플은 아래에 래스터가 비치므로 처음부터 타일로 나눠도 화면이 비지 않음
            setGrid(core, sampleInt < 1 ? Math.max(core.idleGrid, quality.low ? 3 : 2) : core.idleGrid);
        }
        for (let i = 0; i < core.updatesPerFrame; i++) {
            pt.update();
            if (pt.samples >= params.maxSamples) break;
        }
    }

    // 표시: 패스트레이싱이 2샘플 쌓일 때까지 래스터 위로 페이드 인
    const fade = Math.min(1, pt.samples / 2);
    const needBase = fade < 1 || pt.samples < 1;
    if (needBase) drawRaster(core, renderer, camera);
    const prevAuto = renderer.autoClear;
    renderer.autoClear = !needBase;
    drawPT(core, renderer, needBase ? Math.max(fade, 0.0001) : 1, params.denoise * Math.min(1, 1.5 / Math.max(1, pt.samples)) * (pt.samples < 4 ? 1 : 0.5));
    renderer.autoClear = prevAuto;

    core.mode = converged ? 'done' : 'accum';
    report(core, onInfo, now, converged ? '완료' : `누적 중 · ${core.appliedGrid}×${core.appliedGrid} 타일 × ${core.updatesPerFrame}`);
}

function report(core, onInfo, now, tag) {
    if (now - (core.lastInfo || 0) < 250) return;
    core.lastInfo = now;
    onInfo({ samples: Math.floor(core.ptRenderer.samples), fps: core.fps, tag, mode: core.mode });
}

export function onWindowResize(core, renderer, camera) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    core.currentScale = -1;
    core.wasMoving = true;
    onInteract(core);
}
