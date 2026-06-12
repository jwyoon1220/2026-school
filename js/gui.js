// gui.js
// ------------------------------------------------------------
// lil-gui 패널. state.params를 직접 바인딩하고, 변경 시 콜백으로
// dirty 플래그/리셋을 트리거한다. GUI 자체는 데이터를 소유하지 않음.
// ------------------------------------------------------------
import GUI from 'lil-gui';
import { state, addEntity, removeEntity, makeId, markEnvironmentDirty, markGeometryDirty } from './state.js?v=5';

export function setupGUI({ onEnvChange, onInteract, onBouncesChange, onFilterChange, onExposureChange, onRemoveSelected }) {
    const gui = new GUI();
    const p = state.params;

    const sun = gui.addFolder('Sun & Sky');
    sun.add(p, 'sunAzimuth', 0, 360, 1).name('Sun Azimuth').onChange(onEnvChange);
    sun.add(p, 'sunElevation', -10, 90, 1).name('Sun Elevation').onChange(onEnvChange);
    sun.add(p, 'sunSize', 0.5, 30, 0.5).name('Shadow Softness').onChange(onEnvChange);
    sun.add(p, 'sunIntensity', 0, 60, 0.5).name('Sun Intensity').onChange(onEnvChange);
    sun.addColor(p, 'sunColor').name('Sun Color').onChange(onEnvChange);
    sun.addColor(p, 'skyZenith').name('Sky Top').onChange(onEnvChange);
    sun.addColor(p, 'skyHorizon').name('Sky Horizon').onChange(onEnvChange);
    sun.addColor(p, 'groundColor').name('Ground').onChange(onEnvChange);
    sun.add(p, 'envIntensity', 0, 3, 0.05).name('Env Intensity').onChange(onEnvChange);

    const render = gui.addFolder('Render');
    render.add(p, 'bounces', 1, 16, 1).onChange(onBouncesChange);
    render.add(p, 'maxSamples', 32, 4096, 16);
    render.add(p, 'targetFPS', 10, 60, 5).name('Target FPS');
    render.add(p, 'resolutionScale', 0.25, 1.0, 0.05).name('Resolution').onChange(onInteract);
    render.add(p, 'filterGlossy', 0, 1, 0.05).name('Glossy Filter').onChange(onFilterChange);
    render.add(p, 'exposure', 0.2, 2.0, 0.05).name('Exposure').onChange(onExposureChange);

    const obj = gui.addFolder('Objects');
    obj.add({
        addSphere: () => {
            addEntity({
                id: makeId('sphere'),
                type: 'sphere',
                transform: {
                    position: [(Math.random() - 0.5) * 12, 1 + Math.random() * 2, (Math.random() - 0.5) * 12],
                    rotation: [0, 0, 0], scale: [1, 1, 1],
                },
                material: { color: Math.random() * 0xffffff, roughness: Math.random() * 0.8, metalness: Math.random() > 0.5 ? 1.0 : 0.0 },
                pinned: false,
            });
            onInteract();
        }
    }, 'addSphere').name('Add Sphere');

    obj.add({
        addBox: () => {
            addEntity({
                id: makeId('box'),
                type: 'box',
                transform: {
                    position: [(Math.random() - 0.5) * 12, 1 + Math.random() * 2, (Math.random() - 0.5) * 12],
                    rotation: [0, 0, 0], scale: [1.5, 1.5, 1.5],
                },
                material: { color: Math.random() * 0xffffff, roughness: Math.random() * 0.8, metalness: Math.random() > 0.5 ? 1.0 : 0.0 },
                pinned: false,
            });
            onInteract();
        }
    }, 'addBox').name('Add Box');

    obj.add({
        deleteSelected: () => {
            if (state.selectedId) {
                onRemoveSelected(state.selectedId);
                removeEntity(state.selectedId);
                onInteract();
            }
        }
    }, 'deleteSelected').name('Delete Selected');

    obj.add({
        loadModel: () => document.getElementById('model-file-input').click()
    }, 'loadModel').name('Load OBJ/GLTF');

    return gui;
}
