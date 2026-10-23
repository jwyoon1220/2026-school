// astro.js
// ------------------------------------------------------------
// 날짜/시각/관측 위치 → 밤하늘 계산 (렌더러와 무관한 순수 계산 모듈).
//
// 출처:
//  - 별/은하수: NASA/Goddard SVS "Deep Star Maps 2020" (svs.gsfc.nasa.gov/4851)
//    ESA Hipparcos-2, Tycho-2, ESA Gaia DR2 기반. ICRF/J2000 적경·적위 equirect,
//    중앙 = 적경 0h, 적경은 왼쪽으로 증가.
//  - 행성: NASA JPL "Approximate Positions of the Planets" Table 1 (1800–2050)
//    (ssd.jpl.nasa.gov/planets/approx_pos.html) 의 케플러 궤도요소 + 알고리즘.
//  - 달: Astronomical Almanac 저정밀 공식(약 0.3° 정확도) + 지형중심 시차 보정.
//  - 항성시: IAU 1982 GMST 식, 세차: IAU 1976 (Lieske) 각.
//
// 좌표 규약 (월드): +x = 동, -z = 북, +y = 천정
// ------------------------------------------------------------

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function julianDate(dateUTC) {
    return dateUTC.getTime() / 86400000 + 2440587.5;
}

// 그리니치 평균 항성시 (도)
export function gmstDeg(jd) {
    const d = jd - 2451545.0, T = d / 36525;
    let g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000;
    return ((g % 360) + 360) % 360;
}

// J2000 → 날짜 평균적도 세차 행렬 (IAU 1976). 행 우선 3x3
export function precessionMatrix(jd) {
    const T = (jd - 2451545.0) / 36525;
    const as = (x) => x / 3600 * D2R;
    const zeta = as(2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T);
    const z = as(2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T);
    const th = as(2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T);
    const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
    return [
        cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st,
        sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st,
        st * cz, -st * sz, ct,
    ];
}
const mulMV = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const mulMtV = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------- 행성 (JPL Table 1) ----------------
const ELEM = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    emb: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};
const OBL_J2000 = 23.43928 * D2R;

// 태양중심 황도 J2000 좌표 (au)
function heliocentric(name, T) {
    const [b, r] = ELEM[name];
    const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = (b[2] + r[2] * T) * D2R;
    const L = b[3] + r[3] * T, peri = b[4] + r[4] * T, node = b[5] + r[5] * T;
    const w = (peri - node) * D2R, O = node * D2R;
    let M = ((L - peri) % 360 + 540) % 360 - 180;
    const es = e * R2D;
    let E = M + es * Math.sin(M * D2R);
    for (let i = 0; i < 20; i++) {
        const dE = (M - (E - es * Math.sin(E * D2R))) / (1 - e * Math.cos(E * D2R));
        E += dE;
        if (Math.abs(dE) < 1e-6) break;
    }
    const xp = a * (Math.cos(E * D2R) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E * D2R);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    return [
        (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
        (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
        (sw * sI) * xp + (cw * sI) * yp,
    ];
}
const eclToEq = (v) => [v[0], Math.cos(OBL_J2000) * v[1] - Math.sin(OBL_J2000) * v[2], Math.sin(OBL_J2000) * v[1] + Math.cos(OBL_J2000) * v[2]];

// 겉보기 등급 (간이식, 위상각 효과 단순화)
const MAG = { mercury: -0.4, venus: -4.4, mars: -1.5, jupiter: -9.4, saturn: -8.9 };
function magnitude(name, rHelio, delta, phaseDeg) {
    if (name === 'mercury') return -0.42 + 5 * Math.log10(rHelio * delta) + 0.038 * phaseDeg;
    if (name === 'venus') return -4.40 + 5 * Math.log10(rHelio * delta) + 0.0009 * phaseDeg + 0.000239 * phaseDeg * phaseDeg;
    if (name === 'mars') return -1.52 + 5 * Math.log10(rHelio * delta) + 0.016 * phaseDeg;
    if (name === 'jupiter') return -9.40 + 5 * Math.log10(rHelio * delta) + 0.005 * phaseDeg;
    return -8.88 + 5 * Math.log10(rHelio * delta); // saturn (고리 효과 제외)
}

// ---------------- 달 (저정밀 + 시차) ----------------
function moonOfDate(T) {
    const s = (a) => Math.sin(a * D2R), c = (a) => Math.cos(a * D2R);
    const lam = 218.32 + 481267.881 * T
        + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T)
        + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T)
        - 0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T);
    const bet = 5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T)
        - 0.28 * s(318.3 + 6003.15 * T) - 0.17 * s(217.6 - 407332.21 * T);
    const par = 0.9508 + 0.0518 * c(135.0 + 477198.87 * T) + 0.0095 * c(259.3 - 413335.36 * T)
        + 0.0078 * c(235.7 + 890534.22 * T) + 0.0028 * c(269.9 + 954397.74 * T);
    const eps = (23.439291 - 0.0130042 * T) * D2R;
    const l = lam * D2R, b = bet * D2R;
    const v = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
    const eq = [v[0], Math.cos(eps) * v[1] - Math.sin(eps) * v[2], Math.sin(eps) * v[1] + Math.cos(eps) * v[2]];
    const distER = 1 / Math.sin(par * D2R); // 지구 반지름 단위
    return { eq, distER };
}

