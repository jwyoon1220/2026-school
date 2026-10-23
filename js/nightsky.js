// nightsky.js
// ------------------------------------------------------------
// 실제 밤하늘 (바다 장면).
//  - 별/은하수: NASA/Goddard SVS Deep Star Maps 2020 (ESA Hipparcos-2, Tycho-2, Gaia DR2)
//    assets/sky/starmap_*.webp  (ICRF/J2000, 중앙 = 적경 0h, 적경 왼쪽 증가, 위 = +90°)
//  - 달 표면: NASA SVS CGI Moon Kit (LRO LROC 컬러 모자이크) assets/sky/moon_lroc_1k.jpg
//  - 위치: astro.js (JPL 궤도요소 / 달 저정밀 공식, JPL Horizons와 0.1° 내외 일치 확인)
//
// 같은 GLSL 하늘 함수를 세 곳에서 사용한다.
//  1) 하늘 돔 (래스터/레이트레이싱 모드의 배경)
//  2) 바다 셰이더의 반사 광선이 아무것도 맞지 않았을 때
//  3) equirect 렌더 → PMREM(래스터 반사) + Float 다운로드(패스트레이서 환경맵)
//
// 밝기 단위: "사진 노출" 기준 상대값. 별 지도 원본(0~1 선형) × starIntensity.
// ------------------------------------------------------------
import * as THREE from 'three';
import { skyPalette } from './sky.js?v=af550388';

const BASE = new URL('../assets/sky/', import.meta.url).href;

export const nightUniforms = {
    starTex: { value: null },
    moonTex: { value: null },
    worldToJ2000: { value: new THREE.Matrix3() },
    starIntensity: { value: 1.6 },
    starVis: { value: 1.0 },                  // 박명/낮에 별이 사라지는 정도
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    moonRadius: { value: 0.0045 },
    moonRadiance: { value: 0 },
    moonUp: { value: 0 },
    sunDirW: { value: new THREE.Vector3(0, -1, 0) },
    planets: { value: Array.from({ length: 5 }, () => new THREE.Vector4(0, -1, 0, 0)) },
    pointSigma: { value: 0.0015 },            // 행성 점 크기 (라디안, 픽셀 크기에 맞춤)
    zenithCol: { value: new THREE.Color() },
    horizonCol: { value: new THREE.Color() },
    groundCol: { value: new THREE.Color() },
    sunTint: { value: new THREE.Color() },
    sunE: { value: 0 },
    sunCos: { value: Math.cos(0.02) },
    glowE: { value: 0 },
    lightPollution: { value: 1.0 },
    moonGlow: { value: 0 },
};

