// state.js
// ------------------------------------------------------------
// 데이터 지향 구조의 핵심: 모든 "씬 데이터"는 여기 plain object로만 존재한다.
// three.js Object3D, Mesh 등은 이 데이터로부터 매 빌드 시점에 "파생"되는
// 캐시일 뿐이며, 직접 들고 다니지 않는다 (entity.threeObj 같은 역참조 금지).
//
// 엔티티 스키마 (Entity):
// {
//   id: string,
//   type: 'box' | 'sphere',
//   transform: { position:[x,y,z], rotation:[x,y,z], scale:[x,y,z] },
//   material: { color, roughness, metalness, transmission?, ior?, thickness? },
//   pinned: boolean   // true면 프러스텀 컬링 대상에서 제외 (바닥 등)
// }
// ------------------------------------------------------------

let nextId = 1;
export function makeId(prefix = 'ent') {
    return `${prefix}_${nextId++}`;
}

// 전역 상태 (단일 소스: Single Source of Truth)
export const state = {
    entities: new Map(),     // id -> Entity
    selectedId: null,        // 현재 선택된 엔티티 id
    dirty: {
        geometry: true,      // BVH 재빌드 필요
        environment: true,   // 환경맵 재생성 필요
    },
    params: {
        // 렌더
        bounces: 6,
        maxSamples: 768,
        resolutionScale: 1.0,
        targetFPS: 30,
        filterGlossy: 0.5,
        exposure: 1.6,
        // 하늘/태양
        envIntensity: 2.0,
        skyZenith: '#5e9bd6',
        skyHorizon: '#e8f3ff',
        groundColor: '#4a4540',
        sunColor: '#fff4e0',
        sunAzimuth: 35,
        sunElevation: 55,
        sunSize: 4.0,
        sunIntensity: 40.0,
    },
};

export function addEntity(entity) {
    state.entities.set(entity.id, entity);
    state.dirty.geometry = true;
    return entity;
}

export function removeEntity(id) {
    state.entities.delete(id);
    if (state.selectedId === id) state.selectedId = null;
    state.dirty.geometry = true;
}

export function getEntity(id) {
    return state.entities.get(id);
}

export function allEntities() {
    return Array.from(state.entities.values());
}

// 엔티티 transform을 갱신하고 geometry dirty 플래그를 세움
// (TransformControls 드래그 중처럼 매 프레임 호출되는 경로에서는
//  markDirty=false로 호출해 BVH 재빌드를 미루고, drag 종료 시 true로 1회 호출)
export function setTransform(id, position, markDirty = true) {
    const e = state.entities.get(id);
    if (!e) return;
    e.transform.position = [position.x, position.y, position.z];
    if (markDirty) state.dirty.geometry = true;
}

export function markGeometryDirty() {
    state.dirty.geometry = true;
}

export function markEnvironmentDirty() {
    state.dirty.environment = true;
}

// 기본 데모 씬 데이터 생성
export function createDefaultEntities() {
    return [
        {
            id: makeId('floor'),
            type: 'box',
            transform: { position: [0, -0.1, 0], rotation: [0, 0, 0], scale: [40, 0.2, 40] },
            material: { color: 0xb8b8bc, roughness: 0.08, metalness: 0.0 },
            pinned: true, // 항상 BVH에 포함 (컬링 제외)
        },
        {
            id: makeId('mirror'),
            type: 'sphere',
            transform: { position: [-3.2, 1.3, 0], rotation: [0, 0, 0], scale: [1.3, 1.3, 1.3] },
            material: { color: 0xffffff, roughness: 0.02, metalness: 1.0 },
            pinned: false,
        },
        {
            id: makeId('gold'),
            type: 'sphere',
            transform: { position: [0, 1.3, -1.5], rotation: [0, 0, 0], scale: [1.3, 1.3, 1.3] },
            material: { color: 0xffc864, roughness: 0.18, metalness: 1.0 },
            pinned: false,
        },
        {
            id: makeId('glass'),
            type: 'sphere',
            transform: { position: [3.2, 1.3, 0], rotation: [0, 0, 0], scale: [1.3, 1.3, 1.3] },
            material: { color: 0xffffff, roughness: 0.0, metalness: 0.0, transmission: 1.0, ior: 1.5, thickness: 1.4 },
            pinned: false,
        },
        {
            id: makeId('box'),
            type: 'box',
            transform: { position: [1.4, 0.9, 2.6], rotation: [0, 0, 0], scale: [1.8, 1.8, 1.8] },
            material: { color: 0x2f9e8f, roughness: 0.55, metalness: 0.0 },
            pinned: false,
        },
    ];
}
