// main.js
// ------------------------------------------------------------
// 엔트리포인트. 각 모듈을 초기화하고 연결만 한다 (로직은 각 모듈에 위치).
// ------------------------------------------------------------
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

import { state, allEntities, addEntity, clearEntities, makeId, markEnvironmentDirty } from './state.js?v=c93ac15a';
import { makeSkyTexture } from './sky.js?v=af550388';
import { buildPathTracerScene } from './scene-build.js?v=8e57a869';
import { createPathTracerCore, stepFrame, onInteract, resetAdaptive, resetSceneGenerator, onWindowResize } from './renderer-core.js?v=50a4a803';
import { setupGUI } from './gui.js?v=440eff51';
import { loadModelFile } from './loader.js?v=e811bb98';
import { SCENES, applyNightToMaterials, OCEAN_LIGHTHOUSE } from './scenes.js?v=24405aee';
import { createPlayer } from './player.js?v=af925a16';
import { createRaster } from './raster.js?v=5fa054cf';
import { PRESETS, detectQuality } from './quality.js?v=82cb5ead';
import { rtUniforms, updateRTScene, patchObject, updateShadowRange } from './rt.js?v=02423be4';
import { computeSky, PLANET_LABELS } from './astro.js?v=2b909c8d';
import { createNightSky, loadSkyAssets, applyAstro } from './nightsky.js?v=a5a49d5e';
import { createOceanMesh, oceanSnapshotGeometry } from './ocean.js?v=9f673752';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const params = state.params;
const infoEl = document.getElementById('samples-info');
const loadingEl = document.getElementById('loading');

// ---------- 렌더러 / 카메라 ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = params.exposure;
// [최적화] devicePixelRatio 1 고정: 레티나에서 픽셀 수 4배 → 비용 4배를 피함
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(params.fov, window.innerWidth / window.innerHeight, 0.05, 12000);

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
core.rtScale = preset().rtStart;
renderer.setPixelRatio(params.renderMode === 'raytrace' ? core.rtScale : 1);
core.rasterRender = (r, cam) => raster.render(r, cam, params.depthPrepass);
const ptMat = core.ptRenderer.material;
const nightSky = createNightSky(renderer);
function applyRenderSettings() {
    const q = preset();
    ptMat.bounces = params.bounces;
    ptMat.transmissiveBounces = q.transmissiveBounces;
    ptMat.filterGlossyFactor = params.filterGlossy;
    renderer.toneMappingExposure = params.exposure;
    rtUniforms.rtFlags.value.x = params.rtShadows ? 1 : 0;
    rtUniforms.rtFlags.value.y = params.rtReflections ? 1 : 0;
}

const player = createPlayer(camera, renderer.domElement, {
    onSceneKey: (n) => {
        const name = ['ocean', 'city', 'wheat', 'showcase'][n - 1];
        if (name) { params.scene = name; gui.controllers[0].updateDisplay(); loadScene(name); }
    },
});

