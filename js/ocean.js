// ocean.js
// ------------------------------------------------------------
// 일렁이는 밤바다.
//  - 레이트레이싱 모드: 카메라를 따라다니는 방사형 격자 + Gerstner 파도(정점 변위)
//    + 픽셀 단위 세부 파도 법선. 각 픽셀에서
//      반사 광선 → BVH(등대/바위/배/부두)와 교차, 안 맞으면 실제 밤하늘(NASA 별 지도)
//      태양/달/등대/집어등 → 거칠기를 가진 GGX 반사 (달빛 길 = moonglade)
//  - 패스트레이싱 모드: 같은 파도 식으로 CPU에서 만든 "정지 스냅샷" 메시를 BVH에 넣는다
//    (패스트레이싱은 누적이 필요해 파도를 멈춘 순간을 렌더링)
// ------------------------------------------------------------
import * as THREE from 'three';
import { RT_GLSL, rtUniforms } from './rt.js?v=02423be4';
import { NIGHT_SKY_GLSL, nightUniforms } from './nightsky.js?v=a5a49d5e';

const G = 9.81;
// [파장 m, 진폭 m, 방향(라디안, 진행 방향), 가파름 Q, 위상]
// 바람은 동→서 (먼바다에서 해안으로 밀려오는 파도)
export const WAVES = [
    [62, 0.38, Math.PI + 0.10, 0.55, 0.0],
    [37, 0.24, Math.PI - 0.32, 0.60, 1.3],
    [23, 0.14, Math.PI + 0.45, 0.65, 2.1],
    [14, 0.085, Math.PI - 0.70, 0.70, 0.7],
    [9.0, 0.050, Math.PI + 0.85, 0.70, 4.0],
    [5.6, 0.030, Math.PI - 0.15, 0.65, 2.6],
];
// 법선 전용 잔물결 (픽셀 셰이더, 거리에 따라 감쇠)
export const DETAIL = [
    [3.3, 0.018, Math.PI + 1.1], [2.1, 0.011, Math.PI - 0.9], [1.37, 0.0075, Math.PI + 0.35],
    [0.86, 0.0048, Math.PI - 1.4], [0.55, 0.0031, Math.PI + 0.7], [0.34, 0.0019, Math.PI - 0.25],
];

function waveGLSLConsts() {
    const fmt = (v) => v.toFixed(6);
    const w = WAVES.map(([L, A, a, Q, ph]) => {
        const k = 2 * Math.PI / L;
        return `vec4(${fmt(Math.cos(a))}, ${fmt(Math.sin(a))}, ${fmt(k)}, ${fmt(A)}), vec4(${fmt(Math.sqrt(G * k))}, ${fmt(Q)}, ${fmt(ph)}, 0.0)`;
    }).join(',\n');
    const d = DETAIL.map(([L, A, a]) => {
        const k = 2 * Math.PI / L;
        return `vec4(${fmt(Math.cos(a))}, ${fmt(Math.sin(a))}, ${fmt(k)}, ${fmt(A)}), vec4(${fmt(Math.sqrt(G * k))}, ${fmt(L)}, ${fmt(k * 1.7)}, 0.0)`;
    }).join(',\n');
    return `
const int NW = ${WAVES.length};
const vec4 WV[${WAVES.length * 2}] = vec4[](${w});
const int ND = ${DETAIL.length};
const vec4 DV[${DETAIL.length * 2}] = vec4[](${d});
`;
}

// CPU 동일 식 (스냅샷용). GPU와 같은 정규화: 수평 변위 = Q/(k·N) · D · cos
export function waveDisplace(x, z, t, fade = 1, out = [0, 0, 0]) {
    let px = x, py = 0, pz = z;
    for (const [L, A, a, Q, ph] of WAVES) {
        const k = 2 * Math.PI / L, w = Math.sqrt(G * k), ux = Math.cos(a), uz = Math.sin(a);
        const th = k * (ux * x + uz * z) - w * t + ph;
        const h = Q / (k * WAVES.length) * Math.cos(th) * fade;
        px += h * ux; pz += h * uz;
        py += A * Math.sin(th) * fade;
    }
    out[0] = px; out[1] = py; out[2] = pz;
    return out;
}

const OCEAN_VS = /* glsl */`
${waveGLSLConsts()}
uniform float uTime;
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec2 vFlat;
varying float vFoam;
void main() {
    vec2 p = position.xz + uCenter;
    float dist = length(p - cameraPosition.xz);
    float fade = 1.0 - smoothstep(250.0, 1400.0, dist);
    vec3 P = vec3(p.x, 0.0, p.y);
    float jac = 1.0;
    for (int i = 0; i < NW; i++) {
        vec4 a = WV[i * 2], b = WV[i * 2 + 1];
        float th = a.z * dot(a.xy, p) - b.x * uTime + b.z;
        float c = cos(th), s = sin(th);
        float q = b.y / (a.z * a.w * float(NW));
        P.x += q * a.w * a.x * c * fade;
        P.z += q * a.w * a.y * c * fade;
        P.y += a.w * s * fade;
        jac -= q * a.z * a.w * s * fade;
    }
    vWorld = P;
    vFlat = p;
    vFoam = jac;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}
`;

