// scenes.js
// ------------------------------------------------------------
// 1인칭 탐험용 장면 생성기.
// - 같은 머티리얼을 쓰는 삼각형은 하나의 BufferGeometry로 병합한다
//   (메시 수가 적을수록 BVH 생성과 래스터 미리보기 드로콜이 모두 빨라짐).
// - 결과는 'mesh' 타입 엔티티 목록 + 플레이어 충돌 박스 + 스폰/환경 프리셋.
// - 외벽 UV는 월드 미터 단위 (4열 x 4층 = 텍스처 1장)로 계산해 창문 크기가
//   건물 크기와 무관하게 일정하다.
// ------------------------------------------------------------
import * as THREE from 'three';
import { getTexture } from './textures.js?v=eb278d03';
import { makeId, createDefaultEntities } from './state.js?v=c93ac15a';
import { oceanSnapshotGeometry } from './ocean.js?v=9f673752';

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const lerp = (a, b, t) => a + (b - a) * t;

// 밀밭 경로 (scenes 내부 + 충돌/배치에서 공통 사용)
export const pathX = (z) => 4.0 * Math.sin(z * 0.035) + 1.5 * Math.sin(z * 0.011 + 1.0);

// ------------------------------------------------------------
// 지오메트리 빌더
// ------------------------------------------------------------
class GeoBuilder {
    constructor() {
        this.groups = new Map();
        this.colliders = [];
    }
    _g(mat) {
        let g = this.groups.get(mat);
        if (!g) { g = { p: [], n: [], uv: [], c: [] }; this.groups.set(mat, g); }
        return g;
    }
    // 삼각형 1개. n이 없으면 면 법선, uv가 없으면 (0,0), col은 버텍스 컬러
    tri(mat, a, b, c, n = null, uv = null, col = null) {
        const g = this._g(mat);
        g.p.push(...a, ...b, ...c);
        if (!n) {
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const l = Math.hypot(nx, ny, nz) || 1;
            const f = [nx / l, ny / l, nz / l];
            n = [f, f, f];
        }
        g.n.push(...n[0], ...n[1], ...n[2]);
        if (uv) g.uv.push(...uv[0], ...uv[1], ...uv[2]); else g.uv.push(0, 0, 0, 0, 0, 0);
        if (col) g.c.push(...col[0], ...col[1], ...col[2]); else g.c.push(1, 1, 1, 1, 1, 1, 1, 1, 1);
    }
    quad(mat, a, b, c, d, uv = null, col = null) {
        this.tri(mat, a, b, c, null, uv && [uv[0], uv[1], uv[2]], col && [col[0], col[1], col[2]]);
        this.tri(mat, a, c, d, null, uv && [uv[0], uv[2], uv[3]], col && [col[0], col[2], col[3]]);
    }
    // 축 정렬 박스. o.side/o.top: 머티리얼, o.tile: [가로 m, 세로 m] (외벽 UV), o.v0: UV 세로 시작 높이
    box(x0, y0, z0, x1, y1, z1, o) {
        const side = o.side, top = o.top ?? o.side;
        const [tw, th] = o.tile ?? [1, 1];
        const vb = o.v0 ?? y0;
        const V = (y) => (y - vb) / th;
        const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1];
        const E = [x0, y1, z0], F = [x1, y1, z0], G = [x1, y1, z1], H = [x0, y1, z1];
        const tt = o.topTile ?? tw;
        if (top) this.quad(top, E, H, G, F, [[x0 / tt, -z0 / tt], [x0 / tt, -z1 / tt], [x1 / tt, -z1 / tt], [x1 / tt, -z0 / tt]]);
        if (side) {
            const wx = (x1 - x0) / tw, wz = (z1 - z0) / tw;
            // -z 면
            this.quad(side, A, E, F, B, [[wx, V(y0)], [wx, V(y1)], [0, V(y1)], [0, V(y0)]]);
            // +z 면
            this.quad(side, C, G, H, D, [[wx, V(y0)], [wx, V(y1)], [0, V(y1)], [0, V(y0)]]);
            // -x 면
            this.quad(side, D, H, E, A, [[wz, V(y0)], [wz, V(y1)], [0, V(y1)], [0, V(y0)]]);
            // +x 면
            this.quad(side, B, F, G, C, [[wz, V(y0)], [wz, V(y1)], [0, V(y1)], [0, V(y0)]]);
        }
        if (o.collide) this.colliders.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
    }
    // 임의 방향 박스 (중심 + 반축 벡터 3개)
    obox(mat, c, ax, ay, az) {
        const p = (sx, sy, sz) => [0, 1, 2].map((k) => c[k] + ax[k] * sx + ay[k] * sy + az[k] * sz);
        const A = p(-1, -1, -1), B = p(1, -1, -1), C = p(1, -1, 1), D = p(-1, -1, 1);
        const E = p(-1, 1, -1), F = p(1, 1, -1), G = p(1, 1, 1), H = p(-1, 1, 1);
        this.quad(mat, E, H, G, F); this.quad(mat, A, B, C, D);
        this.quad(mat, A, E, F, B); this.quad(mat, C, G, H, D);
        this.quad(mat, D, H, E, A); this.quad(mat, B, F, G, C);
    }
    // p0 -> p1 원기둥/원뿔 (부드러운 법선)
    cylinder(mat, p0, p1, r0, r1, seg = 8, caps = true) {
        const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const L = Math.hypot(...ax); const w = ax.map((v) => v / L);
        const t = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let u = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]];
        const ul = Math.hypot(...u); u = u.map((v) => v / ul);
        const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
        const dir = (a) => [0, 1, 2].map((k) => u[k] * Math.cos(a) + v[k] * Math.sin(a));
        const ring = (p, r, a) => { const d = dir(a); return [p[0] + d[0] * r, p[1] + d[1] * r, p[2] + d[2] * r]; };
        const nw = w.map((x) => -x);
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
            const A = ring(p0, r0, a0), B = ring(p0, r0, a1), C = ring(p1, r1, a1), D = ring(p1, r1, a0);
            const n0 = dir(a0), n1 = dir(a1);
            this.tri(mat, A, B, C, [n0, n1, n1]);
            if (r1 > 0) this.tri(mat, A, C, D, [n0, n1, n0]);
            if (caps) {
                if (r1 > 0) this.tri(mat, p1, D, C, [w, w, w]);
                if (r0 > 0) this.tri(mat, p0, B, A, [nw, nw, nw]);
            }
        }
    }
    // 위경도 구 (flat=true면 로우폴리, jitter로 울퉁불퉁한 나무 수관)
    sphere(mat, c, r, ws = 12, hs = 8, sy = 1, jitter = 0, rng = null, flat = false) {
        const pts = [];
        for (let j = 0; j <= hs; j++) {
            const row = [];
            for (let i = 0; i <= ws; i++) {
                const th = (j / hs) * Math.PI, ph = ((i % ws) / ws) * Math.PI * 2;
                const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
                let rr = r;
                if (jitter && j > 0 && j < hs) rr *= 1 + (rng() - 0.5) * jitter;
                row.push({ p: [c[0] + n[0] * rr, c[1] + n[1] * rr * sy, c[2] + n[2] * rr], n });
            }
            row[ws] = row[0];
            pts.push(row);
        }
        for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
            const a = pts[j][i], b = pts[j][i + 1], cc = pts[j + 1][i + 1], d = pts[j + 1][i];
            if (j > 0) this.tri(mat, a.p, b.p, cc.p, flat ? null : [a.n, b.n, cc.n]);
            if (j < hs - 1) this.tri(mat, a.p, cc.p, d.p, flat ? null : [a.n, cc.n, d.n]);
        }
    }
    // 바닥 타일 (큰 삼각형 하나보다 BVH 품질이 좋다). uvScale: 텍스처 1장당 m
    ground(mat, x0, z0, x1, z1, n, y = 0, uvScale = 1) {
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const ax = lerp(x0, x1, i / n), bx = lerp(x0, x1, (i + 1) / n);
            const az = lerp(z0, z1, j / n), bz = lerp(z0, z1, (j + 1) / n);
            const U = (x, z) => [x / uvScale, -z / uvScale];
            this.quad(mat, [ax, y, az], [ax, y, bz], [bx, y, bz], [bx, y, az], [U(ax, az), U(ax, bz), U(bx, bz), U(bx, az)]);
        }
    }
    toEntities() {
        const out = [];
        for (const [mat, g] of this.groups) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
            if (mat.vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            const mesh = new THREE.Mesh(geo, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            out.push({
                id: makeId('mesh'), type: 'mesh', mesh,
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                material: {}, pinned: true,
            });
        }
        return out;
    }
}

