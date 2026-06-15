// selection.js
// ------------------------------------------------------------
// 클릭으로 엔티티 선택 -> TransformControls(이동 기즈모) 부착.
// 드래그 중에는 state만 갱신(geometry dirty=false)하고 표시용 메시만 옮긴다.
// 드래그가 끝나면 한 번만 geometry dirty=true로 BVH를 재빌드한다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state, setTransform } from './state.js?v=65f641c8';
import { entityToMesh, entityBounds } from './scene-build.js?v=cdf1dbd1';

export function createSelection({ renderer, camera, scene, orbitControls, onDragStateChange }) {
    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setMode('translate');
    gizmo.setSize(0.8);
    const helper = gizmo; // three@0.160: TransformControls 자체가 Object3D로 add 가능 (getHelper는 ~0.170+)
    scene.add(helper);

    let dragMesh = null; // 드래그 중 보여줄 임시 placeholder 메시 (BVH 메시와 별개)

    gizmo.addEventListener('dragging-changed', (e) => {
        orbitControls.enabled = !e.value;
        onDragStateChange(e.value);
        if (!e.value && dragMesh && state.selectedId) {
            // 드래그 종료: 최종 위치를 state에 반영하고 BVH 재빌드 트리거
            setTransform(state.selectedId, dragMesh.position, true);
        }
    });

    gizmo.addEventListener('change', () => {
        if (dragMesh && state.selectedId) {
            // 드래그 중: state 위치만 갱신, geometry dirty=false (재빌드 안 함 → 끊김 없음)
            setTransform(state.selectedId, dragMesh.position, false);
        }
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pick(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);

        let bestId = null, bestDist = Infinity;
        for (const entity of state.entities.values()) {
            if (entity.pinned) continue; // 바닥 등 고정 오브젝트는 선택 불가
            const box = entityBounds(entity);
            const hitPoint = raycaster.ray.intersectBox(box, new THREE.Vector3());
            if (hitPoint) {
                const d = hitPoint.distanceTo(raycaster.ray.origin);
                if (d < bestDist) { bestDist = d; bestId = entity.id; }
            }
        }
        return bestId;
    }

    function select(id) {
        state.selectedId = id;
        if (dragMesh) {
            gizmo.detach();
            scene.remove(dragMesh);
            dragMesh.geometry = null;
            dragMesh = null;
        }
        if (id) {
            const entity = state.entities.get(id);
            dragMesh = entityToMesh(entity);
            dragMesh.visible = false; // 패스트레이서가 이미 그리므로 래스터로는 안 보이게 (기즈모 부착용 placeholder)
            scene.add(dragMesh);
            gizmo.attach(dragMesh);
        }
    }

    function onPointerDown(event) {
        if (gizmo.dragging) return; // 기즈모를 직접 잡은 경우엔 재선택하지 않음
        const id = pick(event);
        select(id);
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    return {
        gizmo,
        select,
        dispose() {
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            gizmo.dispose();
        },
    };
}