// 날짜 적도 → 지평 행렬 구성용 기저 (ENU in equatorial-of-date)
function localBasis(latDeg, lstDeg) {
    const p = latDeg * D2R, t = lstDeg * D2R;
    const U = [Math.cos(p) * Math.cos(t), Math.cos(p) * Math.sin(t), Math.sin(p)];
    const E = [-Math.sin(t), Math.cos(t), 0];
    const N = [-Math.sin(p) * Math.cos(t), -Math.sin(p) * Math.sin(t), Math.cos(p)];
    return { E, N, U };
}

// eq(날짜) 벡터 → 월드 벡터 (+x 동, +y 천정, -z 북)
const eqToWorld = (B, v) => {
    const e = v[0] * B.E[0] + v[1] * B.E[1] + v[2] * B.E[2];
    const n = v[0] * B.N[0] + v[1] * B.N[1] + v[2] * B.N[2];
    const u = v[0] * B.U[0] + v[1] * B.U[1] + v[2] * B.U[2];
    return [e, u, -n];
};

export function altAz(world) {
    const alt = Math.asin(Math.max(-1, Math.min(1, world[1]))) * R2D;
    let az = Math.atan2(world[0], -world[2]) * R2D; // 북=0, 동=90
    if (az < 0) az += 360;
    return { alt, az };
}

// 메인: 하늘 상태 계산
//  dateUTC: Date, lat/lon: 도 (동경 +)
export function computeSky(dateUTC, lat, lon) {
    const jd = julianDate(dateUTC);
    const T = (jd - 2451545.0) / 36525;
    const lst = (gmstDeg(jd) + lon + 360) % 360;
    const P = precessionMatrix(jd);
    const B = localBasis(lat, lst);

    // 월드 → J2000 행렬 (셰이더 uniform). 월드 축을 J2000으로 보냄.
    //  월드 x(동)=E, y(천정)=U, z(남)= -N  (모두 날짜 적도) → J2000 = P^T * v
    const toJ = (v) => mulMtV(P, v);
    const wx = toJ(B.E), wy = toJ(B.U), wz = toJ(B.N.map((x) => -x));
    // three.js Matrix3.set 순서(행 우선): J2000 = M * world, M 의 열 = wx, wy, wz
    const worldToJ2000 = [wx[0], wy[0], wz[0], wx[1], wy[1], wz[1], wx[2], wy[2], wz[2]];

    // 태양 (지구-달 질량중심의 반대 방향, J2000)
    const earth = heliocentric('emb', T);
    const sunJ = norm(eclToEq(earth.map((x) => -x)));
    const sunW = eqToWorld(B, mulMV(P, sunJ));

    // 달 (날짜 적도 → 지형중심 시차 보정)
    const mo = moonOfDate(T);
    const obsEq = B.U; // 관측자 위치(지구 반지름 단위, 구형 근사)
    const topo = norm([mo.eq[0] * mo.distER - obsEq[0], mo.eq[1] * mo.distER - obsEq[1], mo.eq[2] * mo.distER - obsEq[2]]);
    const moonW = eqToWorld(B, topo);
    const sunEqDate = mulMV(P, sunJ);
    const cosElong = topo[0] * sunEqDate[0] + topo[1] * sunEqDate[1] + topo[2] * sunEqDate[2];
    const illum = (1 - cosElong) / 2; // 밝은 면 비율 (0=삭, 1=망)

    // 행성
    const planets = [];
    for (const name of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
        const h = heliocentric(name, T);
        const g = [h[0] - earth[0], h[1] - earth[1], h[2] - earth[2]];
        const delta = Math.hypot(...g), r = Math.hypot(...h);
        const cosPh = (h[0] * g[0] + h[1] * g[1] + h[2] * g[2]) / (r * delta);
        const ph = Math.acos(Math.max(-1, Math.min(1, cosPh))) * R2D;
        const j = norm(eclToEq(g));
        const w = eqToWorld(B, mulMV(P, j));
        const ra = (Math.atan2(j[1], j[0]) * R2D / 15 + 24) % 24, dec = Math.asin(j[2]) * R2D;
        planets.push({ name, world: w, mag: magnitude(name, r, delta, ph), ra, dec, ...altAz(w) });
    }
    const moonJ = mulMtV(P, topo);
    return {
        jd, lst, worldToJ2000,
        sun: { world: sunW, ...altAz(sunW) },
        moon: {
            world: moonW, illum, distER: mo.distER,
            ra: (Math.atan2(moonJ[1], moonJ[0]) * R2D / 15 + 24) % 24, dec: Math.asin(moonJ[2]) * R2D,
            ...altAz(moonW),
        },
        planets,
    };
}

export const PLANET_LABELS = { mercury: '수성', venus: '금성', mars: '화성', jupiter: '목성', saturn: '토성' };