// ------------------------------------------------------------
// 머티리얼 헬퍼
//   userData.night: 밤에만 켜지는 발광 (emissiveIntensity = day + night * k)
// ------------------------------------------------------------
function std(o) {
    const m = new THREE.MeshStandardMaterial({
        color: o.color ?? 0xcccccc, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0,
        map: o.map ?? null, roughnessMap: o.rm ?? null, metalnessMap: o.rm ?? null,
        emissive: o.emissive ?? 0x000000, emissiveMap: o.emissiveMap ?? null, emissiveIntensity: o.emissiveIntensity ?? 1,
        vertexColors: o.vertexColors ?? false, side: THREE.DoubleSide,
    });
    if (o.night) m.userData.night = o.night;
    return m;
}

// 시간대(night 0..1)에 맞춰 발광 세기 조정. 변경 여부 반환.
export function applyNightToMaterials(materials, night) {
    let changed = false;
    for (const m of materials) {
        const n = m.userData && m.userData.night;
        if (!n) continue;
        const v = n.day + night * n.k;
        if (Math.abs(m.emissiveIntensity - v) > 1e-4) { m.emissiveIntensity = v; changed = true; }
    }
    return changed;
}

// ------------------------------------------------------------
// Scene 1: 맨해튼풍 애비뉴
// ------------------------------------------------------------
function buildCity(q) {
    const S = q.textureSize;
    const gb = new GeoBuilder();
    const rng = mulberry32(1234);
    const P = 90, ROAD = 9, SIDE = 14, CROSS = 7;

    const asphalt = getTexture('asphalt', S);
    const prewar = getTexture('prewar', S);
    const glass = getTexture('glass', S);
    const store = getTexture('store', S);

    const mAsphalt = std({ map: asphalt.map, rm: asphalt.rm, roughness: 1, metalness: 1 });
    const mAvenue = std({ map: getTexture('avenue', S), rm: asphalt.rm, roughness: 1, metalness: 1 });
    const mCross = std({ map: getTexture('crosswalk', S), roughness: 0.75 });
    const mWalk = std({ map: getTexture('sidewalk', S), roughness: 0.85 });
    const mRoof = std({ color: 0x3a3836, roughness: 0.9 });
    const mCornice = std({ color: 0xb8ad9c, roughness: 0.75 });
    const mPole = std({ color: 0x1a1d1e, roughness: 0.45, metalness: 0.7 });
    const mLamp = std({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0.4, night: { day: 0.4, k: 7 } });
    const mTrunk = std({ color: 0x3a2a1c, roughness: 0.95 });
    const mLeaf = std({ color: 0x3f6a24, roughness: 0.85 });
    const mTire = std({ color: 0x111111, roughness: 0.7 });
    const mCarGlass = std({ color: 0x0c0f12, roughness: 0.05, metalness: 0.7 });
    const mCab = std({ color: 0xf0b414, roughness: 0.3, metalness: 0.15 });
    const carPaints = [0x101012, 0x9a9ca0, 0x7a0e0c, 0xd8d8d8, 0x112244].map((c) => std({ color: c, roughness: 0.28, metalness: 0.35 }));
    const mRed = std({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 1.5, night: { day: 1.5, k: 2 } });
    const mGreen = std({ color: 0x20ff70, emissive: 0x20ff70, emissiveIntensity: 1.2, night: { day: 1.2, k: 2 } });
    const mHead = std({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.6, night: { day: 0.6, k: 5 } });
    const mTank = std({ color: 0x4a3524, roughness: 0.9 });

    // 외벽 머티리얼 팔레트 (같은 텍스처, 색만 다르게 → 텍스처 배열 크기 절약)
    const brickCols = [0x8a4a34, 0xb08a6a, 0xcfc4b0, 0x8e8a86, 0xd8c8a8, 0x6e4c3e, 0xa7a29a];
    const glassCols = [0x9ec4e6, 0x9fd8cc, 0xd0d4dc, 0xd6b890, 0x8aa0c8];
    const nightWin = { day: 0, k: 1.6 };
    const prewarMats = brickCols.map((c) => std({ color: c, map: prewar.map, rm: prewar.rm, roughness: 1, metalness: 1, emissive: 0xffffff, emissiveMap: prewar.emissive, emissiveIntensity: 0, night: nightWin }));
    const glassMats = glassCols.map((c) => std({ color: c, map: glass.map, rm: glass.rm, roughness: 1, metalness: 1, emissive: 0xffffff, emissiveMap: glass.emissive, emissiveIntensity: 0, night: nightWin }));
    const decoMat = std({ color: 0xcfc6b4, map: prewar.map, rm: prewar.rm, roughness: 1, metalness: 1, emissive: 0xffffff, emissiveMap: prewar.emissive, emissiveIntensity: 0, night: nightWin });
    const storeMat = std({ color: 0xffffff, map: store.map, rm: store.rm, roughness: 1, metalness: 1, emissive: 0xffffff, emissiveMap: store.emissive, emissiveIntensity: 0.25, night: { day: 0.25, k: 1.6 } });
    const pick = (arr) => arr[(rng() * arr.length) | 0];

    // 텍스처 1장 = 4열 x 4층
    const PREWAR_TILE = [4 * 2.0, 4 * 3.4];
    const GLASS_TILE = [4 * 1.6, 4 * 3.8];
    const STORE_H = 4.6;

    // ---- 바닥 ----
    gb.ground(mAsphalt, -1200, -1200, 1200, 1200, 16, -0.01, 12);

    function waterTower(cx, cy, cz) {
        const r = 2.0 + rng() * 0.6, h = 3.5 + rng() * 1.5, leg = 3.0;
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = cx + dx * r * 0.6, z = cz + dz * r * 0.6;
            gb.box(x - 0.12, cy, z - 0.12, x + 0.12, cy + leg, z + 0.12, { side: mPole });
        }
        gb.cylinder(mTank, [cx, cy + leg, cz], [cx, cy + leg + h, cz], r, r, 10, true);
        gb.cylinder(mTank, [cx, cy + leg + h, cz], [cx, cy + leg + h + 1.6, cz], r * 1.05, 0, 10, false);
    }

    // 셋백 + 코니스 + 1층 상점이 있는 건물
    function building(x0, z0, x1, z1, h, style, frontStore) {
        const isGlass = style === 'glass';
        const fm = style === 'deco' ? decoMat : isGlass ? pick(glassMats) : pick(prewarMats);
        const tile = isGlass ? GLASS_TILE : PREWAR_TILE;
        let base = 0;
        if (frontStore && !isGlass) {
            gb.box(x0, 0, z0, x1, STORE_H, z1, { side: storeMat, top: null, tile: [8, STORE_H], collide: true });
            gb.box(x0 - 0.3, STORE_H, z0 - 0.3, x1 + 0.3, STORE_H + 0.35, z1 + 0.3, { side: mCornice });
            base = STORE_H;
        } else {
            gb.colliders.push({ min: [x0, 0, z0], max: [x1, h, z1] });
        }
        if (isGlass) {
            gb.box(x0, base, z0, x1, h, z1, { side: fm, top: mRoof, tile, v0: 0 });
            if (rng() < 0.6) gb.box(x0 + 2, h, z0 + 2, x1 - 2, h + 4 + rng() * 6, z1 - 2, { side: fm, top: mRoof, tile, v0: 0 });
            return;
        }
        let y = base, bx0 = x0, bx1 = x1, bz0 = z0, bz1 = z1;
        const tiers = h > 70 ? 3 : h > 40 ? 2 : 1;
        for (let t = 0; t < tiers; t++) {
            const top = t === tiers - 1 ? h : y + (h - y) * (0.45 + rng() * 0.2);
            gb.box(bx0, y, bz0, bx1, top, bz1, { side: fm, top: mRoof, tile, v0: 0 });
            gb.box(bx0 - 0.35, top - 0.7, bz0 - 0.35, bx1 + 0.35, top, bz1 + 0.35, { side: mCornice });
            y = top;
            const ix = Math.min((bx1 - bx0) * 0.18, 3 + rng() * 2), iz = Math.min((bz1 - bz0) * 0.18, 3 + rng() * 2);
            bx0 += ix; bx1 -= ix; bz0 += iz; bz1 -= iz;
        }
        if (h < 80 && rng() < 0.5) waterTower(lerp(bx0, bx1, 0.3 + rng() * 0.4), h, lerp(bz0, bz1, 0.3 + rng() * 0.4));
    }

    // 랜드마크: 아르데코 첨탑 빌딩
    function landmark(x0, z0, x1, z1) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        gb.box(x0, 0, z0, x1, STORE_H, z1, { side: storeMat, top: null, tile: [8, STORE_H], collide: true });
        gb.box(x0, STORE_H, z0, x1, 26, z1, { side: decoMat, top: mRoof, tile: PREWAR_TILE, v0: 0 });
        gb.box(x0 - 0.4, 25.3, z0 - 0.4, x1 + 0.4, 26, z1 + 0.4, { side: mCornice });
        const W = x1 - x0, D = z1 - z0;
        for (const [s, y0, y1] of [[0.36, 26, 82], [0.28, 82, 248], [0.22, 248, 268], [0.16, 268, 290], [0.11, 290, 304]]) {
            gb.box(cx - W * s, y0, cz - D * s, cx + W * s, y1, cz + D * s, { side: decoMat, top: mRoof, tile: PREWAR_TILE, v0: 0 });
            gb.box(cx - W * s - 0.3, y1 - 0.8, cz - D * s - 0.3, cx + W * s + 0.3, y1, cz + D * s + 0.3, { side: mCornice });
        }
        gb.cylinder(mCornice, [cx, 304, cz], [cx, 332, cz], 3.2, 2.2, 12, true);
        gb.cylinder(mPole, [cx, 332, cz], [cx, 372, cz], 0.9, 0.25, 6, true);
        gb.sphere(mRed, [cx, 373, cz], 0.7, 6, 4);
    }

    function streetLight(x, z, s) {
        gb.cylinder(mPole, [x, 0.15, z], [x, 8, z], 0.1, 0.08, 6, false);
        gb.colliders.push({ min: [x - 0.15, 0, z - 0.15], max: [x + 0.15, 8, z + 0.15] });
        const lx = x - s * 2.6;
        gb.box(Math.min(x, lx), 7.85, z - 0.06, Math.max(x, lx), 8.0, z + 0.06, { side: mPole });
        gb.box(lx - 0.35, 7.7, z - 0.2, lx + 0.35, 7.95, z + 0.2, { side: mPole });
        gb.box(lx - 0.3, 7.62, z - 0.16, lx + 0.3, 7.7, z + 0.16, { side: mLamp });
    }

    function tree(x, z) {
        const h = 2.6 + rng() * 1.0;
        gb.cylinder(mTrunk, [x, 0.15, z], [x, h + 1.2, z], 0.16, 0.1, 5, false);
        gb.colliders.push({ min: [x - 0.25, 0, z - 0.25], max: [x + 0.25, 4, z + 0.25] });
        const r = 1.8 + rng() * 0.8;
        gb.sphere(mLeaf, [x, h + r * 0.7, z], r, 7, 5, 0.85, 0.35, rng, true);
    }

    function car(x, z, dir) {
        const cab = rng() < 0.45;
        const paint = cab ? mCab : pick(carPaints);
        const L = 4.6, W = 1.85, z0 = z - L / 2, z1 = z + L / 2;
        gb.box(x - W / 2, 0.32, z0, x + W / 2, 1.0, z1, { side: paint, collide: true });
        const cf = dir > 0 ? 0.25 : -0.25;
        gb.box(x - W / 2 + 0.08, 1.0, z - 1.25 + cf, x + W / 2 - 0.08, 1.55, z + 1.15 + cf, { side: mCarGlass, top: paint });
        if (cab) gb.box(x - 0.35, 1.55, z - 0.15 + cf, x + 0.35, 1.85, z + 0.15 + cf, { side: mHead });
        for (const wz of [z0 + 0.85, z1 - 0.85]) for (const wx of [-1, 1]) {
            const px = x + wx * (W / 2 - 0.05);
            gb.cylinder(mTire, [px - 0.13, 0.34, wz], [px + 0.13, 0.34, wz], 0.34, 0.34, 6, true);
        }
        const back = dir > 0 ? z0 : z1, front = dir > 0 ? z1 : z0;
        gb.box(x - W / 2 + 0.1, 0.75, back - 0.03, x - W / 2 + 0.45, 0.9, back + 0.03, { side: mRed });
        gb.box(x + W / 2 - 0.45, 0.75, back - 0.03, x + W / 2 - 0.1, 0.9, back + 0.03, { side: mRed });
        gb.box(x - W / 2 + 0.1, 0.7, front - 0.03, x - W / 2 + 0.45, 0.85, front + 0.03, { side: mHead });
        gb.box(x + W / 2 - 0.45, 0.7, front - 0.03, x + W / 2 - 0.1, 0.85, front + 0.03, { side: mHead });
    }

    function signal(x, z, s) {
        gb.cylinder(mPole, [x, 0.15, z], [x, 5.8, z], 0.09, 0.09, 6, false);
        gb.box(Math.min(x, x - s * 3.5), 5.6, z - 0.07, Math.max(x, x - s * 3.5), 5.75, z + 0.07, { side: mPole });
        const hx = x - s * 3.2;
        gb.box(hx - 0.2, 4.6, z - 0.2, hx + 0.2, 5.6, z + 0.2, { side: mPole });
        gb.box(hx - 0.12, 5.25, z - 0.23, hx + 0.12, 5.45, z - 0.2, { side: rng() < 0.5 ? mRed : mGreen });
        gb.colliders.push({ min: [x - 0.15, 0, z - 0.15], max: [x + 0.15, 6, z + 0.15] });
    }

    const KMIN = -2, KMAX = q.low ? 5 : 7;
    for (let k = KMIN; k < KMAX; k++) {
        const bz0 = k * P + CROSS, bz1 = (k + 1) * P - CROSS;
        // 애비뉴 노면 (차선 텍스처: u = 폭 18m, v = 9m 반복)
        const zA = bz0, zB = bz1;
        gb.quad(mAvenue, [-ROAD, 0, zA], [-ROAD, 0, zB], [ROAD, 0, zB], [ROAD, 0, zA],
            [[0, zA / 9], [0, zB / 9], [1, zB / 9], [1, zA / 9]]);
        // 횡단보도 (교차로 양쪽)
        for (const [c0, c1] of [[bz0 - 3.5, bz0], [bz1, bz1 + 3.5]]) {
            gb.quad(mCross, [-ROAD, 0.002, c0], [-ROAD, 0.002, c1], [ROAD, 0.002, c1], [ROAD, 0.002, c0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        }
        for (const s of [-1, 1]) {
            const xa = s * ROAD, xb = s * 150;
            gb.box(Math.min(xa, xb), 0, bz0, Math.max(xa, xb), 0.15, bz1, { side: mWalk, tile: [6, 6], topTile: 6 });
            gb.colliders.push({ min: [Math.min(xa, xb), 0, bz0], max: [Math.max(xa, xb), 0.15, bz1] });

            if (k === 3 && s === 1) {
                landmark(SIDE + 2, bz0 + 5, SIDE + 62, bz1 - 5);
            } else {
                // 앞줄: 애비뉴를 따라 필지 분할 (폭은 창문 간격의 배수로 맞춤)
                let z = bz0 + 4;
                while (z < bz1 - 10) {
                    const style = rng() < 0.3 ? 'glass' : 'prewar';
                    const col = style === 'glass' ? 1.6 : 2.0;
                    let w = Math.min(bz1 - 4 - z, 12 + rng() * 18);
                    w = Math.max(col * 3, Math.floor(w / col) * col);
                    const depth = Math.round((20 + rng() * 18) / col) * col;
                    const h = style === 'glass' ? 70 + Math.pow(rng(), 1.5) * 170 : 22 + Math.pow(rng(), 1.8) * 110;
                    const xi = SIDE, xo = xi + depth;
                    building(s > 0 ? xi : -xo, z, s > 0 ? xo : -xi, z + w - 0.3, h, style, true);
                    z += w;
                }
            }
            // 뒷줄 (교차로에서 보이는 스카이라인)
            let z2 = bz0 + 4;
            while (z2 < bz1 - 10) {
                const w = Math.min(bz1 - 4 - z2, 20 + rng() * 20);
                const xi = 58 + rng() * 6, xo = xi + 30 + rng() * 40;
                const style = rng() < 0.45 ? 'glass' : 'prewar';
                const h = 40 + Math.pow(rng(), 1.6) * 200;
                building(s > 0 ? xi : -xo, z2, s > 0 ? xo : -xi, z2 + w - 0.5, h, style, false);
                z2 += w;
            }
            for (let zz = bz0 + 8; zz < bz1 - 4; zz += 26) streetLight(s * (ROAD + 0.6), zz, s);
            for (let zz = bz0 + 20; zz < bz1 - 8; zz += 26) if (rng() < 0.8) tree(s * (ROAD + 2.4), zz);
            signal(s * (ROAD + 0.7), bz0 + 1.2, s);
        }
        for (const lane of [-6.75, -2.25, 2.25, 6.75]) {
            const dir = lane > 0 ? 1 : -1;
            let z = bz0 + 2 + rng() * 8;
            while (z < bz1 - 6) {
                if (rng() < (q.low ? 0.35 : 0.55)) car(lane + (rng() - 0.5) * 0.4, z + 2.3, dir);
                z += 7 + rng() * 9;
            }
        }
    }
    // 원경 빌딩 (도시 경계 너머)
    const filler = q.low ? 120 : 220;
    for (let i = 0; i < filler; i++) {
        const x = (rng() - 0.5) * 1400, z = (rng() - 0.5) * 1700 + 200;
        if (Math.abs(x) < 160 && z > KMIN * P - 20 && z < KMAX * P + 20) continue;
        const w = 20 + rng() * 40, d = 20 + rng() * 40, h = 30 + Math.pow(rng(), 1.5) * 220;
        const isGlass = rng() < 0.4;
        gb.box(x, 0, z, x + w, h, z + d, { side: isGlass ? pick(glassMats) : pick(prewarMats), top: mRoof, tile: isGlass ? GLASS_TILE : PREWAR_TILE, v0: 0 });
    }

    return {
        entities: gb.toEntities(), colliders: gb.colliders,
        spawn: { pos: [0, 1.7, -14], yaw: Math.PI, pitch: 0.08 },
        env: { sunAzimuth: 182, sunElevation: 58, sunSize: 3, exposure: 1.25 },
    };
}

// ------------------------------------------------------------
// Scene 2: 황금 밀밭
//   - 밀밭 "윗면"은 이삭 텍스처를 입힌 평면(캐노피, 높이 0.72m),
//     길가 단면은 줄기 텍스처 벽 → 아주 적은 삼각형으로 빽빽한 밀밭 표현
//   - 길 주변에만 이삭 다발(가는 교차 사각형)을 흩뿌려 입체감 추가
// ------------------------------------------------------------
function buildWheat(q) {
    const S = q.textureSize;
    const gb = new GeoBuilder();
    const rng = mulberry32(77);
    const CAN = 0.72, PW = 1.5;
    const mGround = std({ map: getTexture('soil', S), roughness: 0.95 });
    const mDirt = std({ map: getTexture('dirt', S), roughness: 0.95 });
    const mTop = std({ map: getTexture('wheatTop', S), roughness: 0.85 });
    const mSide = std({ map: getTexture('wheatSide', S), roughness: 0.85 });
    const mTuft = std({ map: getTexture('wheatTuft', S), roughness: 0.75 });
    const mBarn = std({ color: 0x8a1e12, roughness: 0.85 });
    const mTrim = std({ color: 0xe6e2d8, roughness: 0.7 });
    const mRoofM = std({ color: 0x3b3d40, roughness: 0.45, metalness: 0.6 });
    const mSilo = std({ color: 0xb4b8bc, roughness: 0.35, metalness: 0.8 });
    const mTrunk = std({ color: 0x3b2a1a, roughness: 0.95 });
    const mLeaf = std({ color: 0x3a5a1c, roughness: 0.85 });
    const mHill = std({ color: 0x55682a, roughness: 0.95 });
    const mWood = std({ color: 0x7a5e44, roughness: 0.9 });
    const mHay = std({ color: 0xd2ad5c, roughness: 0.95 });
    const mHouse = std({ color: 0xe8e4da, roughness: 0.8 });
    const mWin = std({ color: 0x20262c, roughness: 0.08, metalness: 0.6, emissive: 0xffc070, emissiveIntensity: 0, night: { day: 0, k: 2.5 } });

    gb.ground(mGround, -1200, -1200, 1200, 1200, 16, 0, 8);

    // 헛간/농가 마당 (밀이 없는 영역)
    const BX = 26, BZ = 42;
    const yard = { x0: 10, x1: 48, z0: 24, z1: 72 };
    const inYard = (x, z) => x > yard.x0 && x < yard.x1 && z > yard.z0 && z < yard.z1;

    // 캐노피 + 길가 단면
    const F0 = -220, F1 = 220, DZ = 2;
    for (let z = F0; z < F1; z += DZ) {
        const z1 = z + DZ;
        const pa = pathX(z), pb = pathX(z1);
        const spans = [[F0, pa - PW, F0, pb - PW], [pa + PW, F1, pb + PW, F1]];
        for (const [xa0, xa1, xb0, xb1] of spans) {
            // 마당과 겹치면 오른쪽 구간을 둘로 나눔
            const pieces = (z1 > yard.z0 && z < yard.z1 && xa1 > yard.x0)
                ? [[xa0, Math.max(xa0, yard.x0), xb0, Math.max(xb0, yard.x0)], [yard.x1, xa1, yard.x1, xb1]]
                : [[xa0, xa1, xb0, xb1]];
            for (const [a0, a1, b0, b1] of pieces) {
                if (a1 - a0 < 0.1) continue;
                const U = (x, zz) => [x / 4, -zz / 4];
                gb.quad(mTop, [a0, CAN, z], [b0, CAN, z1], [b1, CAN, z1], [a1, CAN, z], [U(a0, z), U(b0, z1), U(b1, z1), U(a1, z)]);
            }
        }
        // 길가 단면 (양쪽)
        for (const side of [-1, 1]) {
            const xa = pa + side * PW, xb = pb + side * PW;
            const uvs = [[z / 3, 0], [z1 / 3, 0], [z1 / 3, 1], [z / 3, 1]];
            if (side < 0) gb.quad(mSide, [xa, 0, z], [xb, 0, z1], [xb, CAN + 0.02, z1], [xa, CAN + 0.02, z], uvs);
            else gb.quad(mSide, [xb, 0, z1], [xa, 0, z], [xa, CAN + 0.02, z], [xb, CAN + 0.02, z1], [uvs[1], uvs[0], uvs[3], uvs[2]]);
        }
        // 흙길
        gb.quad(mDirt, [pa - PW, 0.01, z], [pb - PW, 0.01, z1], [pb + PW, 0.01, z1], [pa + PW, 0.01, z], [[0, z / 3], [0, z1 / 3], [1, z1 / 3], [1, z / 3]]);
    }
    // 마당 가장자리 단면
    for (const [a, b] of [[[yard.x0, yard.z0], [yard.x1, yard.z0]], [[yard.x1, yard.z1], [yard.x0, yard.z1]], [[yard.x0, yard.z1], [yard.x0, yard.z0]]]) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3;
        gb.quad(mSide, [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], CAN + 0.02, b[1]], [a[0], CAN + 0.02, a[1]], [[0, 0], [L, 0], [L, 1], [0, 1]]);
    }

    // 이삭 다발: 길 주변 띠에만 (멀리서는 캐노피 텍스처가 담당)
    // 위로 갈수록 넓어지는 가는 사각형 1장(삼각형 2개) = 줄기 + 이삭
    const tufts = q.low ? 6000 : 20000;
    for (let i = 0; i < tufts; i++) {
        const z = -70 + rng() * 170;
        const side = rng() < 0.5 ? -1 : 1;
        const off = PW + 0.05 + Math.pow(rng(), 1.7) * 9;
        const x = pathX(z) + side * off;
        if (inYard(x, z)) continue;
        const h = 0.92 + rng() * 0.3, a = rng() * Math.PI;
        const wb = 0.008, wt = 0.022 + rng() * 0.012;
        const dx = Math.cos(a), dz = Math.sin(a);
        const lx = (rng() - 0.5) * 0.14, lz = (rng() - 0.5) * 0.14;
        const u0 = ((rng() * 8) | 0) / 8 + 0.02, u1 = u0 + 0.1;
        const yb = CAN - 0.2;
        gb.quad(mTuft,
            [x - dx * wb, yb, z - dz * wb], [x + dx * wb, yb, z + dz * wb],
            [x + dx * wt + lx, h, z + dz * wt + lz], [x - dx * wt + lx, h, z - dz * wt + lz],
            [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
    }

    // 박공 지붕 건물
    function gable(x0, z0, x1, z1, wallH, roofH, mWall) {
        gb.box(x0, 0, z0, x1, wallH, z1, { side: mWall, top: null, collide: true });
        const cx = (x0 + x1) / 2, o = 0.5;
        const A = [x0 - o, wallH - 0.2, z0 - o], B = [x1 + o, wallH - 0.2, z0 - o], C = [x1 + o, wallH - 0.2, z1 + o], D = [x0 - o, wallH - 0.2, z1 + o];
        const R0 = [cx, wallH + roofH, z0 - o], R1 = [cx, wallH + roofH, z1 + o];
        gb.quad(mRoofM, A, R0, R1, D); gb.quad(mRoofM, B, C, R1, R0);
        gb.tri(mWall, [x0, wallH, z0], [x1, wallH, z0], [cx, wallH + roofH - 0.3, z0]);
        gb.tri(mWall, [x1, wallH, z1], [x0, wallH, z1], [cx, wallH + roofH - 0.3, z1]);
    }
    gable(BX - 7, BZ - 10, BX + 7, BZ + 10, 6.5, 4.5, mBarn);
    const dz = BZ - 10 - 0.08;
    gb.box(BX - 2.6, 0, dz - 0.1, BX + 2.6, 0.25, dz, { side: mTrim });
    gb.box(BX - 2.6, 4.2, dz - 0.1, BX + 2.6, 4.45, dz, { side: mTrim });
    gb.box(BX - 2.6, 0, dz - 0.1, BX - 2.35, 4.45, dz, { side: mTrim });
    gb.box(BX + 2.35, 0, dz - 0.1, BX + 2.6, 4.45, dz, { side: mTrim });
    const dl = Math.hypot(5, 4.2);
    for (const sg of [-1, 1]) gb.obox(mTrim, [BX, 2.22, dz - 0.07], [sg * 5 / dl * 2.5, 4.2 / dl * 2.5, 0], [-4.2 / dl * 0.12 * sg, 5 / dl * 0.12, 0], [0, 0, 0.04]);
    for (const cx of [BX - 7, BX + 7]) for (const cz of [BZ - 10, BZ + 10]) gb.box(cx - 0.2, 0, cz - 0.2, cx + 0.2, 6.6, cz + 0.2, { side: mTrim });
    gb.cylinder(mSilo, [BX + 11, 0, BZ + 4], [BX + 11, 15, BZ + 4], 3.2, 3.2, 16, false);
    gb.colliders.push({ min: [BX + 8, 0, BZ + 1], max: [BX + 14, 15, BZ + 7] });
    gb.sphere(mSilo, [BX + 11, 15, BZ + 4], 3.2, 16, 8, 0.6);
    gable(BX - 2, BZ + 16, BX + 9, BZ + 25, 5.0, 3.2, mHouse);
    for (const wx of [BX - 0.5, BX + 3, BX + 6.5]) gb.box(wx, 1.4, BZ + 15.92, wx + 1.4, 3.0, BZ + 16, { side: mWin });
    for (let i = 0; i < 7; i++) {
        const x = BX - 12 + rng() * 5, z = BZ - 12 + i * 3.2 + rng();
        gb.cylinder(mHay, [x - 0.65, 0.8, z], [x + 0.65, 0.8, z], 0.8, 0.8, 10, true);
        gb.colliders.push({ min: [x - 0.7, 0, z - 0.8], max: [x + 0.7, 1.6, z + 0.8] });
    }
    // 큰 나무
    const TX = -9, TZ = 18;
    gb.cylinder(mTrunk, [TX, 0, TZ], [TX, 6, TZ], 0.55, 0.32, 8, false);
    gb.colliders.push({ min: [TX - 0.6, 0, TZ - 0.6], max: [TX + 0.6, 6, TZ + 0.6] });
    gb.cylinder(mTrunk, [TX, 4.5, TZ], [TX + 2.5, 7.5, TZ + 1], 0.25, 0.15, 5, false);
    gb.cylinder(mTrunk, [TX, 5, TZ], [TX - 2, 8, TZ - 1.5], 0.25, 0.15, 5, false);
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng(), rr = i === 0 ? 0 : 2.6;
        gb.sphere(mLeaf, [TX + Math.cos(a) * rr, 8.5 + rng() * 2, TZ + Math.sin(a) * rr], 2.8 + rng() * 1.2, 8, 6, 0.8, 0.3, rng, true);
    }
    // 길가 울타리
    for (let z = -60; z < 80; z += 3.2) {
        const z2 = z + 3.2;
        for (const side of [-1, 1]) {
            const x = pathX(z) + side * (PW + 0.15), xx = pathX(z2) + side * (PW + 0.15);
            gb.box(x - 0.07, 0, z - 0.07, x + 0.07, 1.15, z + 0.07, { side: mWood });
            gb.obox(mWood, [(x + xx) / 2, 0.85, (z + z2) / 2], [(xx - x) / 2, 0, (z2 - z) / 2], [0, 0.05, 0], [0.03, 0, 0]);
        }
    }
    // 먼 언덕 (링 메시, 부드러운 법선)
    const NA = q.low ? 64 : 110, NR = 8, R0 = 380, R1 = 1150;
    const hill = (a, r) => {
        const t = (r - R0) / (R1 - R0);
        const n = Math.sin(a * 3 + 1.3) * 0.5 + Math.sin(a * 7.1 + 0.4) * 0.3 + Math.sin(a * 13.7 + 2.0) * 0.2;
        return Math.max(0, Math.sin(t * Math.PI) * (55 + 60 * n) * Math.min(1, t * 4));
    };
    const hp = [];
    for (let j = 0; j <= NR; j++) {
        const row = [];
        for (let i = 0; i <= NA; i++) {
            const a = (i / NA) * Math.PI * 2, r = lerp(R0, R1, j / NR);
            row.push([Math.cos(a) * r, hill(a, r) - 0.5, Math.sin(a) * r]);
        }
        hp.push(row);
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) gb.quad(mHill, hp[j][i], hp[j][i + 1], hp[j + 1][i + 1], hp[j + 1][i]);
    // 원경 나무 군락
    for (let i = 0; i < (q.low ? 50 : 100); i++) {
        const a = rng() * Math.PI * 2, r = 230 + rng() * 140;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.8 + rng() * 0.9;
        gb.cylinder(mTrunk, [x, 0, z], [x, 4 * s, z], 0.4 * s, 0.25 * s, 4, false);
        gb.sphere(mLeaf, [x, 6 * s, z], 3.5 * s, 6, 4, 0.9, 0.35, rng, true);
    }
    return {
        entities: gb.toEntities(), colliders: gb.colliders,
        spawn: { pos: [pathX(-30), 1.7, -30], yaw: Math.PI, pitch: -0.05 },
        env: { sunAzimuth: 18, sunElevation: 9, sunSize: 3, exposure: 1.2 },
    };
}