export const NIGHT_SKY_GLSL = /* glsl */`
uniform sampler2D starTex;
uniform sampler2D moonTex;
uniform mat3 worldToJ2000;
uniform float starIntensity;
uniform float starVis;
uniform vec3 moonDir;
uniform float moonRadius;
uniform float moonRadiance;
uniform float moonUp;
uniform vec3 sunDirW;
uniform vec4 planets[5];
uniform float pointSigma;
uniform vec3 zenithCol;
uniform vec3 horizonCol;
uniform vec3 groundCol;
uniform vec3 sunTint;
uniform float sunE;
uniform float sunCos;
uniform float glowE;
uniform float lightPollution;
uniform float moonGlow;

const float SKY_PI = 3.14159265359;

// 대기 소광 (공기질량, 지평선 근처는 붉고 어둡게)
vec3 skyExtinction(float h) {
    float hh = max(h, 0.0);
    float airmass = 1.0 / (hh + 0.025 * exp(-11.0 * hh));
    return exp(-vec3(0.05, 0.08, 0.15) * airmass);
}

// 수평선 박무용 저비용 하늘 (별 텍스처/행성/원반 생략 — 박무에 가려 보이지 않음)
vec3 skyHaze(vec3 d) {
    vec3 col = horizonCol;
    float mu = max(dot(d, sunDirW), 0.0);
    col += sunTint * glowE * (pow(mu, 5.0) * 0.07 + pow(mu, 64.0) * 0.12);
    float west = max(-d.x, 0.0);
    col += vec3(0.020, 0.011, 0.005) * lightPollution * west * west;
    float mm = max(dot(d, moonDir), 0.0);
    col += vec3(0.05, 0.075, 0.12) * moonGlow * moonUp * (0.25 + 0.6 * pow(mm, 6.0));
    col += vec3(0.0011, 0.0012, 0.0015) * starIntensity * starVis;   // 지평선 근처 별빛 평균 (소광 후)
    return col;
}

vec3 nightSky(vec3 d, bool withDisks) {
    float h = d.y;
    float above = smoothstep(-0.01, 0.004, h);
    vec3 ext = skyExtinction(h);
    vec3 col = vec3(0.0);

    // 하늘 기본색 (박명~낮 팔레트; 밤에는 아주 어두운 대기광 수준)
    if (h >= 0.0) col = mix(horizonCol, zenithCol, sqrt(h));
    else col = mix(horizonCol, groundCol, clamp(pow(-h, 0.4) * 1.4, 0.0, 1.0));
    float mu = max(dot(d, sunDirW), 0.0);
    float hz = 1.0 - clamp(abs(h) * 2.2, 0.0, 1.0);
    col += sunTint * glowE * (pow(mu, 5.0) * 0.07 * hz + pow(mu, 64.0) * 0.12);

    // 별 + 은하수 (J2000 적경/적위 → 텍스처 좌표)
    if (starVis > 0.001) {
        vec3 J = worldToJ2000 * d;
        float ra = atan(J.y, J.x);
        float dec = asin(clamp(J.z, -1.0, 1.0));
        vec2 uv = vec2(fract(0.5 - ra / (2.0 * SKY_PI)), 0.5 + dec / SKY_PI);
        col += texture2D(starTex, uv).rgb * starIntensity * starVis * ext * above;
    }

    // 해안 도시 불빛 (서쪽 육지 방향)
    float west = max(-d.x, 0.0);
    col += vec3(0.020, 0.011, 0.005) * lightPollution * west * west * exp(-max(h, 0.0) * 7.0) * above;

    // 달빛 산란 (달이 떠 있을 때 하늘이 밝아짐)
    float mm = max(dot(d, moonDir), 0.0);
    col += vec3(0.05, 0.075, 0.12) * moonGlow * moonUp * (0.25 + 0.6 * pow(mm, 6.0) + 2.0 * pow(mm, 200.0)) * above;

    // 행성 (가우시안 점, 총광량 보존)
    for (int i = 0; i < 5; i++) {
        vec4 pl = planets[i];
        if (pl.w <= 0.0 || pl.y < -0.02) continue;
        float c = dot(d, pl.xyz);
        if (c < 0.9999) continue;
        float a2 = 2.0 * (1.0 - c);
        float s2 = pointSigma * pointSigma;
        col += vec3(1.0, 0.95, 0.85) * pl.w * exp(-a2 / (2.0 * s2)) / (6.2831853 * s2) * skyExtinction(pl.y);
    }

    if (withDisks) {
        // 달 원반: NASA LROC 표면 + 태양 방향 위상 조명
        float c = dot(d, moonDir);
        float cr = cos(moonRadius);
        if (moonUp > 0.0 && c > cr) {
            vec3 m = moonDir;
            vec3 q = (d - m * c) / sin(moonRadius);
            float z = sqrt(max(0.0, 1.0 - dot(q, q)));
            vec3 n = normalize(q - m * z);                 // 지구를 향한 면의 법선
            vec3 up = normalize(vec3(0.0, 1.0, 0.0) - m * m.y);
            vec3 rt = cross(up, -m);
            float lon = atan(dot(n, rt), dot(n, -m));
            float lat = asin(clamp(dot(n, up), -1.0, 1.0));
            vec3 alb = texture2D(moonTex, vec2(0.5 + lon / (2.0 * SKY_PI), 0.5 + lat / SKY_PI)).rgb;
            float lit = max(dot(n, sunDirW), 0.0);
            float edge = smoothstep(1.0, 0.97, length(q));
            col = mix(col, alb * (moonRadiance * lit + moonRadiance * 0.002) * ext, edge * above);
        }
        // 태양 원반
        if (sunE > 0.0 && dot(d, sunDirW) > sunCos) col += sunTint * sunE;
    }
    return max(col, vec3(0.0));
}
`;

// ------------------------------------------------------------
// 에셋 로드
// ------------------------------------------------------------
let assetsPromise = null;
export function loadSkyAssets(high) {
    if (assetsPromise) return assetsPromise;
    const loader = new THREE.TextureLoader();
    const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
    assetsPromise = Promise.all([
        load(BASE + (high ? 'starmap_4096.webp' : 'starmap_2048.webp')),
        load(BASE + 'moon_lroc_1k.jpg'),
    ]).then(([stars, moon]) => {
        for (const t of [stars, moon]) {
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            t.generateMipmaps = false;       // 적경 0h 이음매에서 밉맵 줄무늬 방지
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
        }
        nightUniforms.starTex.value = stars;
        nightUniforms.moonTex.value = moon;
        return { stars, moon };
    });
    return assetsPromise;
}

