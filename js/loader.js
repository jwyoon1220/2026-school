// loader.js
// ------------------------------------------------------------
// .obj/.gltf/.glb 파일을 로드해 단위 크기로 정규화한 THREE.Group을
// 생성하고, 'model' 타입 엔티티로 state에 추가한다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { addEntity, makeId } from './state.js?v=6';

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

// 모델을 원점 중심, 최대축 길이가 targetSize가 되도록 정규화
function normalizeModel(object, targetSize = 3) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const scale = targetSize / maxDim;

    // 래퍼 그룹: 정규화 변환을 여기에 적용해두면, 엔티티의 transform(이동/회전/스케일)은
    // 이 정규화된 결과 위에 추가로 곱해진다 (별도 보정 로직 불필요).
    const wrapper = new THREE.Group();
    object.position.sub(center).multiplyScalar(scale);
    object.scale.multiplyScalar(scale);
    object.updateMatrixWorld(true);
    wrapper.add(object);

    // 메시에 normal/tangent 없는 경우 경로추적기가 요구하므로 보강
    wrapper.traverse((c) => {
        if (c.isMesh) {
            if (!c.geometry.attributes.normal) c.geometry.computeVertexNormals();
            if (!c.geometry.attributes.uv) {
                // UV 없는 geometry는 일부 머티리얼 텍스처 처리에서 오류가 날 수 있으므로 더미 UV 부여
                const count = c.geometry.attributes.position.count;
                c.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
            }
            c.geometry.computeBoundingBox();
            c.geometry.computeBoundingSphere();
        }
    });

    return wrapper;
}

// 바닥 위(y=floorY)에 모델 하단이 닿도록 y 위치 보정값 계산
function floorOffset(group, floorY = 0) {
    const box = new THREE.Box3().setFromObject(group);
    return floorY - box.min.y;
}

function addModelEntity(group, name) {
    const yOffset = floorOffset(group, 0);
    addEntity({
        id: makeId('model'),
        type: 'model',
        name,
        modelData: group,
        transform: {
            position: [0, yOffset, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
        },
        material: {}, // 모델은 자체 머티리얼을 사용 (entityToMesh에서 type='model'이면 무시됨)
        pinned: false,
    });
}

// 파일 입력을 받아 확장자에 따라 적절한 로더로 처리.
// onLoaded(): BVH 재빌드를 트리거하기 위한 콜백.
export function loadModelFile(file, onLoaded, onError) {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();
    const name = file.name;

    const finish = (object) => {
        const group = normalizeModel(object);
        addModelEntity(group, name);
        URL.revokeObjectURL(url);
        onLoaded();
    };

    const fail = (err) => {
        URL.revokeObjectURL(url);
        console.error('모델 로드 실패:', err);
        if (onError) onError(err);
    };

    if (ext === 'gltf' || ext === 'glb') {
        gltfLoader.load(url, (gltf) => finish(gltf.scene), undefined, fail);
    } else if (ext === 'obj') {
        objLoader.load(url, (obj) => finish(obj), undefined, fail);
    } else {
        fail(new Error(`지원하지 않는 형식: .${ext} (obj/gltf/glb만 가능)`));
    }
}
