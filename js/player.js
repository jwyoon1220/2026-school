// player.js
// ------------------------------------------------------------
// 1인칭 플레이어 컨트롤러.
// - 화면 클릭 → 포인터 잠금, WASD 이동, 마우스 시점, Shift 달리기
// - F: 비행 모드 (Space / C 로 상승·하강)
// - 잠금 없이 드래그해도 시점 회전 가능
// - 플레이어는 메시가 없으므로 화면과 반사 어디에도 보이지 않는다.
// - 충돌: 장면 생성기가 준 AABB 목록과 원(반경 0.3m) 충돌, 낮은 박스는 계단처럼 올라섬
// ------------------------------------------------------------
import * as THREE from 'three';

const RADIUS = 0.3;
const EYE = 1.7;
const STEP = 0.45;

export function createPlayer(camera, dom, { onSceneKey } = {}) {
    camera.rotation.order = 'YXZ';
    const p = {
        pos: new THREE.Vector3(0, EYE, 0),
        vel: new THREE.Vector3(),
        yaw: 0, pitch: 0,
        fly: false,
        speed: 4.5,
        colliders: [],
        locked: false,
    };
    const keys = new Set();

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        keys.add(e.code);
        if (e.code === 'KeyF') { p.fly = !p.fly; p.vel.set(0, 0, 0); }
        if (onSceneKey && /^Digit[1-9]$/.test(e.code)) onSceneKey(Number(e.code.slice(5)));
        if (p.locked && ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());

    dom.addEventListener('click', () => { if (document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => {
        p.locked = document.pointerLockElement === dom;
        document.body.classList.toggle('locked', p.locked);
    });
    document.addEventListener('mousemove', (e) => {
        if (!p.locked) return;
        const s = 0.0022 * (camera.fov / 70);
        p.yaw -= e.movementX * s;
        p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - e.movementY * s));
    });
    let dragging = false;
    dom.addEventListener('mousedown', () => { dragging = true; });
    window.addEventListener('mouseup', () => { dragging = false; });
    dom.addEventListener('mousemove', (e) => {
        if (!dragging || p.locked) return;
        p.yaw -= e.movementX * 0.004;
        p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - e.movementY * 0.004));
    });

    const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();

    function collide() {
        const pos = p.pos;
        // 바닥 높이: 발 높이 + STEP 이하인 박스 윗면
        let floorY = 0;
        const feet = pos.y - (p.fly ? 0.5 : EYE);
        for (const c of p.colliders) {
            if (pos.x < c.min[0] || pos.x > c.max[0] || pos.z < c.min[2] || pos.z > c.max[2]) continue;
            if (c.max[1] - feet <= STEP && c.max[1] > floorY) floorY = c.max[1];
        }
        const fy = pos.y - (p.fly ? 0.5 : EYE), hy = pos.y + 0.1;
        for (let iter = 0; iter < 2; iter++) {
            for (const c of p.colliders) {
                if (c.max[1] <= fy + STEP || c.min[1] >= hy) continue;
                const qx = Math.max(c.min[0], Math.min(pos.x, c.max[0]));
                const qz = Math.max(c.min[2], Math.min(pos.z, c.max[2]));
                const dx = pos.x - qx, dz = pos.z - qz, d2 = dx * dx + dz * dz;
                if (d2 >= RADIUS * RADIUS) continue;
                if (d2 > 1e-8) {
                    const d = Math.sqrt(d2), push = RADIUS - d;
                    pos.x += (dx / d) * push; pos.z += (dz / d) * push;
                } else {
                    const ex = [pos.x - c.min[0], c.max[0] - pos.x, pos.z - c.min[2], c.max[2] - pos.z];
                    const k = ex.indexOf(Math.min(...ex));
                    if (k === 0) pos.x = c.min[0] - RADIUS; else if (k === 1) pos.x = c.max[0] + RADIUS;
                    else if (k === 2) pos.z = c.min[2] - RADIUS; else pos.z = c.max[2] + RADIUS;
                }
            }
        }
        return floorY;
    }

    // 매 프레임 호출. 카메라가 실제로 움직였으면 true
    p.update = (dt) => {
        fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        wish.set(0, 0, 0);
        const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
        const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
        wish.addScaledVector(fwd, f).addScaledVector(right, r);
        if (p.fly) {
            wish.y += (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0);
            wish.y += Math.sin(p.pitch) * f; // 비행 중에는 바라보는 방향으로
        }
        if (wish.lengthSq() > 0) wish.normalize();
        const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
        const speed = p.speed * (run ? 2.6 : 1) * (p.fly ? 4 : 1);
        p.vel.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-dt * 12));
        if (p.vel.lengthSq() < 1e-5) p.vel.set(0, 0, 0);
        p.pos.addScaledVector(p.vel, dt);

        const floorY = collide();
        if (!p.fly) {
            const target = floorY + EYE;
            const dy = target - p.pos.y;
            p.pos.y = Math.abs(dy) < 1e-3 ? target : p.pos.y + dy * (1 - Math.exp(-dt * 18));
        } else if (p.pos.y < floorY + 0.5) p.pos.y = floorY + 0.5;

        const before = camera.matrixWorld.elements.slice();
        camera.position.copy(p.pos);
        camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
        camera.updateMatrixWorld(true);
        const after = camera.matrixWorld.elements;
        for (let i = 0; i < 16; i++) if (Math.abs(before[i] - after[i]) > 1e-7) return true;
        return false;
    };

    p.spawn = (s) => {
        p.pos.fromArray(s.pos);
        p.yaw = s.yaw; p.pitch = s.pitch;
        p.vel.set(0, 0, 0); p.fly = false;
    };

    // 플레이어 앞 지점 (오브젝트 추가 위치)
    p.ahead = (dist) => new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).multiplyScalar(dist).add(p.pos);

    return p;
}
