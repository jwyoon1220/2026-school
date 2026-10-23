// textures.js
// ------------------------------------------------------------
// 장면용 절차적 캔버스 텍스처 (건물 외벽, 도로, 인도, 밀밭 등).
// 패스트레이서는 모든 텍스처를 같은 크기의 2D 텍스처 배열로 올리므로
// 해상도(size)는 품질 프리셋에서 한 번에 정한다 (저사양 512, 고사양 1024).
//
// 거칠기/금속성 맵은 three.js 규칙대로 G = roughness, B = metalness 채널을
// 하나의 텍스처에 같이 담는다 (roughnessMap, metalnessMap에 같은 텍스처 지정).
// ------------------------------------------------------------
import * as THREE from 'three';

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// willReadFrequently: CPU 메모리 캔버스 → 픽셀 읽기/쓰기(getImageData)가 GPU 동기화 없이 빠름
// (텍스처는 한 번 업로드하고 끝이라 GPU 가속 캔버스일 이유가 없다)
function canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d', { willReadFrequently: true })];
}

function toTexture(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 1;
    t.needsUpdate = true;
    // 평균색(선형) 미리 계산: 레이트레이싱 반사에서 맞은 물체 색으로 사용 (rt.js)
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const lin = (v) => (srgb ? Math.pow(v / n / 255, 2.2) : v / n / 255);
    t.userData.avg = [lin(r), lin(g), lin(b)];
    return t;
}

// 잔 노이즈 (그레인): 셀마다 흰/검정을 알파 v로 덮는 것과 같은 결과를 픽셀 배열에 직접 계산
// (셀마다 fillRect 호출하던 방식보다 수십 배 빠름)
function grain(ctx, size, amount, rng, cell = 2) {
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
            const v = (rng() - 0.5) * amount;
            for (let yy = y; yy < Math.min(size, y + cell); yy++) {
                for (let xx = x; xx < Math.min(size, x + cell); xx++) {
                    const i = (yy * size + xx) * 4;
                    for (let k = 0; k < 3; k++) d[i + k] = v > 0 ? d[i + k] + (255 - d[i + k]) * v : d[i + k] * (1 + v);
                }
            }
        }
    }
    ctx.putImageData(img, 0, 0);
}

// 부드러운 얼룩 노이즈
function blotches(ctx, size, n, rng, color, rMin, rMax, alpha) {
    for (let i = 0; i < n; i++) {
        const x = rng() * size, y = rng() * size, r = rMin + rng() * (rMax - rMin);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color.replace('A', String(alpha * (0.5 + rng() * 0.5))));
        g.addColorStop(1, color.replace('A', '0'));
        ctx.fillStyle = g;
        // 타일링되도록 9방향으로 그림
        for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
            ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
        }
    }
}

const cache = new Map();

