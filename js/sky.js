// sky.js
// ------------------------------------------------------------
// 절차적 하늘 + 태양 디스크를 equirect Float DataTexture로 생성한다.
// 태양 디스크는 envMapInfo의 importance sampling CDF에 포함되어
// 소프트 섀도의 광원 역할을 한다 (sunSize = 디스크 각크기 = 그림자 부드러움).
// ------------------------------------------------------------
import * as THREE from 'three';

export function makeSkyTexture(renderer, params, W = 128, H = 64) {
    const data = new Float32Array(W * H * 4);

    const az = THREE.MathUtils.degToRad(params.sunAzimuth);
    const el = THREE.MathUtils.degToRad(params.sunElevation);
    const sun = new THREE.Vector3(
        Math.cos(el) * Math.sin(az),
        Math.sin(el),
        Math.cos(el) * Math.cos(az)
    ).normalize();

    const zen = new THREE.Color(params.skyZenith);
    const hor = new THREE.Color(params.skyHorizon);
    const grd = new THREE.Color(params.groundColor);
    const sunCol = new THREE.Color(params.sunColor);
    const cosSize = Math.cos(THREE.MathUtils.degToRad(params.sunSize));

    for (let y = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        const theta = v * Math.PI;
        const cy = Math.cos(theta);
        const sy = Math.sin(theta);
        for (let x = 0; x < W; x++) {
            const phi = ((x + 0.5) / W) * 2 * Math.PI;
            const dx = sy * Math.sin(phi);
            const dz = sy * Math.cos(phi);

            let r, g, b;
            if (cy >= 0) {
                const t = Math.pow(cy, 0.5);
                r = hor.r * (1 - t) + zen.r * t;
                g = hor.g * (1 - t) + zen.g * t;
                b = hor.b * (1 - t) + zen.b * t;
            } else {
                r = grd.r; g = grd.g; b = grd.b;
            }

            const d = dx * sun.x + cy * sun.y + dz * sun.z;
            if (d > cosSize) {
                r += sunCol.r * params.sunIntensity;
                g += sunCol.g * params.sunIntensity;
                b += sunCol.b * params.sunIntensity;
            }

            const i = (y * W + x) * 4;
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 1;
        }
    }

    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    renderer.initTexture(tex);
    return tex;
}
