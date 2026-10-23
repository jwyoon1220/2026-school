// rt.js
// ------------------------------------------------------------
// 하이브리드 레이트레이싱 (기본 렌더 모드).
// 1차 가시성은 래스터화로 그리고, 각 픽셀 셰이더에서 BVH(three-mesh-bvh GLSL)로
//  - 그림자 광선: 태양/달 방향 → 가려지면 직사광 0 (그림자맵 대신)
//  - 반사 광선: 매끈한 표면(거칠기 < 0.4)에서 반사 방향 → 맞은 물체의 색/발광/조명
// 을 직접 추적한다. 누적이 필요 없으므로 움직여도 노이즈가 없다.
//
// BVH는 패스트레이서가 쓰는 것과 같은 병합 지오메트리(PathTracingSceneGenerator)를
// 그대로 쓰고, 맞은 삼각형의 재질 색은 정점별 속성 텍스처로 조회한다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { MeshBVHUniformStruct, FloatVertexAttributeTexture, shaderStructs, shaderIntersectFunction } from 'three-mesh-bvh';

// 셰이더 공용 uniform (모든 패치된 머티리얼 + 바다 셰이더가 같은 객체를 공유)
export const rtUniforms = {
    rtBVH: { value: new MeshBVHUniformStruct() },
    rtAlbedo: { value: new FloatVertexAttributeTexture() },
    rtEmissive: { value: new FloatVertexAttributeTexture() },
    rtLightDir: { value: new THREE.Vector3(0, 1, 0) },   // 월드, 광원 쪽
    rtLightColor: { value: new THREE.Color(0, 0, 0) },   // 조도 (색 * E)
    rtAmbient: { value: new THREE.Color(0.05, 0.05, 0.06) },
    rtFlags: { value: new THREE.Vector4(1, 1, 0, 0) },   // x: 그림자, y: 반사, z: BVH 준비됨
};

// GLSL: BVH 추적 + 맞은 점 셰이딩 (패치/바다 공용)
export const RT_GLSL = /* glsl */`
precision highp isampler2D;
precision highp usampler2D;
#define BVH_STACK_DEPTH 48
${shaderStructs}
${shaderIntersectFunction}
uniform BVH rtBVH;
uniform sampler2D rtAlbedo;
uniform sampler2D rtEmissive;
uniform vec3 rtLightDir;
uniform vec3 rtLightColor;
uniform vec3 rtAmbient;
uniform vec4 rtFlags;

// 가려짐 여부 (1 = 보임)
float rtShadow(vec3 o, vec3 d) {
    if (rtFlags.z < 0.5) return 1.0;
    uvec4 fi; vec3 fn; vec3 bc; float side; float dist;
    bool hit = bvhIntersectFirstHit(rtBVH, o, d, fi, fn, bc, side, dist);
    return hit ? 0.0 : 1.0;
}

// 반사 광선: 맞으면 true + 맞은 점의 방사휘도
bool rtTrace(vec3 o, vec3 d, out vec3 col, out float hitDist) {
    col = vec3(0.0); hitDist = 1e20;
    if (rtFlags.z < 0.5) return false;
    uvec4 fi; vec3 fn; vec3 bc; float side; float dist;
    if (!bvhIntersectFirstHit(rtBVH, o, d, fi, fn, bc, side, dist)) return false;
    vec4 alb = textureSampleBarycoord(rtAlbedo, bc, fi.xyz);
    vec4 emi = textureSampleBarycoord(rtEmissive, bc, fi.xyz);
    vec3 n = normalize(fn) * side;
    if (dot(n, d) > 0.0) n = -n;
    vec3 p = o + d * dist;
    float ndl = max(dot(n, rtLightDir), 0.0);
    // 2차 그림자 광선은 비용 대비 효과가 작아 생략 (밝은 면 반사 근사)
    col = alb.rgb * (rtAmbient + rtLightColor * ndl / 3.14159265) + emi.rgb;
    hitDist = dist;
    return true;
}
`;