// 외벽 공통 생성기: 4열 x 4층 타일
// kind: 'prewar' (석조/벽돌, 작은 창) | 'glass' (커튼월) | 'store' (1층 상점)
function facadeSet(size, kind) {
    const rng = mulberry32(kind === 'prewar' ? 11 : kind === 'glass' ? 23 : 37);
    const [ca, a] = canvas(size);   // albedo
    const [cr, r] = canvas(size);   // rough(G)/metal(B)
    const [ce, e] = canvas(size);   // emissive
    const cols = kind === 'store' ? 2 : 4, rows = kind === 'store' ? 1 : 4;
    const cw = size / cols, rh = size / rows;
    e.fillStyle = '#000'; e.fillRect(0, 0, size, size);

    if (kind === 'prewar') {
        a.fillStyle = '#d6cdbf'; a.fillRect(0, 0, size, size);
        grain(a, size, 0.12, rng, Math.max(1, size / 256));
        // 벽돌 줄눈
        a.fillStyle = 'rgba(60,45,35,0.10)';
        const bh = size / 64;
        for (let y = 0; y < size; y += bh) a.fillRect(0, y, size, Math.max(1, bh * 0.15));
        r.fillStyle = 'rgb(0,225,0)'; r.fillRect(0, 0, size, size);
        for (let j = 0; j < rows; j++) {
            // 층 구분 띠 (돌출 코니스 느낌)
            a.fillStyle = 'rgba(40,30,25,0.25)';
            a.fillRect(0, j * rh + rh * 0.02, size, rh * 0.05);
            a.fillStyle = 'rgba(255,255,255,0.18)';
            a.fillRect(0, j * rh + rh * 0.07, size, rh * 0.02);
            for (let i = 0; i < cols; i++) {
                const x0 = i * cw + cw * 0.27, x1 = i * cw + cw * 0.73;
                const y0 = j * rh + rh * 0.16, y1 = j * rh + rh * 0.72;
                // 창틀 (밝은 석재)
                a.fillStyle = '#efe9df'; a.fillRect(x0 - cw * 0.04, y0 - rh * 0.03, x1 - x0 + cw * 0.08, y1 - y0 + rh * 0.08);
                // 창 그림자(깊이감)
                a.fillStyle = '#1d2126'; a.fillRect(x0, y0, x1 - x0, y1 - y0);
                const blind = rng() < 0.35;
                const grd = a.createLinearGradient(x0, y0, x1, y1);
                grd.addColorStop(0, blind ? '#8d8574' : '#3b4651');
                grd.addColorStop(1, blind ? '#5f5a50' : '#161b22');
                a.fillStyle = grd; a.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
                // 창살
                a.fillStyle = '#e8e2d6'; a.fillRect(x0, (y0 + y1) / 2 - 1, x1 - x0, Math.max(2, size / 256));
                r.fillStyle = 'rgb(0,18,120)'; r.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
                if (rng() < 0.45) {
                    e.fillStyle = `rgb(255,${170 + (rng() * 40) | 0},${90 + (rng() * 40) | 0})`;
                    e.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
                }
            }
        }
    } else if (kind === 'glass') {
        a.fillStyle = '#3c4955'; a.fillRect(0, 0, size, size);
        r.fillStyle = 'rgb(0,12,215)'; r.fillRect(0, 0, size, size);
        for (let j = 0; j < rows; j++) {
            // 스팬드럴 (불투명 층간 패널)
            a.fillStyle = '#26303a'; a.fillRect(0, j * rh, size, rh * 0.16);
            r.fillStyle = 'rgb(0,90,170)'; r.fillRect(0, j * rh, size, rh * 0.16);
            for (let i = 0; i < cols; i++) {
                const v = 0.75 + rng() * 0.4;
                a.fillStyle = `rgba(${(90 * v) | 0},${(110 * v) | 0},${(125 * v) | 0},0.55)`;
                a.fillRect(i * cw, j * rh + rh * 0.16, cw, rh * 0.84);
                if (rng() < 0.35) {
                    e.fillStyle = `rgb(255,${200 + (rng() * 40) | 0},${150 + (rng() * 50) | 0})`;
                    e.fillRect(i * cw + 3, j * rh + rh * 0.2, cw - 6, rh * 0.76);
                }
            }
        }
        // 멀리언 (세로/가로 프레임)
        a.fillStyle = '#9aa3ab'; r.fillStyle = 'rgb(0,100,200)';
        const mw = Math.max(2, size / 128);
        for (let i = 0; i <= cols; i++) { a.fillRect(i * cw - mw / 2, 0, mw, size); r.fillRect(i * cw - mw / 2, 0, mw, size); }
        for (let j = 0; j <= rows; j++) { a.fillRect(0, j * rh - mw / 2, size, mw); r.fillRect(0, j * rh - mw / 2, size, mw); }
    } else {
        // 1층 상점: 큰 쇼윈도 + 차양 + 간판 띠
        a.fillStyle = '#2a2622'; a.fillRect(0, 0, size, size);
        r.fillStyle = 'rgb(0,200,0)'; r.fillRect(0, 0, size, size);
        for (let i = 0; i < cols; i++) {
            const x0 = i * cw + cw * 0.06, x1 = i * cw + cw * 0.94;
            const hue = (rng() * 360) | 0;
            // 간판 띠
            a.fillStyle = `hsl(${hue},45%,30%)`; a.fillRect(i * cw, 0, cw, size * 0.16);
            e.fillStyle = `hsl(${hue},80%,45%)`; e.fillRect(x0 + cw * 0.2, size * 0.04, cw * 0.48, size * 0.08);
            // 쇼윈도
            a.fillStyle = '#4b4136'; a.fillRect(x0, size * 0.22, x1 - x0, size * 0.62);
            r.fillStyle = 'rgb(0,15,60)'; r.fillRect(x0, size * 0.22, x1 - x0, size * 0.62);
            const g = e.createLinearGradient(0, size * 0.22, 0, size * 0.84);
            g.addColorStop(0, '#ffcf8a'); g.addColorStop(1, '#a8632b');
            e.fillStyle = g; e.fillRect(x0 + 3, size * 0.24, x1 - x0 - 6, size * 0.58);
            // 문
            a.fillStyle = '#1b1814'; a.fillRect(i * cw + cw * 0.42, size * 0.4, cw * 0.16, size * 0.6);
            // 바닥 띠 (석재 기단)
            a.fillStyle = '#6b655c'; a.fillRect(i * cw, size * 0.88, cw, size * 0.12);
        }
    }
    return { map: toTexture(ca, true), rm: toTexture(cr, false), emissive: toTexture(ce, true) };
}

