// raster.js
// ------------------------------------------------------------
// 래스터 미리보기 씬 (이동 중 / 셰이더 컴파일 중 / 패스트레이싱 첫 샘플 전 바탕).
// 패스트레이서와 같은 Mesh/머티리얼 객체를 공유하므로 추가 메모리가 거의 없다.
// 태양 = DirectionalLight + 그림자맵(플레이어를 따라다님), 하늘 = HemisphereLight.
// sky.js의 조도(E)와 three.js 물리 조명 단위가 같도록 세기를 맞춘다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { makeSkyBackground } from './sky.js?v=af550388';

export function createRaster(renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    const S = 70;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 600 });
    scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x443322, 1);
    scene.add(hemi);

    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;
    let content = null;
    let bg = null;
    const sunDir = new THREE.Vector3(0, 1, 0);

    return {
        scene,
        setContent(group) {
            if (content) scene.remove(content);
            content = group;
            if (group) scene.add(group);
        },
        setShadowSize(n) {
            if (sun.shadow.mapSize.x === n) return;
            sun.shadow.mapSize.set(n, n);
            if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        },
        setEnvironment(params, palette) {
            sunDir.copy(palette.dir);
            sun.color.setRGB(...palette.tint);
            sun.intensity = palette.E;
            const avg = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
            hemi.color.setRGB(...avg(palette.horizon, palette.zenith, 0.5));
            hemi.groundColor.setRGB(...palette.ground.map((v) => v * 1.5));
            hemi.intensity = Math.PI * params.envIntensity * 0.35;
            if (bg) bg.dispose();
            bg = makeSkyBackground(params, palette);
            scene.background = bg;
            // 금속/유리 반사용 환경맵 (PMREM, 환경 변경 시 1회)
            if (envRT) envRT.dispose();
            envRT = pmrem.fromEquirectangular(bg);
            scene.environment = envRT.texture;
        },
        // 그림자 카메라를 플레이어 주변으로 이동 (텍셀 단위 스냅으로 그림자 떨림 방지)
        follow(camera) {
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const c = camera.position.clone().addScaledVector(fwd.setY(0).normalize(), S * 0.5);
            const texel = (2 * S) / sun.shadow.mapSize.x;
            c.x = Math.round(c.x / texel) * texel; c.z = Math.round(c.z / texel) * texel; c.y = 0;
            sun.target.position.copy(c);
            sun.position.copy(c).addScaledVector(sunDir, 300);
            sun.target.updateMatrixWorld();
        },
    };
}