// ------------------------------------------------------------
// 천문 계산 결과 → uniform + 주광원(키 라이트)
// ------------------------------------------------------------
const MOON_R_KM = 1737.4, EARTH_R_KM = 6378.14;
export function applyAstro(sky, params) {
    const u = nightUniforms;
    u.worldToJ2000.value.set(...sky.worldToJ2000);
    const toV = (w) => new THREE.Vector3(w[0], w[1], w[2]).normalize();
    const sunW = toV(sky.sun.world), moonW = toV(sky.moon.world);
    u.sunDirW.value.copy(sunW);
    u.moonDir.value.copy(moonW);
    const moonRad = Math.asin(MOON_R_KM / (sky.moon.distER * EARTH_R_KM));
    u.moonRadius.value = moonRad;
    u.starIntensity.value = params.starIntensity;
    u.lightPollution.value = params.lightPollution;

    // 낮/박명 팔레트 (sky.js와 같은 식) — sky.js의 방위 규약: x = sin(az'), z = cos(az')
    const azS = Math.atan2(sunW.x, sunW.z) * 180 / Math.PI;
    const pal = skyPalette({ ...params, sunElevation: sky.sun.alt, sunAzimuth: azS, sunIntensity: params.sunIntensity });
    u.zenithCol.value.setRGB(...pal.zenith.map((v) => v * params.envIntensity));
    u.horizonCol.value.setRGB(...pal.horizon.map((v) => v * params.envIntensity));
    u.groundCol.value.setRGB(...pal.ground.map((v) => v * params.envIntensity));
    u.sunTint.value.setRGB(...pal.tint);
    const sunUp = sky.sun.alt > -1;
    u.glowE.value = sunUp ? pal.E : 0;
    const sunCos = Math.cos(0.02);
    u.sunCos.value = sunCos;
    u.sunE.value = sunUp ? pal.E / (2 * Math.PI * (1 - sunCos)) : 0;
    // 별: 천문박명(-18°) ~ 시민박명(-6°) 사이에서 사라짐
    u.starVis.value = 1 - THREE.MathUtils.smoothstep(sky.sun.alt, -18, -4);

    // 달 밝기: 위상(조명률)^1.5 근사 × 대기 소광, 보름달 조도 = params.moonLight
    const ill = sky.moon.illum;
    const ext = Math.exp(-0.15 / Math.max(0.03, Math.sin(Math.max(0, sky.moon.alt) * Math.PI / 180)));
    const moonE = params.moonLight * Math.pow(ill, 1.5) * ext * (sky.moon.alt > -1 ? 1 : 0);
    const omega = 2 * Math.PI * (1 - Math.cos(moonRad));
    u.moonUp.value = sky.moon.alt > -1 ? 1 : 0;
    // 원반 평균 (반사율 ~0.35 × 밝은 면 비율) 로 나눠 원반 전체 광량 ≈ moonE
    u.moonRadiance.value = moonE / (omega * 0.35 * Math.max(ill, 0.02)) * 0.5;
    u.moonGlow.value = moonE;

    // 행성: 0등급 ≈ 별 지도의 밝은 별 수준 (광량 1.2e-5 기준)
    sky.planets.forEach((p, i) => {
        const v = toV(p.world);
        u.planets.value[i].set(v.x, v.y, v.z, 1.2e-5 * Math.pow(10, -0.4 * p.mag) * params.starIntensity * u.starVis.value);
    });

    // 주광원: 태양이 떠 있으면 태양, 아니면 달
    let key;
    if (sunUp) key = { dir: sunW, color: new THREE.Color(...pal.tint).multiplyScalar(pal.E), E: pal.E, body: 'sun', radius: 0.02 };
    else key = { dir: moonW, color: new THREE.Color(0.78, 0.84, 1.0).multiplyScalar(moonE), E: moonE, body: 'moon', radius: moonRad };
    // 주변광 (하늘 조도 근사)
    const amb = new THREE.Color().setRGB(...pal.zenith).lerp(new THREE.Color(...pal.horizon), 0.5).multiplyScalar(Math.PI * params.envIntensity * 0.5)
        .add(new THREE.Color(0.0025, 0.003, 0.005).multiplyScalar(Math.PI))
        .add(new THREE.Color(0.05, 0.075, 0.12).multiplyScalar(moonE * 0.6));
    return { key, ambient: amb, palette: pal };
}

