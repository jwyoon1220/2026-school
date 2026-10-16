// gui.js
// ------------------------------------------------------------
// lil-gui 패널. state.params를 직접 바인딩하고, 변경 시 콜백으로
// dirty 플래그/리셋을 트리거한다. GUI 자체는 데이터를 소유하지 않음.
// ------------------------------------------------------------
import GUI from 'lil-gui';
import { state } from './state.js?v=a3299825';
import { SCENE_LABELS } from './scenes.js?v=ea739e2e';

export function setupGUI({ onScene, onQuality, onEnvChange, onInteract, onBouncesChange, onFilterChange, onExposureChange, onFov, onAddSphere, onAddBox, onLoadModel }) {
    const gui = new GUI({ title: 'Path Tracer' });
    const p = state.params;

    gui.add(p, 'scene', SCENE_LABELS).name('장면 (1/2/3)').onChange(onScene);
    gui.add(p, 'quality', { '저사양 (크롬북)': 'low', '고사양': 'high' }).name('품질').onChange(onQuality);
    gui.add(p, 'previewMode', { '자동': 'auto', '패스트레이싱': 'pathtrace', '래스터 (가장 빠름)': 'raster' }).name('이동 중 미리보기');

    const sun = gui.addFolder('태양 / 하늘');
    sun.add(p, 'sunElevation', -15, 90, 0.5).name('태양 고도 (시간)').onChange(onEnvChange);
    sun.add(p, 'sunAzimuth', 0, 360, 1).name('태양 방위').onChange(onEnvChange);
    sun.add(p, 'sunSize', 0.5, 15, 0.5).name('그림자 부드러움').onChange(onEnvChange);
    sun.add(p, 'sunIntensity', 0, 10, 0.1).name('태양 세기').onChange(onEnvChange);
    sun.add(p, 'envIntensity', 0, 3, 0.05).name('하늘 밝기').onChange(onEnvChange);

    const render = gui.addFolder('렌더');
    render.add(p, 'targetFPS', 20, 60, 5).name('목표 FPS');
    render.add(p, 'resolutionScale', 0.25, 1.0, 0.05).name('정지 시 해상도').onChange(onInteract);
    render.add(p, 'bounces', 1, 10, 1).name('바운스').onChange(onBouncesChange);
    render.add(p, 'movingBounces', 1, 4, 1).name('이동 중 바운스');
    render.add(p, 'maxSamples', 16, 4096, 16).name('최대 샘플');
    render.add(p, 'denoise', 0, 1, 0.05).name('디노이즈');
    render.add(p, 'filterGlossy', 0, 1, 0.05).name('반짝임 억제').onChange(onFilterChange);
    render.add(p, 'exposure', 0.2, 3.0, 0.05).name('노출').onChange(onExposureChange);
    render.close();

    const player = gui.addFolder('플레이어');
    player.add(p, 'walkSpeed', 1, 20, 0.5).name('걷기 속도');
    player.add(p, 'fov', 40, 110, 1).name('시야각').onChange(onFov);
    player.close();

    const obj = gui.addFolder('오브젝트');
    obj.add({ f: onAddSphere }, 'f').name('구 추가 (앞)');
    obj.add({ f: onAddBox }, 'f').name('상자 추가 (앞)');
    obj.add({ f: onLoadModel }, 'f').name('OBJ/GLTF 불러오기');
    obj.close();

    if (window.innerWidth < 700) gui.close();
    return gui;
}
