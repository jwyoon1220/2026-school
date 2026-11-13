/* 남김없이 — 데이터 저장소 (브라우저 localStorage) */
window.NG = (() => {
  "use strict";
  const K = k => "namgim:" + k;
  const get = (k, d) => { try { const v = localStorage.getItem(K(k)); return v === null ? d : JSON.parse(v); } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } };

  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = n => ymd(new Date(today().getTime() + n * 864e5));
  const parse = s => new Date(s + "T00:00:00");
  const dday = exp => exp ? Math.round((parse(exp) - today()) / 864e5) : null;
  const ddayLabel = d => d === null ? "날짜 없음" : d < 0 ? `${-d}일 지남` : d === 0 ? "오늘까지" : `D-${d}`;
  const ddayLevel = d => d === null ? "none" : d < 0 ? "over" : d <= 1 ? "urgent" : d <= 3 ? "soon" : d <= 7 ? "week" : "ok";
  const md = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const CATS = {
    veg: ["채소", "🥬"], fruit: ["과일", "🍎"], meat: ["육류", "🥩"], sea: ["해산물·어묵", "🐟"],
    dairy: ["유제품", "🥛"], egg: ["달걀", "🥚"], tofu: ["두부·콩", "🫘"], side: ["반찬·김치", "🍱"],
    grain: ["빵·밥·면", "🍞"], sauce: ["양념·소스", "🧂"], drink: ["음료", "🧃"], etc: ["기타", "📦"]
  };
  const PLACES = ["냉장", "냉동", "실온"];
  const PRESETS = [
    ["우유", "dairy", "팩"], ["요거트", "dairy", "개"], ["치즈", "dairy", "장"], ["달걀", "egg", "개"], ["두부", "tofu", "모"],
    ["콩나물", "veg", "봉"], ["양파", "veg", "개"], ["대파", "veg", "단"], ["감자", "veg", "개"], ["당근", "veg", "개"],
    ["애호박", "veg", "개"], ["양배추", "veg", "통"], ["버섯", "veg", "팩"], ["시금치", "veg", "단"], ["김치", "side", "통"],
    ["돼지고기", "meat", "g"], ["닭고기", "meat", "g"], ["소고기", "meat", "g"], ["소시지", "meat", "봉"], ["햄", "meat", "개"],
    ["어묵", "sea", "봉"], ["사과", "fruit", "개"], ["바나나", "fruit", "송이"], ["식빵", "grain", "봉"], ["밥", "grain", "공기"]
  ];
  const SYN = { "계란": "달걀", "쪽파": "대파", "파": "대파", "삼겹살": "돼지고기", "목살": "돼지고기", "앞다리": "돼지고기", "닭가슴살": "닭고기", "닭다리": "닭고기", "불고기": "소고기", "햇반": "밥", "즉석밥": "밥", "새송이": "버섯", "팽이": "버섯", "표고": "버섯", "느타리": "버섯", "호박": "애호박", "요구르트": "요거트", "비엔나": "소시지", "스팸": "햄" };
  const norm = s => { s = String(s).trim(); for (const [a, b] of Object.entries(SYN)) if (s.includes(a)) return s + " " + b; return s; };
  const has = (itemName, ing) => norm(itemName).includes(ing);

  const EMO = [["우유", "🥛"], ["요거트", "🥛"], ["치즈", "🧀"], ["달걀", "🥚"], ["계란", "🥚"], ["두부", "🧈"], ["양파", "🧅"], ["감자", "🥔"], ["당근", "🥕"], ["대파", "🌿"], ["시금치", "🥬"], ["양배추", "🥬"], ["콩나물", "🌱"], ["버섯", "🍄"], ["애호박", "🥒"], ["오이", "🥒"], ["토마토", "🍅"], ["김치", "🥬"], ["닭", "🍗"], ["소시지", "🌭"], ["햄", "🥓"], ["돼지", "🥩"], ["소고기", "🥩"], ["어묵", "🍢"], ["생선", "🐟"], ["새우", "🦐"], ["사과", "🍎"], ["바나나", "🍌"], ["딸기", "🍓"], ["포도", "🍇"], ["귤", "🍊"], ["식빵", "🍞"], ["빵", "🍞"], ["밥", "🍚"], ["면", "🍜"], ["주스", "🧃"]];
  const emoji = it => { const n = norm(it.name); const m = EMO.find(([k]) => n.includes(k)); return m ? m[1] : (CATS[it.cat] || CATS.etc)[1]; };
  const items = () => get("items", []);
  const saveItems = v => set("items", v);
  const log = () => get("log", []);
  const addLog = (it, result, qty) => {
    const l = log();
    l.push({ id: uid(), name: it.name, cat: it.cat, qty: qty || 1, result, date: ymd(new Date()) });
    set("log", l);
  };
  const sorted = list => [...list].sort((a, b) => (dday(a.exp) ?? 9999) - (dday(b.exp) ?? 9999));

  function seed() {
    const S = (name, cat, qty, unit, place, d) => ({ id: uid(), name, cat, qty, unit, place, exp: addDays(d), added: addDays(-2) });
    saveItems([
      S("우유", "dairy", 1, "팩", "냉장", 1), S("두부", "tofu", 1, "모", "냉장", 2), S("애호박", "veg", 1, "개", "냉장", 3),
      S("콩나물", "veg", 1, "봉", "냉장", 1), S("대파", "veg", 1, "단", "냉장", 5), S("달걀", "egg", 8, "개", "냉장", 12),
      S("김치", "side", 1, "통", "냉장", 30), S("돼지고기 앞다리", "meat", 400, "g", "냉동", 40), S("식빵", "grain", 1, "봉", "실온", -1),
      S("바나나", "fruit", 3, "개", "실온", 2), S("양파", "veg", 3, "개", "실온", 14), S("요거트", "dairy", 2, "개", "냉장", 4),
      S("감자", "veg", 2, "개", "실온", 10), S("버섯", "veg", 1, "팩", "냉장", 3)
    ]);
    // 지난 6주 기록 예시 (발표용 데모 데이터)
    const names = [["우유", "dairy"], ["두부", "tofu"], ["양배추", "veg"], ["사과", "fruit"], ["식빵", "grain"], ["콩나물", "veg"], ["닭고기", "meat"], ["요거트", "dairy"], ["시금치", "veg"], ["달걀", "egg"]];
    const l = [];
    for (let w = 6; w >= 1; w--) {
      const eaten = 3 + (6 - w), wasted = Math.max(0, 4 - Math.floor((6 - w) * .8)), shared = w % 2 ? 1 : 0;
      const push = (n, r, k) => { const [name, cat] = names[(w * 3 + k) % names.length]; l.push({ id: uid(), name, cat, qty: 1, result: r, date: addDays(-w * 7 + (k % 6)) }); };
      for (let k = 0; k < eaten; k++) push(k, "eaten", k);
      for (let k = 0; k < wasted; k++) push(k, "wasted", k + 4);
      for (let k = 0; k < shared; k++) push(k, "shared", k + 7);
    }
    set("log", l);
    set("shop", [{ id: uid(), name: "우유", done: false }, { id: uid(), name: "사과", done: false }, { id: uid(), name: "버섯", done: false }]);
    set("started", true);
  }

  return { emoji, get, set, today, ymd, addDays, dday, ddayLabel, ddayLevel, md, uid, CATS, PLACES, PRESETS, norm, has, items, saveItems, log, addLog, sorted, seed };
})();