// ------------------------------------------------------------
// Scene 4: 밤바다 (강릉 경포 앞바다 근사, 동쪽 = +x 가 바다)
//   - 부두 끝에서 동해를 바라봄. 등대 섬, 암초, 먼바다 오징어잡이 배(집어등)
//   - 바다 표면: 레이트레이싱 모드는 ocean.js의 애니메이션 셰이더(래스터 전용),
//     패스트레이싱 모드는 같은 파도 식의 정지 스냅샷 메시(ptOnly 엔티티)
// ------------------------------------------------------------
export const OCEAN_LIGHTHOUSE = [330, 23.7, -160];
export const OCEAN_BOATS = [[2600, -900], [3300, 400], [4100, -1900], [4700, 1300], [5600, -300], [6200, 2100], [3900, 2600]];

function buildOcean(q) {
    const S = q.textureSize;
    const gb = new GeoBuilder();
    const rng = mulberry32(2026);
    const mSand = std({ color: 0xc9b48e, map: getTexture('dirt', S), roughness: 0.95 });
    const mWood = std({ color: 0x6b4f37, roughness: 0.85 });
    const mDarkWood = std({ color: 0x3b2c20, roughness: 0.9 });
    const mRock = std({ color: 0x4a4744, roughness: 0.9 });
    const mWhite = std({ color: 0xe8e8e4, roughness: 0.6 });
    const mRed = std({ color: 0x9a1810, roughness: 0.5 });
    const mGlass = std({ color: 0x222a30, roughness: 0.05, metalness: 0.8 });
    const mLampHouse = std({ color: 0xffffff, emissive: 0xfff0c8, emissiveIntensity: 40, night: { day: 0, k: 40 } });
    const mPierLamp = std({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 0.3, night: { day: 0.3, k: 6 } });
    const mPine = std({ color: 0x1d2a17, roughness: 0.9 });
    const mHull = std({ color: 0x1b2026, roughness: 0.6 });
    const mBoatLamp = std({ color: 0xffffff, emissive: 0xd8ffd0, emissiveIntensity: 60, night: { day: 0, k: 60 } });
    const town = getTexture('prewar', S);
    const mTown = std({ color: 0xbdb6aa, map: town.map, rm: town.rm, roughness: 1, metalness: 1, emissive: 0xffffff, emissiveMap: town.emissive, emissiveIntensity: 0, night: { day: 0, k: 1.4 } });
    const mRoof = std({ color: 0x3a3836, roughness: 0.9 });

    // ---- 해변 (서쪽 육지) ----
    gb.box(-900, -4, -900, -40, 0.6, 900, { side: mSand, top: mSand, tile: [8, 8], topTile: 8 });
    gb.colliders.push({ min: [-900, -4, -900], max: [-40, 0.6, 900] });
    // 물속으로 이어지는 경사
    gb.quad(mSand, [-40, 0.6, -900], [-40, 0.6, 900], [10, -3.5, 900], [10, -3.5, -900], [[0, 0], [0, 200], [6, 200], [6, 0]]);
    // 해송 숲과 해안 마을 (뒤쪽 서쪽)
    for (let i = 0; i < (q.low ? 80 : 160); i++) {
        const x = -70 - rng() * 120, z = (rng() - 0.5) * 900, h = 7 + rng() * 6;
        gb.cylinder(mDarkWood, [x, 0.6, z], [x, 0.6 + h * 0.5, z], 0.25, 0.18, 5, false);
        gb.cylinder(mPine, [x, 0.6 + h * 0.35, z], [x, 0.6 + h, z], 2.2 + rng(), 0, 7, true);
    }
    for (let i = 0; i < (q.low ? 40 : 80); i++) {
        const x = -230 - rng() * 400, z = (rng() - 0.5) * 1200, w = 12 + rng() * 20, d = 12 + rng() * 20, h = 8 + Math.pow(rng(), 2) * 45;
        gb.box(x, 0.6, z, x + w, h, z + d, { side: mTown, top: mRoof, tile: [8, 13.6], v0: 0.6 });
    }

    // ---- 부두 ----
    const X0 = -45, X1 = 52, W = 1.6, DECK = 2.4;
    gb.box(X0, DECK - 0.3, -W, X1, DECK, W, { side: mWood, top: mWood, tile: [2, 2], topTile: 2 });
    gb.colliders.push({ min: [X0, DECK - 0.3, -W], max: [X1, DECK, W] });
    // 끝단 전망대
    gb.box(X1, DECK - 0.3, -4.5, X1 + 10, DECK, 4.5, { side: mWood, top: mWood, tile: [2, 2], topTile: 2 });
    gb.colliders.push({ min: [X1, DECK - 0.3, -4.5], max: [X1 + 10, DECK, 4.5] });
    // 해변 → 부두 계단 (0.3m 단)
    for (let k = 0; k < 6; k++) {
        const x = X0 - 6 + k, y = 0.6 + (k + 1) * 0.3;
        gb.box(x, 0.6, -W, x + 1, y, W, { side: mDarkWood });
        gb.colliders.push({ min: [x, 0.6, -W], max: [x + 1, y, W] });
    }
    // 기둥
    for (let x = X0 + 2; x <= X1 + 9; x += 4) for (const z of (x > X1 ? [-4.2, 4.2] : [-W + 0.2, W - 0.2])) {
        gb.cylinder(mDarkWood, [x, -6, z], [x, DECK - 0.3, z], 0.18, 0.18, 6, false);
    }
    // 난간 (충돌 포함)
    const rail = (xa, za, xb, zb) => {
        const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / 2));
        for (let i = 0; i <= n; i++) {
            const x = xa + (xb - xa) * i / n, z = za + (zb - za) * i / n;
            gb.box(x - 0.05, DECK, z - 0.05, x + 0.05, DECK + 1.05, z + 0.05, { side: mWood });
        }
        gb.box(Math.min(xa, xb) - 0.04, DECK + 0.95, Math.min(za, zb) - 0.04, Math.max(xa, xb) + 0.04, DECK + 1.07, Math.max(za, zb) + 0.04, { side: mWood });
        gb.colliders.push({ min: [Math.min(xa, xb) - 0.05, DECK, Math.min(za, zb) - 0.05], max: [Math.max(xa, xb) + 0.05, DECK + 1.1, Math.max(za, zb) + 0.05] });
    };
    rail(X0, -W, X1, -W); rail(X0, W, X1, W);
    rail(X1, -4.5, X1 + 10, -4.5); rail(X1, 4.5, X1 + 10, 4.5); rail(X1 + 10, -4.5, X1 + 10, 4.5);
    rail(X1, -4.5, X1, -W); rail(X1, W, X1, 4.5);
    // 부두 가로등
    for (let x = X0 + 10; x < X1; x += 20) {
        gb.cylinder(mDarkWood, [x, DECK, W - 0.1], [x, DECK + 3.2, W - 0.1], 0.06, 0.05, 5, false);
        gb.box(x - 0.18, DECK + 3.0, W - 0.28, x + 0.18, DECK + 3.3, W + 0.08, { side: mPierLamp });
    }

    // ---- 등대 섬 ----
    const [LX, , LZ] = OCEAN_LIGHTHOUSE;
    for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 14;
        gb.sphere(mRock, [LX + Math.cos(a) * r, -1.5 + rng() * 1.5, LZ + Math.sin(a) * r], 4 + rng() * 5, 7, 5, 0.6 + rng() * 0.3, 0.45, rng, true);
    }
    gb.cylinder(mWhite, [LX, 2, LZ], [LX, 21.6, LZ], 3.0, 2.2, 16, false);
    for (const y of [8, 15]) gb.cylinder(mRed, [LX, y, LZ], [LX, y + 1.2, LZ], 2.75 - (y - 2) * 0.04, 2.7 - (y - 2) * 0.04, 16, false);
    gb.cylinder(mRed, [LX, 21.6, LZ], [LX, 22.0, LZ], 3.3, 3.3, 16, true);
    gb.cylinder(mGlass, [LX, 22.0, LZ], [LX, 25.0, LZ], 1.7, 1.7, 12, false);
    gb.sphere(mLampHouse, [LX, OCEAN_LIGHTHOUSE[1], LZ], 0.55, 8, 6);
    gb.cylinder(mRed, [LX, 25.0, LZ], [LX, 26.6, LZ], 1.9, 0.2, 12, true);

    // ---- 암초 / 방파 바위 ----
    for (let i = 0; i < 26; i++) {
        const x = 15 + rng() * 120, z = -40 - rng() * 140;
        gb.sphere(mRock, [x, -1.2, z], 1.5 + rng() * 3.5, 6, 4, 0.55 + rng() * 0.3, 0.5, rng, true);
    }

    // ---- 오징어잡이 배 (집어등) ----
    for (const [bx, bz] of OCEAN_BOATS) {
        const yaw = rng() * Math.PI;
        const ax = [Math.cos(yaw) * 9, 0, Math.sin(yaw) * 9], az = [-Math.sin(yaw) * 2.6, 0, Math.cos(yaw) * 2.6];
        gb.obox(mHull, [bx, 0.6, bz], ax, [0, 1.4, 0], az);
        gb.obox(mHull, [bx - ax[0] * 0.3, 3.0, bz - ax[2] * 0.3], ax.map((v) => v * 0.25), [0, 1.2, 0], az.map((v) => v * 0.7));
        for (let k = -4; k <= 4; k++) {
            const t = k / 4.5;
            gb.box(bx + ax[0] * t - 0.5, 5.2, bz + ax[2] * t - 0.5, bx + ax[0] * t + 0.5, 5.9, bz + ax[2] * t + 0.5, { side: mBoatLamp });
        }
    }

    // ---- 패스트레이싱용 바다 스냅샷 (래스터/레이트레이싱 모드에선 숨김) ----
    const entities = gb.toEntities();
    const water = new THREE.MeshPhysicalMaterial({ color: 0x020a10, roughness: 0.06, metalness: 0, ior: 1.33, side: THREE.DoubleSide });
    const snap = new THREE.Mesh(oceanSnapshotGeometry(0, 55, 0, q.low), water);
    entities.push({
        id: makeId('ocean'), type: 'mesh', mesh: snap, ptOnly: true,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, material: {}, pinned: true,
    });
    return {
        entities, colliders: gb.colliders,
        spawn: { pos: [X1 + 6, DECK + 1.7, 0], yaw: -Math.PI / 2, pitch: 0.12 },
        env: { exposure: 1.4 },
        night: true,
        glints: [
            { pos: OCEAN_LIGHTHOUSE, color: [1.0, 0.92, 0.75], power: 9000, lighthouse: true },
            ...OCEAN_BOATS.map(([x, z]) => ({ pos: [x, 5.5, z], color: [0.85, 1.0, 0.85], power: 2.5e5 })),
        ],
    };
}