function asphaltSet(size) {
    const rng = mulberry32(5);
    const [ca, a] = canvas(size);
    const [cr, r] = canvas(size);
    a.fillStyle = '#2a2a2c'; a.fillRect(0, 0, size, size);
    grain(a, size, 0.22, rng, Math.max(1, size / 256));
    blotches(a, size, 30, rng, 'rgba(0,0,0,A)', size * 0.03, size * 0.12, 0.25);
    r.fillStyle = 'rgb(0,210,0)'; r.fillRect(0, 0, size, size);
    // 물웅덩이: 어둡고 매끈 → 하늘/건물 반사
    for (let i = 0; i < 5; i++) {
        const x = rng() * size, y = rng() * size, rr = size * (0.05 + rng() * 0.08);
        for (const [ctx, col] of [[a, 'rgba(10,10,12,A)'], [r, 'rgba(0,8,0,A)']]) {
            const g = ctx.createRadialGradient(x, y, rr * 0.3, x, y, rr);
            g.addColorStop(0, col.replace('A', '0.85')); g.addColorStop(1, col.replace('A', '0'));
            ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rr * 1.6, rr, rng() * 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    return { map: toTexture(ca, true), rm: toTexture(cr, false) };
}

// 애비뉴 차선: u = 도로 폭 18m 전체, v = 9m 반복
function avenueTex(size) {
    const rng = mulberry32(8);
    const [c, x] = canvas(size);
    x.fillStyle = '#2b2b2d'; x.fillRect(0, 0, size, size);
    grain(x, size, 0.2, rng, Math.max(1, size / 256));
    const m = (meters) => (meters / 18) * size;
    // 중앙 황색 이중선
    x.fillStyle = '#c99a1e';
    x.fillRect(size / 2 - m(0.25), 0, m(0.13), size);
    x.fillRect(size / 2 + m(0.12), 0, m(0.13), size);
    // 흰 점선 차선 (x = ±4.5m)
    x.fillStyle = '#d8d8d8';
    for (const off of [-4.5, 4.5]) x.fillRect(size / 2 + m(off) - m(0.07), 0, m(0.14), size * 0.35);
    return toTexture(c, true);
}

// 횡단보도: u = 도로 폭 18m, v = 횡단보도 길이 3.5m
function crosswalkTex(size) {
    const rng = mulberry32(9);
    const [c, x] = canvas(size);
    x.fillStyle = '#2b2b2d'; x.fillRect(0, 0, size, size);
    grain(x, size, 0.2, rng, Math.max(1, size / 256));
    x.fillStyle = '#dcdcdc';
    const stripe = size / 18 * 1.1;
    for (let u = stripe * 0.25; u < size; u += stripe) x.fillRect(u, size * 0.05, stripe * 0.5, size * 0.9);
    return toTexture(c, true);
}

// 인도 보도블록: 6m 타일 (1.5m x 4)
function sidewalkTex(size) {
    const rng = mulberry32(13);
    const [c, x] = canvas(size);
    x.fillStyle = '#9a958d'; x.fillRect(0, 0, size, size);
    grain(x, size, 0.14, rng, Math.max(1, size / 256));
    const n = 4, s = size / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const v = (rng() - 0.5) * 0.12;
        x.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
        x.fillRect(i * s, j * s, s, s);
    }
    x.fillStyle = 'rgba(40,38,35,0.55)';
    for (let i = 0; i <= n; i++) { x.fillRect(i * s - 1, 0, 2, size); x.fillRect(0, i * s - 1, size, 2); }
    return toTexture(c, true);
}

// 밀밭 윗면(캐노피): 4m 타일, 위에서 본 이삭들
function wheatTopTex(size) {
    const rng = mulberry32(17);
    const [c, x] = canvas(size);
    x.fillStyle = '#94702f'; x.fillRect(0, 0, size, size);
    const n = Math.floor(size * size / 70);
    for (let i = 0; i < n; i++) {
        const px = rng() * size, py = rng() * size, t = rng();
        x.fillStyle = `rgb(${(195 + t * 55) | 0},${(145 + t * 55) | 0},${(60 + t * 40) | 0})`;
        x.save(); x.translate(px, py); x.rotate(rng() * Math.PI);
        x.fillRect(-size / 300, -size / 90, size / 150, size / 45);
        x.restore();
    }
    blotches(x, size, 12, rng, 'rgba(70,45,10,A)', size * 0.05, size * 0.2, 0.18);
    return toTexture(c, true);
}

// 밀밭 옆면 (길가 단면): 세로 줄기 + 이삭
function wheatSideTex(size) {
    const rng = mulberry32(19);
    const [c, x] = canvas(size);
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#b38a3e'); g.addColorStop(0.35, '#7c5b25'); g.addColorStop(1, '#2c2410');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 1.2; i++) {
        const px = rng() * size, t = rng();
        x.fillStyle = `rgba(${(190 + t * 50) | 0},${(140 + t * 50) | 0},${(60 + t * 30) | 0},0.85)`;
        x.fillRect(px, size * (0.02 + rng() * 0.1), size / 220, size * 0.9);
        x.fillStyle = `rgb(${(210 + t * 40) | 0},${(160 + t * 40) | 0},${(70 + t * 30) | 0})`;
        x.fillRect(px - size / 300, size * rng() * 0.12, size / 110, size * 0.12);
    }
    return toTexture(c, true);
}

