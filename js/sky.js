// sky.js
// ------------------------------------------------------------
// 시간대(태양 고도)에 따라 자동으로 색이 바뀌는 절차적 하늘.
// - 패스트레이서용: equirect Float DataTexture. 태양(밤엔 달) 원반이 포함되어
//   envMapInfo의 중요도 샘플링으로 그림자를 만든다.
//   원반 밝기는 "원반이 차지하는 텍셀의 실제 입체각 합"으로 정규화해서
//   sunSize(그림자 부드러움)를 바꿔도 태양 조도가 일정하게 유지된다.
// - 래스터 미리보기용: 같은 하늘의 LDR 캔버스 텍스처 + 조명 파라미터.
// ------------------------------------------------------------
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 태양 고도(도) → 하늘/태양 팔레트 (선형 색공간)
export function skyPalette(params) {
    const el = THREE.MathUtils.degToRad(params.sunElevation);
    const az = THREE.MathUtils.degToRad(params.sunAzimuth);
    const day = smooth(0.0, 0.55, el);
    const up = smooth(-0.14, 0.04, el);
    const zenith = mix3([0.003, 0.005, 0.014], mix3([0.10, 0.17, 0.38], [0.12, 0.27, 0.62], day), up);
    const horizon = mix3([0.008, 0.012, 0.024], mix3([1.0, 0.52, 0.26], [0.62, 0.74, 0.90], day), up);
    const ground = mix3([0.004, 0.004, 0.005], [0.12, 0.11, 0.10], up);
    let tint = mix3([1.0, 0.40, 0.14], [1.0, 0.94, 0.86], smooth(0.0, 0.5, el));
    let dir, E;
    if (el > -0.03) {
        dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
        E = params.sunIntensity * smooth(-0.03, 0.05, el) * (0.45 + 0.55 * smooth(0.0, 0.4, el));
    } else {
        // 달빛 (태양 반대편 높은 곳)
        const mel = 0.75, maz = az + Math.PI;
        dir = new THREE.Vector3(Math.cos(mel) * Math.sin(maz), Math.sin(mel), Math.cos(mel) * Math.cos(maz));
        tint = [0.55, 0.65, 1.0];
        E = 0.08 * smooth(-0.03, -0.2, el);
    }
    const night = 1 - smooth(-0.12, 0.06, el);
    return { zenith, horizon, ground, tint, dir: dir.normalize(), E, night };
}

function skyRadiance(pal, dx, dy, dz, out) {
    let r, g, b;
    if (dy >= 0) {
        const t = Math.sqrt(dy);
        r = pal.horizon[0] + (pal.zenith[0] - pal.horizon[0]) * t;
        g = pal.horizon[1] + (pal.zenith[1] - pal.horizon[1]) * t;
        b = pal.horizon[2] + (pal.zenith[2] - pal.horizon[2]) * t;
    } else {
        const t = Math.min(1, Math.pow(-dy, 0.4) * 1.4);
        r = pal.horizon[0] + (pal.ground[0] - pal.horizon[0]) * t;
        g = pal.horizon[1] + (pal.ground[1] - pal.horizon[1]) * t;
        b = pal.horizon[2] + (pal.ground[2] - pal.horizon[2]) * t;
    }
    // 태양 쪽 지평선 글로우
    const mu = Math.max(0, dx * pal.dir.x + dy * pal.dir.y + dz * pal.dir.z);
    const hz = 1 - Math.min(1, Math.abs(dy) * 2.2);
    const glow = pal.E * (Math.pow(mu, 5) * 0.07 * hz + Math.pow(mu, 64) * 0.12);
    out[0] = r + pal.tint[0] * glow; out[1] = g + pal.tint[1] * glow; out[2] = b + pal.tint[2] * glow;
    return out;
}