// ---------- 바다 장면 전용 (래스터/레이트레이싱 전용 오브젝트) ----------
const ocean = createOceanMesh();
const lighthouseLight = new THREE.PointLight(0xffeccc, 0, 0, 2);
lighthouseLight.position.fromArray(OCEAN_LIGHTHOUSE);
// 등대 회전 빛줄기 (대기 산란 표현, 가산 혼합)
const beamMat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
        uniform float uStrength; varying vec3 vP;
        void main(){
            float t = clamp(vP.x / 900.0, 0.0, 1.0);
            float r = length(vP.yz) / (2.0 + t * 60.0);
            float a = (1.0 - smoothstep(0.0, 1.0, r)) * pow(1.0 - t, 2.0) * 0.06 * uStrength;
            gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const beamGeo = new THREE.CylinderGeometry(60, 2, 900, 16, 1, true).rotateZ(-Math.PI / 2).translate(450, 0, 0);
const beam = new THREE.Group();
beam.position.fromArray(OCEAN_LIGHTHOUSE);
for (const r of [0, Math.PI]) { const m = new THREE.Mesh(beamGeo, beamMat); m.rotation.y = r; m.frustumCulled = false; beam.add(m); }
const oceanExtras = new THREE.Group();
oceanExtras.add(ocean, lighthouseLight, beam);

// ---------- 시뮬레이션 시각 ----------
let simBase = 0;        // 기준 시각 (UTC ms)
let simOffset = 0;      // 시간 흐름으로 더해진 ms
let lastSkyKey = null;
function parseSkyDate() {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(params.skyDate.trim());
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - params.tzOffset * 3600000;
}
function simDate() { return new Date(simBase + simOffset); }
function fmtLocal(d) {
    const t = new Date(d.getTime() + params.tzOffset * 3600000);
    const z = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())} ${z(t.getUTCHours())}:${z(t.getUTCMinutes())}`;
}

// ---------- 환경 (하늘) ----------
let envTex = null;
let lastBuild = null;   // { materials, textures }
let current = null;     // 현재 장면 생성 결과 (night, glints ...)
let skyAssetsReady = false;

function refreshEnvironment() {
    if (current && current.night) refreshNight(true);
    else refreshDay();
    state.dirty.environment = false;
    onInteract(core);
}

function refreshDay() {
    if (envTex) envTex.dispose();
    const sky = makeSkyTexture(renderer, params, 512, 256);
    envTex = sky.texture;
    ptMat.envMapInfo.updateFrom(envTex);
    ptMat.environmentIntensity = 1.0;
    raster.setEnvironment(params, sky.palette);
    if (lastBuild && applyNightToMaterials(lastBuild.materials, sky.palette.night)) {
        ptMat.materials.updateFrom(lastBuild.materials, lastBuild.textures);
        updateRTScene(lastBuild);
    }
}

// full=true: 환경맵(PT CDF + PMREM)까지 다시 생성. false: 셰이더 uniform만 (시간 흐름 중)
let lastFullEnv = 0;
function refreshNight(full) {
    if (!skyAssetsReady) return;
    const sky = computeSky(simDate(), params.latitude, params.longitude);
    const res = applyAstro(sky, params);
    rtUniforms.rtLightDir.value.copy(res.key.dir);
    rtUniforms.rtLightColor.value.copy(res.key.color);
    rtUniforms.rtAmbient.value.copy(res.ambient);
    updateShadowRange();
    if (full) {
        lastFullEnv = performance.now();
        // 패스트레이서 환경맵(CPU 다운로드 + 중요도 샘플링 표)은 패스트레이싱 모드일 때만 생성
        const needPT = params.renderMode === 'pathtrace';
        const W = needPT ? (preset().low ? 1024 : 2048) : 512;
        const env = nightSky.renderEquirect(W, W / 2, res.key, needPT);
        if (needPT) {
            if (envTex) envTex.dispose();
            envTex = env.dataTexture;
            ptMat.envMapInfo.updateFrom(envTex);
            ptMat.environmentIntensity = 1.0;
        }
        raster.setNightEnvironment(nightSky.dome, env.pmrem, res.key, res.ambient);
        if (lastBuild && applyNightToMaterials(lastBuild.materials, res.palette.night)) {
            ptMat.materials.updateFrom(lastBuild.materials, lastBuild.textures);
            updateRTScene(lastBuild);
        }
    }
    // 천체 정보 표시
    const up = sky.planets.filter((p) => p.alt > 0).map((p) => `${PLANET_LABELS[p.name]} ${p.alt.toFixed(0)}°`);
    const moon = sky.moon.alt > 0 ? `달 ${sky.moon.alt.toFixed(0)}° (${Math.round(sky.moon.illum * 100)}%)` : `달 지평선 아래 (${Math.round(sky.moon.illum * 100)}%)`;
    gui.setSkyInfo(`${fmtLocal(simDate())} · ${moon}${up.length ? ' · ' + up.join(', ') : ''}`);
    lastSkyKey = sky;
}

function onSkyChange() {
    const t = parseSkyDate();
    if (t === null) { gui.setSkyInfo('날짜 형식: YYYY-MM-DD HH:mm'); return; }
    simBase = t; simOffset = 0;
    refreshEnvironment();
}

// ---------- 장면 ----------
function rebuildScene() {
    state.dirty.geometry = false;
    let res;
    try {
        res = buildPathTracerScene({
            entities: allEntities(), camera, renderer,
            ptRenderer: core.ptRenderer, ptSceneGenerator: core.ptSceneGenerator,
            textureSize: preset().textureSize, mode: params.renderMode,
        });
    } catch (err) {
        console.error('장면 빌드 실패:', err);
        infoEl.innerText = `Error: ${err.message}`;
        return false;
    }
    raster.setContent(res.group);
    if (!res.ok) { infoEl.innerText = 'Error: No BVH generated'; return false; }
    const tA = performance.now();
    patchObject(res.group);
    lastBuild = { materials: res.materials, textures: res.textures, geometry: res.geometry, bvh: res.bvh };
    updateRTScene(lastBuild);
    const tB = performance.now();
    refreshEnvironment();
    if (window.__prof) console.log(`  RT 데이터 ${(tB - tA).toFixed(0)} ms, 환경 ${(performance.now() - tB).toFixed(0)} ms`);
    return true;
}

// 패스트레이싱용 바다 스냅샷을 지금 파도 시각/위치로 갱신
let oceanTime = 0;
function refreshOceanSnapshot() {
    const e = allEntities().find((x) => x.ptOnly);
    if (!e) return;
    e.mesh.geometry.dispose();
    e.mesh.geometry = oceanSnapshotGeometry(oceanTime, camera.position.x, camera.position.z, preset().low);
}

function updateExtrasVisibility() {
    const rtMode = params.renderMode === 'raytrace';
    ocean.visible = rtMode;
    beam.visible = rtMode;
}

let loadToken = 0;
function loadScene(name, keepPlayer = false) {
    const token = ++loadToken;
    loadingEl.style.display = 'flex';
    setTimeout(async () => {
        if (token !== loadToken) return;
        const t0 = performance.now();
        const built = SCENES[name](preset());
        const tBuild = performance.now();
        if (built.night) {
            loadingEl.textContent = 'NASA 별 지도 불러오는 중…';
            try { await loadSkyAssets(!preset().low); skyAssetsReady = true; } catch (e) { console.error('별 지도 로드 실패', e); }
            loadingEl.textContent = '장면 생성 중…';
            if (token !== loadToken) return;
        }
        current = built;
        clearEntities();
        resetSceneGenerator(core);
        for (const e of built.entities) addEntity(e);
        player.colliders = built.colliders;
        if (!keepPlayer) {
            player.spawn(built.spawn);
            Object.assign(params, built.env);
            gui.controllersRecursive().forEach((c) => c.updateDisplay());
        }
        raster.setExtras(built.night ? oceanExtras : null);
        if (built.night) {
            for (const g of built.glints) g.basePower = g.power;
            ocean.userData.setGlints(built.glints);
            const t = parseSkyDate();
            if (t !== null && !keepPlayer) { simBase = t; simOffset = 0; }
        }
        updateExtrasVisibility();
        applyRenderSettings();
        if (built.night && params.renderMode === 'pathtrace') refreshOceanSnapshot();
        const tPre = performance.now();
        rebuildScene();
        const tBVH = performance.now();
        resetAdaptive(core);
        let tris = 0;
        for (const e of built.entities) if (e.mesh) tris += e.mesh.geometry.attributes.position.count / 3;
        console.log(`장면 '${name}': ${built.entities.length} 메시, ${Math.round(tris)} 삼각형, ${(performance.now() - t0).toFixed(0)} ms ` +
            `(생성 ${(tBuild - t0).toFixed(0)} · BVH/업로드 ${(tBVH - tPre).toFixed(0)})`);
        loadingEl.style.display = 'none';
    }, 30);
}

function onRenderMode() {
    // 바다 장면: 패스트레이싱은 지금 순간의 파도를 정지 스냅샷으로 BVH에 넣음
    if (params.renderMode === 'pathtrace' && current && current.night) refreshOceanSnapshot();
    updateExtrasVisibility();
    state.dirty.geometry = true;
}

// ---------- 오브젝트 추가 ----------
function addPrimitive(type) {
    const c = player.ahead(5);
    const r = type === 'sphere' ? 0.9 : 0.7;
    const y0 = player.pos.y - 1.7;
    addEntity({
        id: makeId(type), type,
        transform: { position: [c.x, y0 + r, c.z], rotation: [0, 0, 0], scale: type === 'sphere' ? [r, r, r] : [1.4, 1.4, 1.4] },
        material: { color: Math.random() * 0xffffff, roughness: Math.random() * 0.6, metalness: Math.random() > 0.5 ? 1.0 : 0.0 },
        pinned: false,
    });
    player.colliders.push({ min: [c.x - r, y0, c.z - r], max: [c.x + r, y0 + 2 * r, c.z + r] });
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
    onRenderMode,
    onQuality: () => { applyPresetParams(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); loadScene(params.scene, true); },
    onRTFlags: () => { applyRenderSettings(); },
    onSkyChange,
    onEnvChange: () => { markEnvironmentDirty(); refreshEnvironment(); },
    onInteract: () => onInteract(core),
    onBouncesChange: () => { ptMat.bounces = params.bounces; onInteract(core); },
    onFilterChange: () => { ptMat.filterGlossyFactor = params.filterGlossy; onInteract(core); },
    onExposureChange: () => { renderer.toneMappingExposure = params.exposure; if (!(current && current.night)) refreshEnvironment(); else onInteract(core); },
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

    // 파도/등대가 움직이는 장면은 매 프레임 렌더, 나머지는 변화가 있을 때만
    params.animating = !!(current && current.night);
    if (current && current.night) {
        const rtMode = params.renderMode === 'raytrace';
        // 파도/시간은 레이트레이싱 모드에서만 흐름 (패스트레이싱은 정지 장면을 누적)
        if (rtMode) {
            oceanTime += dt;
            if (params.timeSpeed > 0) {
                simOffset += dt * 1000 * params.timeSpeed;
                refreshNight(now - lastFullEnv > 3000);
            }
        }
        ocean.userData.update(camera, oceanTime);
        nightSky.dome.position.copy(camera.position);
        nightSky.setPixelSigma(camera, renderer.domElement.height);
        // 등대: 6초 주기로 회전, 빛줄기가 정면을 지날 때 번쩍임
        const ang = (oceanTime / 6) * Math.PI * 2;
        beam.rotation.y = ang;
        const toCam = Math.atan2(-(camera.position.z - OCEAN_LIGHTHOUSE[2]), camera.position.x - OCEAN_LIGHTHOUSE[0]);
        const flash = Math.max(Math.pow(Math.max(Math.cos(ang - toCam), 0), 40), Math.pow(Math.max(Math.cos(ang + Math.PI - toCam), 0), 40));
        const nightK = 1 - THREE.MathUtils.smoothstep(lastSkyKey ? lastSkyKey.sun.alt : -30, -8, 2);
        lighthouseLight.intensity = rtMode ? 300 * nightK : 0;
        beamMat.uniforms.uStrength.value = nightK;
        current.glints[0].power = 900 * (0.25 + 4 * flash) * nightK;
        for (let i = 1; i < current.glints.length; i++) current.glints[i].power = current.glints[i].basePower * nightK;
        ocean.userData.setGlints(current.glints);
    }

    stepFrame(core, renderer, camera, params, preset(), {
        moved,
        rebuildIfDirty: () => (state.dirty.geometry ? rebuildScene() : false),
        onInfo: ({ samples, fps, tag }) => {
            const s = params.renderMode === 'raytrace' ? '' : `Samples: ${samples} · `;
            infoEl.innerText = `${s}${fps}fps · ${tag}${player.fly ? ' · 비행' : ''}`;
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
window.__app = { params, player, core, renderer, camera, rtUniforms, loadScene, onRenderMode, onSkyChange, get fps() { return core.fps; } };
