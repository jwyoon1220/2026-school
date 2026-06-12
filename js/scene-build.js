// scene-build.js
// ------------------------------------------------------------
// state.entities (데이터) -> three.js Mesh -> PathTracingSceneGenerator -> BVH
// 이 모듈은 "데이터를 읽어서 GPU에 올릴 자원을 만든다"는 한 방향 변환만 담당.
// 역방향(three.js 객체 -> 데이터 갱신)은 selection.js 쪽에서 setTransform으로 처리.
// ------------------------------------------------------------
import * as THREE from 'three';

const geometryCache = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 40, 40),
};

// 엔티티 데이터 1개 -> three.js Object3D (렌더용 임시 객체)
// type='model'인 경우 entity.modelData(THREE.Group, loader.js에서 로드됨)를 클론해 사용.
export function entityToMesh(entity) {
    const [px, py, pz] = entity.transform.position;
    const [rx, ry, rz] = entity.transform.rotation;
    const [sx, sy, sz] = entity.transform.scale;

    if (entity.type === 'model') {
        const group = entity.modelData.clone(true);
        // 클론된 메시들의 머티리얼도 공유하지 않도록 복제 (path tracer가 머티리얼별 인덱싱을 하므로 안전하게)
        group.traverse((c) => {
            if (c.isMesh && c.material) c.material = c.material.clone();
        });
        group.position.set(px, py, pz);
        group.rotation.set(rx, ry, rz);
        group.scale.set(sx, sy, sz);
        group.updateMatrixWorld(true);
        group.userData.entityId = entity.id;
        return group;
    }

    const geo = geometryCache[entity.type];
    const m = entity.material;
    const matOptions = { color: m.color, roughness: m.roughness, metalness: m.metalness };

    let mesh;
    if (m.transmission > 0) {
        mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
            ...matOptions, transmission: m.transmission, ior: m.ior, thickness: m.thickness,
        }));
    } else {
        mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matOptions));
    }

    mesh.position.set(px, py, pz);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    mesh.updateMatrixWorld(true);
    mesh.userData.entityId = entity.id; // 피킹 시 역참조용 (씬 그래프 한정, 데이터로 취급하지 않음)
    return mesh;
}

// 엔티티의 월드 바운딩박스 (컬링/피킹용)
export function entityBounds(entity) {
    const mesh = entityToMesh(entity);
    const box = new THREE.Box3().setFromObject(mesh);
    if (entity.type !== 'model') mesh.geometry = null; // 캐시 geometry는 dispose하지 않음
    return box;
}

// 프러스텀 컬링: 오브젝트 수가 적을 때(<= CULL_THRESHOLD)는 컬링 자체의
// 계산/리빌드 비용이 이득보다 크고, 카메라가 한 번 빌드된 이후 회전하면
// 화면 밖→안으로 들어오는 오브젝트가 사라지는 부작용이 있다.
// 따라서 임계값 이하에서는 전부 포함하고, 그 이상일 때만 컬링한다.
const CULL_THRESHOLD = 24;

export function cullEntities(entities, camera) {
    if (entities.length <= CULL_THRESHOLD) {
        return { visible: entities, culled: 0, total: entities.length };
    }

    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const projScreenMatrix = new THREE.Matrix4()
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const visible = [];
    let culled = 0;
    for (const e of entities) {
        if (e.pinned) { visible.push(e); continue; }
        const box = entityBounds(e);
        if (frustum.intersectsBox(box)) visible.push(e);
        else culled++;
    }
    return { visible, culled, total: entities.length };
}

// 보이는 엔티티들을 BVH/geometry/material 텍스처로 빌드해 ptRenderer.material에 주입
// 매 빌드마다 새 group/메시를 만들어 BVH를 재생성한다 (정확성 최우선 — 이 라이브러리
// 버전의 generate()가 transform-only 변경에 대한 refit을 보장하는지 불확실하므로
// 안전한 전체 재생성을 기본으로 한다).
//
// 다만 "텍스처 재업로드"는 비용이 커서, 사용된 텍스처 집합이 이전 빌드와 동일하면
// material.textures.setTextures를 건너뛴다 (드래그로 위치만 바뀌는 경우가 대부분이라
// 텍스처 집합은 거의 항상 동일 -> 이 스킵만으로도 체감 차이가 큼).
let lastTextureSet = null;

function sameTextures(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

export function buildPathTracerScene({ entities, camera, renderer, ptRenderer, ptSceneGenerator }) {
    const { visible, culled, total } = cullEntities(entities, camera);

    const group = new THREE.Group();
    for (const e of visible) group.add(entityToMesh(e));

    ptSceneGenerator.setObjects(group);
    const { bvh, geometry, materials, textures, iesTextures } = ptSceneGenerator.generate();
    const material = ptRenderer.material;

    if (!bvh || !geometry) {
        return { ok: false, culled, total };
    }

    material.bvh.updateFrom(bvh);
    material.attributesArray.updateFrom(
        geometry.attributes.normal, geometry.attributes.tangent,
        geometry.attributes.uv, geometry.attributes.color
    );
    material.materialIndexAttribute.updateFrom(geometry.attributes.materialIndex);

    // [최적화] 텍스처 집합이 이전과 동일하면 재업로드 생략 (가장 비용이 큰 단계 중 하나)
    if (!sameTextures(textures, lastTextureSet)) {
        material.textures.setTextures(renderer, textures, 1024, 1024);
        lastTextureSet = textures;
    }
    material.materials.updateFrom(materials, textures);
    material.lights.updateFrom([], iesTextures || []); // 조명은 하늘(env)이 담당

    return { ok: true, culled, total };
}