// ------------------------------------------------------------
// 하늘 돔 + equirect 렌더러
// ------------------------------------------------------------
export function createNightSky(renderer) {
    const domeMat = new THREE.ShaderMaterial({
        uniforms: nightUniforms,
        vertexShader: /* glsl */`
            varying vec3 vDir;
            void main() {
                vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
                vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + vDir * 1000.0, 1.0);
                gl_Position = p.xyww; // 항상 가장 먼 깊이
            }`,
        fragmentShader: /* glsl */`
            ${NIGHT_SKY_GLSL}
            varying vec3 vDir;
            void main() {
                gl_FragColor = vec4(nightSky(normalize(vDir), true), 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`,
        side: THREE.BackSide, depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -1000;

    // equirect (three.js 규약: u = atan(z,x)/2π + 0.5, v = asin(y)/π + 0.5)
    const eqMat = new THREE.ShaderMaterial({
        uniforms: nightUniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */`
            ${NIGHT_SKY_GLSL}
            varying vec2 vUv;
            void main() {
                float phi = (vUv.x - 0.5) * 6.2831853;
                float lat = (vUv.y - 0.5) * 3.14159265;
                vec3 d = vec3(cos(lat) * cos(phi), sin(lat), cos(lat) * sin(phi));
                gl_FragColor = vec4(nightSky(d, false), 1.0);
            }`,
        depthTest: false, depthWrite: false, toneMapped: false,
    });
    const eqScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eqMat);
    quad.frustumCulled = false;
    eqScene.add(quad);
    const eqCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pmrem = new THREE.PMREMGenerator(renderer);

    let rt = null, envRT = null;

    return {
        dome,
        // 주광원 원반을 텍셀 입체각으로 정규화해 Float 데이터에 더함 (sky.js와 같은 방식)
        // needData=false면 Float 다운로드(GPU→CPU 동기화로 끊김 유발)를 생략하고 PMREM만 갱신
        renderEquirect(W, H, key, needData = true) {
            if (!rt || rt.width !== W) {
                if (rt) rt.dispose();
                rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
            }
            const prevT = renderer.getRenderTarget(), prevTM = renderer.toneMapping;
            nightUniforms.pointSigma.value = Math.PI / H * 1.2;
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.setRenderTarget(rt);
            renderer.render(eqScene, eqCam);
            renderer.setRenderTarget(prevT);
            renderer.toneMapping = prevTM;
            if (envRT) envRT.dispose();
            envRT = pmrem.fromEquirectangular(rt.texture);
            if (!needData) return { dataTexture: null, pmrem: envRT.texture };
            const data = new Float32Array(W * H * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, W, H, data);

            // 패스트레이서 환경맵용 키 라이트 원반 추가
            if (key && key.E > 0) {
                const d = key.dir, cosR = Math.cos(Math.max(key.radius, 0.004));
                const pix = []; let solid = 0;
                for (let y = 0; y < H; y++) {
                    const lat = ((y + 0.5) / H - 0.5) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
                    if (Math.abs(sl - d.y) > 0.05) continue;
                    const dOm = (2 * Math.PI / W) * (Math.PI / H) * cl;
                    for (let x = 0; x < W; x++) {
                        const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
                        if (cl * Math.cos(phi) * d.x + sl * d.y + cl * Math.sin(phi) * d.z > cosR) { pix.push((y * W + x) * 4); solid += dOm; }
                    }
                }
                if (!pix.length) {
                    const u = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5, v = Math.asin(d.y) / Math.PI + 0.5;
                    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor(v * H));
                    pix.push((y * W + x) * 4);
                    solid = (2 * Math.PI / W) * (Math.PI / H) * Math.max(0.02, Math.cos((v - 0.5) * Math.PI));
                }
                for (const i of pix) {
                    data[i] += key.color.r / solid; data[i + 1] += key.color.g / solid; data[i + 2] += key.color.b / solid;
                }
            }
            const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
            tex.mapping = THREE.EquirectangularReflectionMapping;
            tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return { dataTexture: tex, pmrem: envRT.texture };
        },
        setPixelSigma(camera, heightPx) {
            nightUniforms.pointSigma.value = Math.max(0.0004, (camera.fov * Math.PI / 180) / heightPx * 0.9);
        },
    };
}