// 이삭 다발: v(아래→위) = 줄기 → 이삭, u 방향으로 8가지 색조
function wheatTuftTex(size) {
    const rng = mulberry32(41);
    const [c, x] = canvas(size);
    const n = 8, w = size / n;
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const g = x.createLinearGradient(0, size, 0, 0);   // 캔버스 아래 = v 0
        g.addColorStop(0, '#3a3315');
        g.addColorStop(0.45, `rgb(${(150 + t * 30) | 0},${(125 + t * 20) | 0},${(55 + t * 10) | 0})`);
        g.addColorStop(0.62, `rgb(${(205 + t * 40) | 0},${(150 + t * 45) | 0},${(60 + t * 35) | 0})`);
        g.addColorStop(1, `rgb(${(225 + t * 30) | 0},${(175 + t * 40) | 0},${(85 + t * 35) | 0})`);
        x.fillStyle = g; x.fillRect(i * w, 0, w, size);
    }
    // 이삭 낱알 결
    for (let k = 0; k < size * 3; k++) {
        const px = rng() * size, py = rng() * size * 0.4;
        x.fillStyle = `rgba(90,60,20,${0.15 + rng() * 0.2})`;
        x.fillRect(px, py, Math.max(1, size / 256), size / 64);
    }
    return toTexture(c, true);
}

function soilTex(size) {
    const rng = mulberry32(29);
    const [c, x] = canvas(size);
    x.fillStyle = '#3b2d1c'; x.fillRect(0, 0, size, size);
    grain(x, size, 0.25, rng, Math.max(1, size / 256));
    blotches(x, size, 25, rng, 'rgba(70,90,30,A)', size * 0.04, size * 0.14, 0.45);
    return toTexture(c, true);
}

function dirtTex(size) {
    const rng = mulberry32(31);
    const [c, x] = canvas(size);
    x.fillStyle = '#7b6448'; x.fillRect(0, 0, size, size);
    grain(x, size, 0.25, rng, Math.max(1, size / 256));
    blotches(x, size, 20, rng, 'rgba(50,38,25,A)', size * 0.03, size * 0.1, 0.35);
    return toTexture(c, true);
}

function checkerTex(size) {
    const [c, x] = canvas(size);
    const n = 8, s = size / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        x.fillStyle = (i + j) & 1 ? '#2a2a30' : '#c9cad0';
        x.fillRect(i * s, j * s, s, s);
    }
    return toTexture(c, true);
}

const builders = {
    prewar: (s) => facadeSet(s, 'prewar'),
    glass: (s) => facadeSet(s, 'glass'),
    store: (s) => facadeSet(s, 'store'),
    asphalt: asphaltSet,
    avenue: avenueTex,
    crosswalk: crosswalkTex,
    sidewalk: sidewalkTex,
    wheatTop: wheatTopTex,
    wheatSide: wheatSideTex,
    wheatTuft: wheatTuftTex,
    soil: soilTex,
    dirt: dirtTex,
    checker: checkerTex,
};

// 같은 크기/종류는 캐시 재사용 (장면 재생성 시 텍스처 재업로드 방지)
export function getTexture(name, size) {
    const key = `${name}@${size}`;
    if (!cache.has(key)) cache.set(key, builders[name](size));
    return cache.get(key);
}