// three-gpu-pathtracer의 equirect 규약 (three.js와 동일): u = atan2(z,x)/2π + 0.5, v = 1 - acos(y)/π
export function makeSkyTexture(renderer, params, W = 256, H = 128) {
    const pal = skyPalette(params);
    const data = new Float32Array(W * H * 4);
    const cosSize = Math.cos(THREE.MathUtils.degToRad(Math.max(0.5, params.sunSize)));
    const sd = pal.dir;
    const tmp = [0, 0, 0];
    const sunPix = [];
    let sunSolid = 0;

    for (let y = 0; y < H; y++) {
        // DataTexture 0행 = v=0 = 아래쪽 (라이브러리: v = 1 - acos(dir.y)/π)
        const theta = (1 - (y + 0.5) / H) * Math.PI;
        const cy = Math.cos(theta), sy = Math.sin(theta);
        // 텍셀 입체각
        const dOmega = (2 * Math.PI / W) * (Math.PI / H) * sy;
        for (let x = 0; x < W; x++) {
            // u = atan2(z, x)/2π + 0.5
            const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
            const dx = sy * Math.cos(phi), dz = sy * Math.sin(phi);
            skyRadiance(pal, dx, cy, dz, tmp);
            const i = (y * W + x) * 4;
            data[i] = tmp[0] * params.envIntensity;
            data[i + 1] = tmp[1] * params.envIntensity;
            data[i + 2] = tmp[2] * params.envIntensity;
            data[i + 3] = 1;
            if (dx * sd.x + cy * sd.y + dz * sd.z > cosSize) { sunPix.push(i); sunSolid += dOmega; }
        }
    }
    // 원반이 텍셀보다 작으면 가장 가까운 텍셀 1개라도 사용
    if (sunPix.length === 0) {
        const theta = Math.acos(Math.max(-1, Math.min(1, sd.y)));
        const u = Math.atan2(sd.z, sd.x) / (2 * Math.PI) + 0.5, v = 1 - theta / Math.PI;
        const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H));
        sunPix.push((y * W + x) * 4);
        sunSolid = (2 * Math.PI / W) * (Math.PI / H) * Math.max(0.01, Math.sin(theta));
    }
    const L = pal.E / sunSolid;
    for (const i of sunPix) {
        data[i] += pal.tint[0] * L; data[i + 1] += pal.tint[1] * L; data[i + 2] += pal.tint[2] * L;
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
    return { texture: tex, palette: pal };
}

// 래스터 미리보기 배경 (LDR, ACES 톤매핑을 거치므로 대략적인 노출만 맞춤)
export function makeSkyBackground(params, palette, W = 512, H = 256) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const tmp = [0, 0, 0];
    const cosSun = Math.cos(THREE.MathUtils.degToRad(Math.max(0.5, params.sunSize)));
    const sd = palette.dir;
    for (let y = 0; y < H; y++) {
        // three.js equirect 배경: v=1이 위(+y). 캔버스는 위→아래
        const theta = ((y + 0.5) / H) * Math.PI;
        const cy = Math.cos(theta), sy = Math.sin(theta);
        for (let x = 0; x < W; x++) {
            // three.js equirect 규약: u = atan2(dz, dx)/(2π) + 0.5
            const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
            const dx = sy * Math.cos(phi), dz = sy * Math.sin(phi);
            skyRadiance(palette, dx, cy, dz, tmp);
            let r = tmp[0] * params.envIntensity, g = tmp[1] * params.envIntensity, b = tmp[2] * params.envIntensity;
            if (dx * sd.x + cy * sd.y + dz * sd.z > cosSun) { r += 20 * palette.tint[0]; g += 20 * palette.tint[1]; b += 20 * palette.tint[2]; }
            const e = params.exposure;
            const tm = (v) => { v *= e; v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); return Math.round(Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2) * 255); };
            const i = (y * W + x) * 4;
            img.data[i] = tm(r); img.data[i + 1] = tm(g); img.data[i + 2] = tm(b); img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