const OCEAN_FS = /* glsl */`
${waveGLSLConsts()}
${RT_GLSL}
${NIGHT_SKY_GLSL}
uniform float uTime;
uniform vec4 uGlints[8];      // xyz 위치, w 세기 (등대, 집어등)
uniform vec3 uGlintCol[8];
uniform float uRoughness;
uniform float uExposureHint;
varying vec3 vWorld;
varying vec2 vFlat;
varying float vFoam;

float ggx(float nh, float a) {
    float a2 = a * a;
    float d = nh * nh * (a2 - 1.0) + 1.0;
    return a2 / (3.14159265 * d * d);
}

void main() {
    vec2 p = vFlat;
    float dist = length(vWorld - cameraPosition);
    float fade = 1.0 - smoothstep(250.0, 1400.0, length(p - cameraPosition.xz));
    // 큰 파도의 해석적 법선
    vec3 n = vec3(0.0, 1.0, 0.0);
    for (int i = 0; i < NW; i++) {
        vec4 a = WV[i * 2], b = WV[i * 2 + 1];
        float th = a.z * dot(a.xy, p) - b.x * uTime + b.z;
        float wa = a.z * a.w * fade;
        n.x -= a.x * wa * cos(th);
        n.z -= a.y * wa * cos(th);
    }
    // 잔물결: 픽셀 크기보다 작은 파장은 감쇠 → 대신 거칠기로 전환 (반짝임 깜빡임 방지)
    float foot = max(length(fwidth(p)), 1e-4);
    float lost = 0.0;
    for (int i = 0; i < ND; i++) {
        vec4 a = DV[i * 2], b = DV[i * 2 + 1];
        float wgt = 1.0 - smoothstep(b.y * 0.15, b.y * 0.6, foot);
        float th = a.z * dot(a.xy, p) - b.x * uTime + float(i) * 1.7;
        float sl = a.z * a.w;
        n.x -= a.x * sl * cos(th) * wgt;
        n.z -= a.y * sl * cos(th) * wgt;
        lost += sl * (1.0 - wgt);
    }
    n = normalize(n);
    float rough = clamp(uRoughness + lost * 0.9 + foot * 0.0015, 0.02, 0.6);

    vec3 V = normalize(cameraPosition - vWorld);
    float nv = max(dot(n, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
    vec3 R = reflect(-V, n);
    if (R.y < 0.002) R = normalize(vec3(R.x, 0.002 + abs(R.y) * 0.3, R.z));

    // ---- 반사 광선: BVH (물체) → 없으면 밤하늘 ----
    // 수면에 비친 상은 "눈과 물체 사이"의 물 위에만 생긴다. 반사될 물체(부두·등대·바위)는
    // 모두 650m 안에 있으므로 그 너머 수면, 그리고 반사율(F)이 낮은 발밑 수면은 하늘만 샘플.
    // (수 km 밖 배의 불빛 반사는 아래 GGX 반짝임이 담당)
    vec3 refl; float hd;
    bool traced = rtFlags.y > 0.5 && F > 0.035 && dist < 650.0 && rtTrace(vWorld + n * 0.05, R, 650.0, refl, hd);
    if (!traced) refl = nightSky(R, false);

    // ---- 주광원(달/태양) 하이라이트: GGX로 원반 반사를 넓게 (달빛 길) ----
    vec3 L = rtLightDir;
    vec3 H = normalize(L + V);
    float a = rough * rough + 0.004;
    float nl = max(dot(n, L), 0.0);
    vec3 spec = rtLightColor * ggx(max(dot(n, H), 0.0), a) * F * 0.25 / max(nv, 0.05) * nl * step(0.0, L.y);
    // 그림자 광선은 하이라이트가 실제로 보이는 픽셀(달빛 길)에서만
    float vis = 1.0;
    if (rtFlags.x > 0.5 && L.y > 0.0 && dot(spec, vec3(0.333)) > 0.002) vis = rtShadow(vWorld + n * 0.05, L);
    spec *= vis;

    // ---- 등대 / 집어등 반짝임 (점광원 GGX, 수면에 길게 번짐) ----
    for (int i = 0; i < 8; i++) {
        vec4 g = uGlints[i];
        if (g.w <= 0.0) continue;
        vec3 Lp = g.xyz - vWorld;
        // 반짝임은 광원과 거의 같은 방위(화면에서 광원 아래 세로 띠)에만 생김 → 나머지 픽셀은 건너뜀
        vec2 toL = normalize(Lp.xz), toE = normalize(cameraPosition.xz - vWorld.xz);
        if (dot(toL, -toE) < 0.94) continue;
        float d2 = dot(Lp, Lp);
        vec3 Ld = Lp * inversesqrt(d2);
        vec3 Hp = normalize(Ld + V);
        float ap = a + 0.02;
        spec += uGlintCol[i] * g.w / d2 * ggx(max(dot(n, Hp), 0.0), ap) * F * 0.25 / max(nv, 0.05) * max(dot(n, Ld), 0.0);
    }

    // ---- 물빛: 깊은 바다 산란 + 물마루 투과광 ----
    vec3 deep = vec3(0.004, 0.018, 0.026);
    vec3 ambient = rtAmbient;
    vec3 water = deep * (ambient + rtLightColor * max(L.y, 0.0) * 0.3);
    float crest = clamp(vWorld.y * 1.2 + 0.3, 0.0, 1.0);
    water += vec3(0.01, 0.05, 0.05) * crest * (rtLightColor * pow(max(dot(-L, V) * 0.5 + 0.5, 0.0), 3.0) * 0.4 + ambient * 0.2);
    // 흰 물거품 (파도 마루가 접힐 때)
    float foam = smoothstep(0.55, 0.15, vFoam) * fade;
    vec3 foamCol = vec3(0.8, 0.85, 0.9) * (ambient + rtLightColor * nl * vis) * 0.35;

    vec3 col = mix(water, refl, F) + spec;
    col = mix(col, foamCol, foam * 0.6);

    // 수평선 박무
    float haze = 1.0 - exp(-dist * 0.00018);
    col = mix(col, skyHaze(normalize(vec3(-V.x, 0.015, -V.z))), haze);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export function createOceanMesh() {
    // 방사형 격자: 중심부 촘촘, 멀수록 듬성
    // 첫 링 간격 0.6m, 133링 → 반경 약 8km (눈높이 4m의 수평선 ≈ 7km)
    const RINGS = 133, SEG = 160;
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let r = 1; r <= RINGS; r++) {
        const rad = 0.6 * (Math.pow(1.05, r) - 1) / 0.05;
        for (let s = 0; s < SEG; s++) {
            const a = (s / SEG) * Math.PI * 2;
            pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        }
    }
    const ring = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * SEG + (s % SEG));
    for (let s = 0; s < SEG; s++) idx.push(0, ring(1, s + 1), ring(1, s));
    for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
        const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s + 1), d = ring(r + 1, s);
        idx.push(a, b, c, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const glints = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
    const glintCols = Array.from({ length: 8 }, () => new THREE.Color(1, 1, 1));
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            ...rtUniforms, ...nightUniforms,
            uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() },
            uGlints: { value: glints }, uGlintCol: { value: glintCols },
            uRoughness: { value: 0.06 }, uExposureHint: { value: 1 },
        },
        vertexShader: OCEAN_VS,
        fragmentShader: OCEAN_FS,
        extensions: { derivatives: true },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.update = (camera, time) => {
        // 격자 간격 단위로 카메라를 따라가 정점이 미끄러지지 않게
        const snap = 2.0;
        mat.uniforms.uCenter.value.set(Math.round(camera.position.x / snap) * snap, Math.round(camera.position.z / snap) * snap);
        mat.uniforms.uTime.value = time;
    };
    mesh.userData.setGlints = (list) => {
        for (let i = 0; i < 8; i++) {
            const g = list[i];
            if (g) { glints[i].set(g.pos[0], g.pos[1], g.pos[2], g.power); glintCols[i].setRGB(...g.color); } else glints[i].w = 0;
        }
    };
    return mesh;
}

// 패스트레이싱용 정지 스냅샷 (같은 Gerstner 식, CPU)
export function oceanSnapshotGeometry(time, cx, cz, low) {
    const RINGS = low ? 70 : 110, SEG = low ? 96 : 160;
    const pos = [], idx = [];
    const tmp = [0, 0, 0];
    const disp = (x, z) => waveDisplace(x, z, time, 1 - THREE.MathUtils.smoothstep(Math.hypot(x - cx, z - cz), 250, 1400), tmp);
    pos.push(...disp(cx, cz));
    for (let r = 1; r <= RINGS; r++) {
        const rad = 0.8 * (Math.pow(1.085, r) - 1) / 0.085;
        for (let s = 0; s < SEG; s++) {
            const a = (s / SEG) * Math.PI * 2;
            pos.push(...disp(cx + Math.cos(a) * rad, cz + Math.sin(a) * rad));
        }
    }
    const ring = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * SEG + (s % SEG));
    for (let s = 0; s < SEG; s++) idx.push(0, ring(1, s + 1), ring(1, s));
    for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
        const a = ring(r, s), b = ring(r, s + 1), c = ring(r + 1, s + 1), d = ring(r + 1, s);
        idx.push(a, b, c, a, c, d);
    }
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
}