// ------------------------------------------------------------
// Scene 3: 재질 쇼케이스 (기존 기본 장면 — 편집 가능한 엔티티)
// ------------------------------------------------------------
function buildShowcase(q) {
    const entities = createDefaultEntities();
    const colliders = [];
    for (const e of entities) {
        if (e.pinned) continue;
        const [x, y, z] = e.transform.position, [sx, sy, sz] = e.transform.scale;
        const hx = e.type === 'box' ? sx / 2 : sx, hz = e.type === 'box' ? sz / 2 : sz, hy = e.type === 'box' ? sy / 2 : sy;
        colliders.push({ min: [x - hx, y - hy, z - hz], max: [x + hx, y + hy, z + hz] });
    }
    return {
        entities, colliders,
        spawn: { pos: [0, 1.7, 9], yaw: 0, pitch: -0.12 },
        env: { sunAzimuth: 35, sunElevation: 55, sunSize: 4, exposure: 1.3 },
    };
}

export const SCENES = { ocean: buildOcean, city: buildCity, wheat: buildWheat, showcase: buildShowcase };
export const SCENE_LABELS = { '밤바다 (실제 밤하늘)': 'ocean', '맨해튼풍 애비뉴': 'city', '황금 밀밭': 'wheat', '재질 쇼케이스': 'showcase' };
