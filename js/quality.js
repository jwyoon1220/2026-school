// quality.js
// ------------------------------------------------------------
// 기기 성능 추정 → 품질 프리셋.
// 크롬북(CrOS), 내장/모바일 GPU(Intel UHD/HD, Mali, Adreno, PowerVR, SwiftShader 등),
// 코어 수가 적은 기기는 '저사양'으로 시작한다. GUI에서 언제든 바꿀 수 있다.
// ------------------------------------------------------------

export const PRESETS = {
    low: {
        low: true,
        textureSize: 512,
        resolutionScale: 0.55,  // 정지 시 패스트레이싱 해상도 (CSS 픽셀 대비)
        previewMin: 0.15,       // 이동 중 패스트레이싱 미리보기 해상도 범위
        previewMax: 0.35,
        bounces: 3,
        movingBounces: 1,
        transmissiveBounces: 2,
        shadowMapSize: 1024,
        maxSamples: 256,
        rtMin: 0.4,             // 레이트레이싱 모드 최저 렌더 해상도
        rtStart: 0.7,
    },
    high: {
        low: false,
        textureSize: 1024,
        resolutionScale: 1.0,
        previewMin: 0.25,
        previewMax: 0.6,
        bounces: 5,
        movingBounces: 2,
        transmissiveBounces: 4,
        shadowMapSize: 2048,
        maxSamples: 1024,
        rtMin: 0.5,
        rtStart: 1.0,
    },
};

export function detectQuality(renderer) {
    const info = { gpu: 'unknown', reason: [] };
    try {
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        info.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) { /* 일부 브라우저는 차단 */ }
    const ua = navigator.userAgent || '';
    if (/CrOS/.test(ua)) info.reason.push('ChromeOS');
    if (/Android|iPhone|iPad/.test(ua)) info.reason.push('mobile');
    if (/(Intel.*(UHD|HD|Iris)|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Apple GPU)/i.test(info.gpu)) info.reason.push('integrated GPU');
    if ((navigator.hardwareConcurrency || 8) <= 4) info.reason.push('≤4 cores');
    info.preset = info.reason.length ? 'low' : 'high';
    return info;
}