// ------------------------------------------------------------
// 생성기 결과(병합 지오메트리 + BVH + 머티리얼)로 GPU 데이터 갱신
// ------------------------------------------------------------
const avgCache = new WeakMap();
// 텍스처 평균색 (반사로 보이는 먼 물체용 근사)
function textureAverage(tex) {
    if (!tex || !tex.image) return [1, 1, 1];
    if (avgCache.has(tex)) return avgCache.get(tex);
    let out = [1, 1, 1];
    try {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const x = c.getContext('2d');
        x.drawImage(tex.image, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        const lin = (v) => Math.pow(v / n / 255, 2.2);
        out = [lin(r), lin(g), lin(b)];
    } catch (e) { /* cross-origin 등 */ }
    avgCache.set(tex, out);
    return out;
}

export function updateRTScene({ bvh, geometry, materials }) {
    if (!bvh || !geometry) { rtUniforms.rtFlags.value.z = 0; return; }
    rtUniforms.rtBVH.value.updateFrom(bvh);
    const mi = geometry.attributes.materialIndex;
    const n = geometry.attributes.position.count;
    const alb = new Float32Array(n * 4), emi = new Float32Array(n * 4);
    const matCols = materials.map((m) => {
        const t = textureAverage(m.map);
        const c = m.color || new THREE.Color(1, 1, 1);
        const e = m.emissive || new THREE.Color(0, 0, 0);
        const et = m.emissiveMap ? textureAverage(m.emissiveMap) : [1, 1, 1];
        const ei = m.emissiveIntensity ?? 1;
        return [c.r * t[0], c.g * t[1], c.b * t[2], e.r * et[0] * ei, e.g * et[1] * ei, e.b * et[2] * ei];
    });
    for (let i = 0; i < n; i++) {
        const k = mi ? mi.getX(i) : 0;
        const mc = matCols[k] || [0.8, 0.8, 0.8, 0, 0, 0];
        alb[i * 4] = mc[0]; alb[i * 4 + 1] = mc[1]; alb[i * 4 + 2] = mc[2]; alb[i * 4 + 3] = 1;
        emi[i * 4] = mc[3]; emi[i * 4 + 1] = mc[4]; emi[i * 4 + 2] = mc[5]; emi[i * 4 + 3] = 1;
    }
    rtUniforms.rtAlbedo.value.updateFrom(new THREE.BufferAttribute(alb, 4));
    rtUniforms.rtEmissive.value.updateFrom(new THREE.BufferAttribute(emi, 4));
    rtUniforms.rtFlags.value.z = 1;
}

// ------------------------------------------------------------
// MeshStandardMaterial / MeshPhysicalMaterial 패치
//   - 주광원(태양/달)은 three.js 조명 대신 여기서 계산 (BVH 그림자 포함)
//   - 매끈한 표면은 반사 광선으로 환경맵 반사를 실제 물체로 대체
// ------------------------------------------------------------
const FRAG_INJECT = /* glsl */`
#include <lights_fragment_end>
{
    vec3 rtN = normalize((vec4(geometryNormal, 0.0) * viewMatrix).xyz);
    vec3 rtV = normalize(cameraPosition - vRtWorldPos);
    float rtBias = 0.02 + 0.0005 * length(cameraPosition - vRtWorldPos);
    if (dot(rtLightColor, vec3(1.0)) > 0.0) {
        IncidentLight rtL;
        rtL.direction = normalize((viewMatrix * vec4(rtLightDir, 0.0)).xyz);
        rtL.visible = true;
        float sh = 1.0;
        if (rtFlags.x > 0.5 && dot(rtN, rtLightDir) > 0.0) sh = rtShadow(vRtWorldPos + rtN * rtBias, rtLightDir);
        rtL.color = rtLightColor * sh;
        RE_Direct(rtL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
    if (rtFlags.y > 0.5 && material.roughness < 0.4) {
        vec3 rtR = reflect(-rtV, rtN);
        vec3 hc; float hd;
        if (rtTrace(vRtWorldPos + rtN * rtBias, rtR, hc, hd)) {
            vec3 fr = EnvironmentBRDF(geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness);
            float k = 1.0 - smoothstep(0.12, 0.4, material.roughness);
            reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, hc * fr, k);
        }
    }
}
`;

export function patchMaterial(m) {
    if (!m || m.userData.rtPatched || !(m.isMeshStandardMaterial)) return;
    m.userData.rtPatched = true;
    m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, rtUniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vRtWorldPos;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvRtWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vRtWorldPos;\n${RT_GLSL}`)
            .replace('#include <lights_fragment_end>', FRAG_INJECT);
    };
    m.customProgramCacheKey = () => 'rt-v1';
    m.needsUpdate = true;
}

export function patchObject(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(patchMaterial);
    });
}
