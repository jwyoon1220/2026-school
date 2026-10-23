// raster.js
// ------------------------------------------------------------
// 래스터 씬 (레이트레이싱 모드의 1차 가시성 + 패스트레이싱 모드의 미리보기/바탕).
// 패스트레이서와 같은 Mesh/머티리얼 객체를 공유한다.
//
// 주광원(태양/달)은 three.js DirectionalLight가 아니라 rt.js 패치가 BVH 그림자
// 광선과 함께 직접 계산하므로, 여기서는 rtUniforms에 방향/조도만 넘긴다.
// HemisphereLight + 환경맵(PMREM)이 하늘 주변광/반사를 담당.
// ------------------------------------------------------------
import * as THREE from 'three';
import { makeSkyBackground } from './sky.js?v=af550388';
import { rtUniforms, updateShadowRange } from './rt.js?v=02423be4';

export function createRaster(renderer) {
    renderer.shadowMap.enabled = false;   // 그림자는 BVH 광선으로

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x443322, 1);
    scene.add(hemi);

    // 깊이 전용 머티리얼: 색 쓰기 없음 + 살짝 뒤로 밀어서(polygonOffset) 본 패스가 LessEqual로 통과
    const prepassScene = new THREE.Scene();
    prepassScene.overrideMaterial = new THREE.MeshBasicMaterial({
        colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    let content = null;
    let extras = null;
    let bg = null;
    let dome = null;

    const setKey = (dir, color, ambient) => {
        rtUniforms.rtLightDir.value.copy(dir).normalize();
        rtUniforms.rtLightColor.value.copy(color);
        rtUniforms.rtAmbient.value.copy(ambient);
        updateShadowRange();
    };

    return {
        scene,
        setContent(group) {
            if (content) scene.remove(content);
            content = group;
            if (group) scene.add(group);
        },
        // 래스터 전용 오브젝트 (애니메이션 바다, 등대 빛줄기, 점광원 등)
        setExtras(group) {
            if (extras) scene.remove(extras);
            extras = group;
            if (group) scene.add(group);
        },
        setShadowSize() { /* 그림자맵 미사용 (BVH 그림자) */ },
        // 낮 하늘 (sky.js)
        setEnvironment(params, palette) {
            if (dome) { scene.remove(dome); dome = null; }
            const avg = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
            hemi.color.setRGB(...avg(palette.horizon, palette.zenith, 0.5));
            hemi.groundColor.setRGB(...palette.ground.map((v) => v * 1.5));
            hemi.intensity = Math.PI * params.envIntensity * 0.35;
            if (bg) bg.dispose();
            bg = makeSkyBackground(params, palette);
            scene.background = bg;
            if (envRT) envRT.dispose();
            envRT = pmrem.fromEquirectangular(bg);
            scene.environment = envRT.texture;
            const amb = new THREE.Color().setRGB(...avg(palette.horizon, palette.zenith, 0.5)).multiplyScalar(Math.PI * params.envIntensity * 0.5);
            setKey(palette.dir, new THREE.Color(...palette.tint).multiplyScalar(palette.E), amb);
        },
        // 밤하늘 (nightsky.js): 돔 배경 + 밤하늘 PMREM
        setNightEnvironment(skyDome, pmremTex, key, ambient) {
            if (bg) { bg.dispose(); bg = null; }
            if (envRT) { envRT.dispose(); envRT = null; }
            scene.background = null;
            if (dome !== skyDome) { if (dome) scene.remove(dome); dome = skyDome; scene.add(dome); }
            scene.environment = pmremTex;
            hemi.color.copy(ambient).multiplyScalar(1 / Math.PI);
            hemi.groundColor.copy(ambient).multiplyScalar(0.3 / Math.PI);
            hemi.intensity = 1;
            setKey(key.dir, key.color, ambient);
        },
        follow() { /* 그림자 카메라 불필요 */ },
        // 깊이 프리패스: 싼 셰이더로 깊이만 먼저 그린 뒤 본 패스를 그리면,
        // 가려진 픽셀은 early-Z로 버려져 비싼 셰이딩(BVH 그림자/반사 광선)을 한 번만 수행.
        // 병합 메시가 화면 전체에 걸쳐 있어 앞→뒤 정렬이 불가능한 도시 장면에서 특히 효과가 큼.
        render(renderer, camera, prepass = true) {
            if (!prepass || !content) { renderer.render(scene, camera); return; }
            const prevAuto = renderer.autoClear;
            renderer.clear(true, true, true);
            prepassScene.add(content);
            renderer.render(prepassScene, camera);
            scene.add(content);
            renderer.autoClear = false;
            renderer.render(scene, camera);
            renderer.autoClear = prevAuto;
        },
    };
}
