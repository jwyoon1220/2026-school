// gui.js
// ------------------------------------------------------------
// lil-gui 패널. state.params를 직접 바인딩하고, 변경 시 콜백으로
// dirty 플래그/리셋을 트리거한다. GUI 자체는 데이터를 소유하지 않음.
// ------------------------------------------------------------
import GUI from 'lil-gui';
import { state } from './state.js?v=f4ef0eaf';
import { SCENE_LABELS } from './scenes.js?v=24405aee';

// 각 설명은 astro.js 계산(JPL Horizons와 대조)으로 확인한 내용
export const SKY_PRESETS = {
    '08-12 23:30 그믐 · 페르세우스 유성우 무렵 · 토성 동쪽 20°': '2026-08-12 23:30',
    '08-28 21:30 보름달 동남쪽 26° · 토성': '2026-08-28 21:30',
    '08-13 04:50 새벽 박명 · 화성 · 수성': '2026-08-13 04:50',
    '12-14 22:00 겨울 밤하늘 · 토성': '2026-12-14 22:00',
};

export function setupGUI(cb) {
    const gui = new GUI({ title: 'Ray / Path Tracer' });
    const p = state.params;

    gui.add(p, 'scene', SCENE_LABELS).name('장면 (1~4)').onChange(cb.onScene);
    gui.add(p, 'renderMode', { '레이트레이싱 (기본, 실시간)': 'raytrace', '패스트레이싱 (누적)': 'pathtrace' }).name('렌더 방식').onChange(cb.onRenderMode);
    gui.add(p, 'quality', { '저사양 (크롬북)': 'low', '고사양': 'high' }).name('품질').onChange(cb.onQuality);

    const rt = gui.addFolder('레이트레이싱');
    rt.add(p, 'rtShadows').name('BVH 그림자 광선').onChange(cb.onRTFlags);
    rt.add(p, 'rtReflections').name('BVH 반사 광선').onChange(cb.onRTFlags);
    rt.add(p, 'targetFPS', 20, 60, 5).name('목표 FPS');

    const sky = gui.addFolder('실제 밤하늘 (바다 장면)');
    const preset = { v: p.skyDate };
    sky.add(preset, 'v', SKY_PRESETS).name('추천 날짜').onChange((v) => { p.skyDate = v; dateCtl.updateDisplay(); cb.onSkyChange(); });
    const dateCtl = sky.add(p, 'skyDate').name('현지 날짜·시각').onFinishChange(cb.onSkyChange);
    sky.add(p, 'tzOffset', -12, 14, 0.5).name('UTC 오프셋').onFinishChange(cb.onSkyChange);
    sky.add(p, 'latitude', -90, 90, 0.01).name('위도').onFinishChange(cb.onSkyChange);
    sky.add(p, 'longitude', -180, 180, 0.01).name('경도').onFinishChange(cb.onSkyChange);
    sky.add(p, 'timeSpeed', { '정지': 0, '실시간 x1': 1, '1초=1분': 60, '1초=10분': 600 }).name('시간 흐름');
    sky.add(p, 'starIntensity', 0, 5, 0.05).name('별 밝기').onChange(cb.onSkyChange);
    sky.add(p, 'moonLight', 0, 2, 0.01).name('달빛 세기').onChange(cb.onSkyChange);
    sky.add(p, 'lightPollution', 0, 3, 0.05).name('도시 불빛').onChange(cb.onSkyChange);
    const info = { text: '-' };
    const infoCtl = sky.add(info, 'text').name('천체').disable();

    const sun = gui.addFolder('태양 / 하늘 (낮 장면)');
    sun.add(p, 'sunElevation', -15, 90, 0.5).name('태양 고도 (시간)').onChange(cb.onEnvChange);
    sun.add(p, 'sunAzimuth', 0, 360, 1).name('태양 방위').onChange(cb.onEnvChange);
    sun.add(p, 'sunSize', 0.5, 15, 0.5).name('그림자 부드러움').onChange(cb.onEnvChange);
    sun.add(p, 'sunIntensity', 0, 10, 0.1).name('태양 세기').onChange(cb.onEnvChange);
    sun.add(p, 'envIntensity', 0, 3, 0.05).name('하늘 밝기').onChange(cb.onEnvChange);
    sun.close();

    const render = gui.addFolder('패스트레이싱');
    render.add(p, 'previewMode', { '자동': 'auto', '패스트레이싱': 'pathtrace', '레이트레이싱 (빠름)': 'raster' }).name('이동 중 미리보기');
    render.add(p, 'resolutionScale', 0.25, 1.0, 0.05).name('정지 시 해상도').onChange(cb.onInteract);
    render.add(p, 'bounces', 1, 10, 1).name('바운스').onChange(cb.onBouncesChange);
    render.add(p, 'movingBounces', 1, 4, 1).name('이동 중 바운스');
    render.add(p, 'maxSamples', 16, 4096, 16).name('최대 샘플');
    render.add(p, 'denoise', 0, 1, 0.05).name('디노이즈');
    render.add(p, 'filterGlossy', 0, 1, 0.05).name('반짝임 억제').onChange(cb.onFilterChange);
    render.close();

    gui.add(p, 'exposure', 0.2, 6.0, 0.05).name('노출').onChange(cb.onExposureChange);

    const player = gui.addFolder('플레이어');
    player.add(p, 'walkSpeed', 1, 20, 0.5).name('걷기 속도');
    player.add(p, 'fov', 40, 110, 1).name('시야각').onChange(cb.onFov);
    player.close();

    const obj = gui.addFolder('오브젝트');
    obj.add({ f: cb.onAddSphere }, 'f').name('구 추가 (앞)');
    obj.add({ f: cb.onAddBox }, 'f').name('상자 추가 (앞)');
    obj.add({ f: cb.onLoadModel }, 'f').name('OBJ/GLTF 불러오기');
    obj.close();

    if (window.innerWidth < 700) gui.close();
    gui.setSkyInfo = (t) => { info.text = t; infoCtl.updateDisplay(); };
    return gui;
}
