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

// 엔티티 데이터 1개 -> three.js Mesh (렌더용 임시 객체, dispose 불필요: geometry는 캐시 공유)
export function entityToMesh(entity) {
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

    const [px, py, pz] = entity.transform.position;
    const [rx, ry, rz] = entity.transform.rotation;
    const [sx, sy, sz] = entity.transform.scale;
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
    mesh.geometry = null; // 캐시 geometry는 dispose하지 않음
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
    material.textures.setTextures(renderer, textures, 1024, 1024);
    material.materials.updateFrom(materials, textures);
    material.lights.updateFrom([], iesTextures || []); // 조명은 하늘(env)이 담당

    return { ok: true, culled, total };
}
