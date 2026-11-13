/* 남김없이 — 서비스 로직 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { CATS, PLACES, PRESETS } = NG;
  const R = window.RECIPES;
  const main = $("#main");
  const emo = cat => (CATS[cat] || CATS.etc)[1];
  const dp = exp => { const d = NG.dday(exp); return `<span class="dp ${NG.ddayLevel(d)}">${NG.ddayLabel(d)}</span>`; };

  /* ---------- 공통 UI ---------- */
  function toast(msg, undo) {
    const el = document.createElement("div");
    el.className = "tst";
    el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? `<button>되돌리기</button>` : "");
    if (undo) $("button", el).onclick = () => { undo(); el.remove(); render(); };
    $("#toast").append(el);
    setTimeout(() => el.remove(), 4000);
  }
  function dialog(html, onMount) {
    const wrap = $("#dlg-wrap"), box = $(".dlg", wrap);
    box.innerHTML = html; wrap.hidden = false;
    const close = () => { wrap.hidden = true; box.innerHTML = ""; };
    wrap.onclick = e => { if (e.target === wrap) close(); };
    $$("[data-close]", box).forEach(b => b.onclick = close);
    onMount && onMount(box, close);
    const f = $("input:not([type=checkbox]), textarea", box); f && setTimeout(() => f.focus(), 30);
    return close;
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (!$("#dlg-wrap").hidden) { $("#dlg-wrap").hidden = true; } closeMenu(); }
  });
  let menuEl = null;
  function closeMenu() { menuEl && menuEl.remove(); menuEl = null; }
  function menu(anchor, items) {
    closeMenu();
    menuEl = document.createElement("div"); menuEl.className = "menu";
    items.forEach(it => {
      if (!it) { menuEl.append(document.createElement("hr")); return; }
      const b = document.createElement("button"); b.innerHTML = `<span>${it[0]}</span>${esc(it[1])}`;
      b.onclick = () => { closeMenu(); it[2](); }; menuEl.append(b);
    });
    document.body.append(menuEl);
    const r = anchor.getBoundingClientRect(), m = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.max(4, Math.min(r.right - m.width, innerWidth - m.width - 4)) + "px";
    menuEl.style.top = (r.bottom + m.height + 4 > innerHeight ? r.top - m.height - 4 : r.bottom + 4) + "px";
  }
  document.addEventListener("pointerdown", e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });

  /* ---------- 재료 조작 ---------- */
  function snapshot() { return { items: NG.items(), log: NG.get("log", []), shop: NG.get("shop", []) }; }
  function restore(s) { NG.saveItems(s.items); NG.set("log", s.log); NG.set("shop", s.shop); }
  function useItem(id, result, all) {
    const snap = snapshot();
    const list = NG.items(), it = list.find(x => x.id === id); if (!it) return;
    const countable = !["g", "ml"].includes(it.unit);
    const used = all || !countable || it.qty <= 1 ? it.qty : 1;
    NG.addLog(it, result, countable ? used : 1);
    if (used >= it.qty) list.splice(list.indexOf(it), 1); else it.qty -= used;
    NG.saveItems(list);
    const word = { eaten: "먹었어요", shared: "나눴어요", wasted: "버림으로 기록했어요" }[result];
    toast(`${it.name} ${countable && used < snap.items.find(x => x.id === id).qty ? used + it.unit + " " : ""}${word}`, () => restore(snap));
    render();
  }
  function removeItem(id) {
    const snap = snapshot();
    NG.saveItems(NG.items().filter(x => x.id !== id));
    toast("삭제했어요 (기록에는 남지 않아요)", () => restore(snap));
    render();
  }

  /* ---------- 재료 추가/수정 대화상자 ---------- */
  function itemDialog(edit, prefill, onDone) {
    const it = edit || Object.assign({ name: "", cat: "veg", qty: 1, unit: "개", place: "냉장", exp: NG.addDays(7) }, prefill || {});
    const quick = [[1, "내일"], [3, "3일"], [7, "1주"], [14, "2주"], [30, "1달"], [90, "3달"]];
    dialog(`<div class="db">
      <h2>${edit ? "재료 수정" : "재료 추가"}</h2>
      ${edit ? "" : `<div class="presets">${PRESETS.map(p => `<button class="chipbtn" data-pre="${esc(p[0])}">${NG.emoji({ name: p[0], cat: p[1] })} ${esc(p[0])}</button>`).join("")}</div>`}
      <div class="fg">
        <label class="wide">이름<input class="field" name="name" value="${esc(it.name)}" placeholder="예: 우유, 돼지고기 앞다리" maxlength="30" autocomplete="off"></label>
        <label>분류<select class="field" name="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === it.cat ? "selected" : ""}>${v[1]} ${v[0]}</option>`).join("")}</select></label>
        <label>수량<div class="qty"><input class="field" name="qty" type="number" min="0" step="any" value="${it.qty}"><input class="field" name="unit" value="${esc(it.unit)}" maxlength="6" list="units"></div></label>
        <label>보관<div class="seg" data-place>${PLACES.map(p => `<button type="button" data-v="${p}" class="${p === it.place ? "cur" : ""}">${p}</button>`).join("")}</div></label>
        <label>소비기한(포장지 날짜)<input class="field" name="exp" type="date" value="${it.exp || ""}"></label>
        <div class="wide"><div class="presets" style="margin:0">${quick.map(([d, l]) => `<button type="button" class="chipbtn" data-d="${d}">+${l}</button>`).join("")}</div></div>
      </div>
      <datalist id="units"><option>개</option><option>팩</option><option>봉</option><option>g</option><option>ml</option><option>단</option><option>통</option></datalist>
      <div class="dupe"></div>
      <p class="note">포장지에 적힌 소비기한(또는 유통기한)을 넣어 주세요. 남김없이는 날짜를 알려 드릴 뿐, 먹어도 되는지는 판단하지 않습니다. 날짜가 지난 음식은 상태를 직접 확인하세요.</p>
    </div>
    <div class="df">
      ${edit ? "" : `<button class="btn" data-a="more">추가하고 계속</button>`}
      <button class="btn primary" data-a="save">${edit ? "저장" : "추가"}</button>
      <button class="btn" data-close>취소</button>
    </div>`, (box, close) => {
      let place = it.place;
      const f = n => $(`[name=${n}]`, box);
      const dupe = () => {
        const n = f("name").value.trim();
        const same = n && !edit && NG.items().filter(x => NG.norm(x.name).includes(n) || NG.norm(n).includes(x.name));
        $(".dupe", box).innerHTML = same && same.length ? `<div class="hint">이미 냉장고에 있어요: ${same.map(x => `${esc(x.name)} ${x.qty}${esc(x.unit)} (${NG.ddayLabel(NG.dday(x.exp))})`).join(", ")}</div>` : "";
      };
      f("name").addEventListener("input", dupe);
      $$("[data-pre]", box).forEach(b => b.onclick = () => {
        const p = PRESETS.find(x => x[0] === b.dataset.pre);
        f("name").value = p[0]; f("cat").value = p[1]; f("unit").value = p[2];
        f("qty").value = p[2] === "g" ? 300 : 1;
        $$("[data-pre]", box).forEach(x => x.classList.toggle("on", x === b));
        dupe();
      });
      $$("[data-place] button", box).forEach(b => b.onclick = () => { place = b.dataset.v; $$("[data-place] button", box).forEach(x => x.classList.toggle("cur", x === b)); });
      $$("[data-d]", box).forEach(b => b.onclick = () => { f("exp").value = NG.addDays(+b.dataset.d); });
      const save = more => {
        const name = f("name").value.trim();
        if (!name) { f("name").focus(); return; }
        const data = { name, cat: f("cat").value, qty: Math.max(0, +f("qty").value || 1), unit: f("unit").value.trim() || "개", place, exp: f("exp").value || null };
        const list = NG.items();
        if (edit) Object.assign(list.find(x => x.id === edit.id), data);
        else list.push(Object.assign({ id: NG.uid(), added: NG.ymd(new Date()) }, data));
        NG.saveItems(list); NG.set("started", true);
        toast(edit ? `${name} 수정했어요` : `${name} 넣었어요`);
        if (more) { f("name").value = ""; f("qty").value = 1; $$("[data-pre]", box).forEach(x => x.classList.remove("on")); $(".dupe", box).innerHTML = ""; f("name").focus(); render(); }
        else { close(); onDone ? onDone() : render(); }
      };
      $("[data-a=save]", box).onclick = () => save(false);
      const m = $("[data-a=more]", box); m && (m.onclick = () => save(true));
      box.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") save(false); });
    });
  }

  /* ---------- 레시피 매칭 ---------- */
  const urg = d => d === null ? 1 : d < 0 ? 0 : d <= 1 ? 5 : d <= 3 ? 3 : d <= 7 ? 2 : 1;
  function matchRecipes() {
    const items = NG.items().filter(x => { const d = NG.dday(x.exp); return d === null || d >= 0; });
    return R.map(r => {
      const find = ing => NG.sorted(items).find(x => NG.has(x.name, ing));
      const need = r.need.map(i => ({ i, it: find(i) })), opt = r.opt.map(i => ({ i, it: find(i) }));
      const have = [...need, ...opt].filter(x => x.it);
      const missing = need.filter(x => !x.it);
      const score = have.reduce((s, x) => s + urg(NG.dday(x.it.exp)), 0);
      const hot = have.filter(x => { const d = NG.dday(x.it.exp); return d !== null && d <= 3; });
      return { r, need, opt, have, missing, score, hot, can: !missing.length };
    }).sort((a, b) => (b.can - a.can) || (b.hot.length - a.hot.length) || (b.score - a.score) || (a.missing.length - b.missing.length));
  }
  const ingChips = m => [...m.need, ...m.opt].map(x => {
    if (!x.it) return m.need.includes(x) ? `<span class="ing no">${esc(x.i)}</span>` : "";
    const d = NG.dday(x.it.exp);
    return `<span class="ing ${d !== null && d <= 3 ? "hot" : "have"}" title="${esc(x.it.name)} ${NG.ddayLabel(d)}">${esc(x.i)}${d !== null && d <= 3 ? " · " + NG.ddayLabel(d) : ""}</span>`;
  }).join("");
  function recipeCard(m, k) {
    return `<button class="rcard" data-recipe="${k}">
      <div class="top"><span class="re">${m.r.emoji}</span><div><b>${esc(m.r.name)}</b><small>${m.r.min}분 · 재료 ${m.have.length}/${m.need.length + m.opt.length}</small></div>
      <span class="badge ${m.can ? "" : "miss"}">${m.can ? (m.hot.length ? `임박 재료 ${m.hot.length}개 사용` : "바로 가능") : `${m.missing.length}개 부족`}</span></div>
      <div class="ings">${ingChips(m)}</div></button>`;
  }
  function recipeDialog(m) {
    dialog(`<div class="db">
      <h2>${m.r.emoji} ${esc(m.r.name)}</h2>
      <div class="ings" style="margin-bottom:10px">${ingChips(m)}</div>
      ${m.r.base.length ? `<p class="note" style="margin:0 0 6px">기본 양념: ${m.r.base.map(esc).join(", ")}</p>` : ""}
      <ol class="steps">${m.r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
      ${m.have.length ? `<h2 class="h" style="margin-top:18px">이 요리에 다 쓴 재료</h2>
        ${m.have.map(x => `<label class="ckrow"><input type="checkbox" data-use="${x.it.id}" ${m.need.includes(x) ? "checked" : ""}><span class="grow">${NG.emoji(x.it)} ${esc(x.it.name)} <small style="color:var(--text-2)">${x.it.qty}${esc(x.it.unit)}</small></span>${dp(x.it.exp)}</label>`).join("")}
        <p class="note">체크한 재료는 냉장고에서 빠지고 '먹었어요'로 기록됩니다.</p>` : ""}
    </div>
    <div class="df">
      ${m.missing.length ? `<button class="btn" data-a="shop">부족한 재료 장보기에 추가</button>` : ""}
      ${m.have.length ? `<button class="btn primary" data-a="cook">요리했어요</button>` : ""}
      <button class="btn" data-close>닫기</button>
    </div>`, (box, close) => {
      const s = $("[data-a=shop]", box);
      s && (s.onclick = () => { addShop(m.missing.map(x => x.i)); close(); toast(`${m.missing.map(x => x.i).join(", ")} 장보기에 추가했어요`); render(); });
      const c = $("[data-a=cook]", box);
      c && (c.onclick = () => {
        const ids = $$("[data-use]:checked", box).map(x => x.dataset.use);
        if (!ids.length) { toast("다 쓴 재료를 체크해 주세요"); return; }
        const snap = snapshot();
        const list = NG.items();
        ids.forEach(id => { const it = list.find(x => x.id === id); if (it) { NG.addLog(it, "eaten", ["g", "ml"].includes(it.unit) ? 1 : it.qty); list.splice(list.indexOf(it), 1); } });
        NG.saveItems(list); close();
        toast(`${m.r.name} 완성! 재료 ${ids.length}개를 남김없이 썼어요`, () => restore(snap));
        render();
      });
    });
  }

  /* ---------- 장보기 ---------- */
  function addShop(names) {
    const shop = NG.get("shop", []);
    names.forEach(n => { if (!shop.some(s => s.name === n && !s.done)) shop.push({ id: NG.uid(), name: n, done: false }); });
    NG.set("shop", shop);
  }
  const inFridge = n => NG.items().filter(x => NG.norm(x.name).includes(n) || NG.norm(n).includes(x.name));

  /* ---------- 통계 ---------- */
  function stats(days) {
    const from = days ? NG.addDays(-days + 1) : "0000";
    const l = NG.get("log", []).filter(x => x.date >= from);
    const sum = r => l.filter(x => x.result === r).length;
    const e = sum("eaten"), s = sum("shared"), w = sum("wasted"), t = e + s + w;
    return { e, s, w, t, rate: t ? Math.round((e + s) / t * 100) : null, l };
  }

  /* ================= 페이지 ================= */
  const pages = {};
  let fridgeFilter = { place: "전체", q: "", sort: "exp" };

  pages.home = () => {
    const items = NG.items(), sorted = NG.sorted(items);
    const soon = items.filter(x => { const d = NG.dday(x.exp); return d !== null && d >= 0 && d <= 3; }).length;
    const over = items.filter(x => { const d = NG.dday(x.exp); return d !== null && d < 0; }).length;
    const st = stats(30);
    const recs = matchRecipes().filter(m => m.can && m.have.length).slice(0, 3);
    const h = new Date().getHours();
    const hi = h < 11 ? "좋은 아침이에요" : h < 17 ? "좋은 오후예요" : "오늘 저녁은 뭐 먹을까요?";
    const started = NG.get("started", false);
    return `
      ${started ? "" : `<div class="welcome"><h2>남김없이에 오신 것을 환영합니다 👋</h2>
        <p>냉장고에 있는 재료와 소비기한을 넣어 두면, 먼저 먹어야 할 것을 알려 주고 그 재료로 만들 요리를 추천해 드려요. 다 못 먹을 것 같으면 이웃과 나누세요.</p>
        <button class="btn" data-a="seed">예시 데이터로 체험하기</button> <button class="btn ghost" data-a="add">빈 냉장고로 시작</button></div>`}
      <h1>${hi}</h1>
      <p class="sub">${new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })} · 오늘도 남김없이 먹어 볼까요?</p>
      <div class="tiles">
        <button class="tile" data-go="fridge"><small>냉장고 속 재료</small><b>${items.length}<span>개</span></b></button>
        <button class="tile ${soon ? "warn" : ""}" data-go="fridge"><small>3일 안에 먹어야 해요</small><b>${soon}<span>개</span></b></button>
        <button class="tile ${over ? "warn" : ""}" data-go="fridge"><small>날짜 지남 · 확인 필요</small><b>${over}<span>개</span></b></button>
        <button class="tile" data-go="stats"><small>최근 30일 지킨 비율</small><b>${st.rate === null ? "-" : st.rate}<span>${st.rate === null ? "" : "%"}</span></b></button>
      </div>
      <h2 class="h">먼저 먹어야 할 것 <button class="more" data-go="fridge">전체 보기</button></h2>
      ${sorted.length ? `<div class="list">${sorted.slice(0, 5).map(itemRow).join("")}</div>` : emptyFridge()}
      <h2 class="h">지금 만들 수 있는 요리 <button class="more" data-go="cook">더 보기</button></h2>
      ${recs.length ? `<div class="rgrid">${recs.map(m => recipeCard(m, R.indexOf(m.r))).join("")}</div>` : `<div class="list"><div class="empty-box">재료를 넣으면 만들 수 있는 요리를 추천해 드려요.</div></div>`}`;
  };
  const emptyFridge = () => `<div class="list"><div class="empty-box"><span class="big">🧊</span>냉장고가 비어 있어요.<br><button class="btn primary" data-a="add" style="margin-top:10px">재료 추가</button></div></div>`;
  function itemRow(it) {
    return `<div class="row"><span class="em">${NG.emoji(it)}</span>
      <div class="nm"><b>${esc(it.name)}</b><span class="tag">${esc(it.place)}</span><small>${it.qty}${esc(it.unit)} · ${it.exp ? NG.md(it.exp) + "까지" : "날짜 없음"}</small></div>
      ${dp(it.exp)}
      <div class="acts"><button class="btn" data-eat="${it.id}">먹었어요</button><button class="btn" data-more="${it.id}" aria-label="더 보기">⋯</button></div></div>`;
  }

  pages.fridge = () => {
    let list = NG.items();
    const f = fridgeFilter;
    if (f.place !== "전체") list = list.filter(x => x.place === f.place);
    if (f.q) list = list.filter(x => NG.norm(x.name).includes(f.q));
    list = f.sort === "exp" ? NG.sorted(list) : f.sort === "name" ? list.sort((a, b) => a.name.localeCompare(b.name, "ko")) : list.sort((a, b) => (b.added || "").localeCompare(a.added || ""));
    const counts = p => NG.items().filter(x => p === "전체" || x.place === p).length;
    return `<h1>냉장고</h1><p class="sub">소비기한이 가까운 순서로 보여 드려요. 다 먹으면 <b>먹었어요</b>, 못 먹게 되면 <b>⋯ → 버렸어요</b>로 기록해 주세요.</p>
      <div class="bar">
        <div class="seg" data-filter="place">${["전체", ...PLACES].map(p => `<button data-v="${p}" class="${f.place === p ? "cur" : ""}">${p} ${counts(p)}</button>`).join("")}</div>
        <input class="field grow" type="search" placeholder="재료 검색" value="${esc(f.q)}" data-filter="q">
        <select class="field" data-filter="sort"><option value="exp" ${f.sort === "exp" ? "selected" : ""}>임박순</option><option value="added" ${f.sort === "added" ? "selected" : ""}>최근 넣은 순</option><option value="name" ${f.sort === "name" ? "selected" : ""}>이름순</option></select>
        <button class="btn primary" data-a="add">＋ 재료 추가</button>
      </div>
      ${list.length ? `<div class="list">${list.map(itemRow).join("")}</div>` : NG.items().length ? `<div class="list"><div class="empty-box">조건에 맞는 재료가 없어요.</div></div>` : emptyFridge()}`;
  };

  pages.cook = () => {
    const ms = matchRecipes();
    const can = ms.filter(m => m.can), near = ms.filter(m => !m.can && m.have.length && m.missing.length <= 1);
    return `<h1>오늘 뭐 먹지</h1><p class="sub">냉장고 재료로 만들 수 있는 요리를 <b>소비기한이 급한 재료를 많이 쓰는 순서</b>로 추천해요. 빨간 재료가 곧 기한이 끝나는 재료예요.</p>
      <h2 class="h">바로 만들 수 있어요 (${can.length})</h2>
      ${can.length ? `<div class="rgrid">${can.map(m => recipeCard(m, R.indexOf(m.r))).join("")}</div>` : `<div class="list"><div class="empty-box">지금 재료로 바로 만들 수 있는 요리가 없어요.</div></div>`}
      ${near.length ? `<h2 class="h">하나만 더 있으면 (${near.length})</h2><div class="rgrid">${near.map(m => recipeCard(m, R.indexOf(m.r))).join("")}</div>` : ""}`;
  };

  pages.shop = () => {
    const shop = NG.get("shop", []);
    const done = shop.filter(s => s.done).length;
    return `<h1>장보기</h1><p class="sub">음식물 쓰레기는 <b>이미 있는 걸 또 사는 데서</b> 많이 생겨요. 목록에 넣을 때 냉장고에 같은 재료가 있으면 알려 드려요.</p>
      <div class="bar"><input class="field grow" id="shop-in" placeholder="살 것 입력 후 Enter (예: 우유)" maxlength="30" autocomplete="off"><button class="btn primary" data-a="shop-add">추가</button></div>
      <div id="shop-hint"></div>
      ${shop.length ? `<div class="list">${shop.map(s => {
        const f = inFridge(s.name);
        return `<div class="row ${s.done ? "done" : ""}"><input type="checkbox" data-shop="${s.id}" ${s.done ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--accent)" aria-label="${esc(s.name)} 샀어요">
          <div class="nm"><b>${esc(s.name)}</b>${f.length && !s.done ? `<small>⚠️ 냉장고에 이미 ${f.map(x => `${esc(x.name)} ${x.qty}${esc(x.unit)} (${NG.ddayLabel(NG.dday(x.exp))})`).join(", ")}</small>` : ""}</div>
          <div class="acts"><button class="btn" data-shop-del="${s.id}" aria-label="삭제">✕</button></div></div>`;
      }).join("")}</div>
      <div class="bar" style="margin-top:12px"><button class="btn primary" data-a="shop-move" ${done ? "" : "disabled"}>산 것 ${done}개 냉장고에 넣기</button><button class="btn" data-a="shop-clear" ${done ? "" : "disabled"}>산 것 지우기</button></div>`
      : `<div class="list"><div class="empty-box"><span class="big">🛒</span>장보기 목록이 비어 있어요.</div></div>`}`;
  };

  pages.share = () => {
    const items = NG.sorted(NG.items()).filter(x => { const d = NG.dday(x.exp); return d === null || d >= 0; });
    return `<h1>나눔</h1><p class="sub">혼자 다 먹기 어려운 재료는 기한이 지나기 전에 이웃·친구와 나눠요. 고른 재료로 나눔 글을 만들어 드려요. <b>날짜가 지난 음식은 목록에 나오지 않아요.</b></p>
      ${items.length ? `<div class="list" style="padding:4px 16px">${items.map(x => `<label class="ckrow"><input type="checkbox" data-sh="${x.id}" ${NG.dday(x.exp) !== null && NG.dday(x.exp) <= 3 ? "checked" : ""}><span class="grow">${NG.emoji(x)} ${esc(x.name)} <small style="color:var(--text-2)">${x.qty}${esc(x.unit)} · ${esc(x.place)}</small></span>${dp(x.exp)}</label>`).join("")}</div>
      <h2 class="h">나눔 글 미리 보기</h2>
      <textarea class="field" id="share-txt" rows="8"></textarea>
      <div class="bar" style="margin-top:10px"><button class="btn primary" data-a="copy">글 복사하기</button><button class="btn" data-a="shared">고른 재료 나눔 완료로 기록</button></div>
      <p class="note">개봉 여부와 보관 상태는 직접 확인해서 적어 주세요. 받는 분이 안심할 수 있도록 소비기한을 꼭 함께 알려 주세요.</p>`
      : `<div class="list"><div class="empty-box"><span class="big">🤝</span>나눌 수 있는 재료가 없어요.</div></div>`}`;
  };
  function shareText() {
    const ids = $$("[data-sh]:checked").map(x => x.dataset.sh), list = NG.items().filter(x => ids.includes(x.id));
    if (!list.length) return "나눌 재료를 위에서 골라 주세요.";
    return `[남김없이 나눔] 다 먹지 못할 것 같아서 나눠요 🙂\n\n${list.map(x => `- ${x.name} ${x.qty}${x.unit} (${x.place} 보관${x.exp ? `, 소비기한 ${NG.md(x.exp)}까지` : ""})`).join("\n")}\n\n상태: (개봉 여부를 적어 주세요)\n받는 곳: (장소/시간을 적어 주세요)\n필요하신 분 연락 주세요!`;
  }

  pages.stats = () => {
    const all = stats(0), m = stats(30);
    if (!all.t) return `<h1>기록</h1><div class="list"><div class="empty-box"><span class="big">📊</span>아직 기록이 없어요.<br>냉장고에서 <b>먹었어요 · 나눴어요 · 버렸어요</b>를 누르면 여기에 쌓여요.</div></div>`;
    // 최근 8주
    const weeks = [];
    for (let w = 7; w >= 0; w--) {
      const from = NG.addDays(-w * 7 - 6), to = NG.addDays(-w * 7);
      const l = all.l.filter(x => x.date >= from && x.date <= to);
      weeks.push({ label: w ? `${w}주 전` : "이번 주", e: l.filter(x => x.result === "eaten").length, s: l.filter(x => x.result === "shared").length, w: l.filter(x => x.result === "wasted").length });
    }
    const max = Math.max(1, ...weeks.map(x => x.e + x.s + x.w));
    const W = 640, H = 200, bw = 44, gap = (W - 40 - bw * 8) / 7;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 8주 기록 막대그래프">`;
    for (let g = 0; g <= 2; g++) { const y = 10 + (H - 40) * g / 2; svg += `<line x1="30" x2="${W}" y1="${y}" y2="${y}" stroke="var(--stroke-2)" stroke-width="1"/><text x="0" y="${y + 4}" font-size="11" fill="var(--text-2)">${Math.round(max * (1 - g / 2))}</text>`; }
    weeks.forEach((k, i) => {
      const x = 40 + i * (bw + gap); let y = H - 30;
      [["w", "#d13438"], ["s", "#0078d4"], ["e", "#2fbf71"]].forEach(([key, col]) => {
        const hh = (H - 40) * k[key] / max; if (!hh) return;
        y -= hh; svg += `<rect x="${x}" y="${y}" width="${bw}" height="${hh}" fill="${col}" rx="2"><title>${k.label}: ${{ e: "먹음", s: "나눔", w: "버림" }[key]} ${k[key]}건</title></rect>`;
      });
      svg += `<text x="${x + bw / 2}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--text-2)">${k.label}</text>`;
    });
    svg += `</svg>`;
    const wasted = all.l.filter(x => x.result === "wasted");
    const byCat = Object.entries(wasted.reduce((a, x) => (a[x.cat] = (a[x.cat] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
    const byName = Object.entries(wasted.reduce((a, x) => (a[x.name] = (a[x.name] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
    const first4 = weeks.slice(0, 4).reduce((a, k) => [a[0] + k.w, a[1] + k.e + k.s + k.w], [0, 0]);
    const last4 = weeks.slice(4).reduce((a, k) => [a[0] + k.w, a[1] + k.e + k.s + k.w], [0, 0]);
    const r1 = first4[1] ? first4[0] / first4[1] : null, r2 = last4[1] ? last4[0] / last4[1] : null;
    return `<h1>기록</h1><p class="sub">먹은 것, 나눈 것, 버린 것을 건수로 기록해요. 목표는 <b>버림 0건</b>!</p>
      <div class="tiles">
        <div class="tile"><small>최근 30일 지킨 음식</small><b>${m.e + m.s}<span>건</span></b></div>
        <div class="tile ${m.w ? "warn" : ""}"><small>최근 30일 버린 음식</small><b>${m.w}<span>건</span></b></div>
        <div class="tile"><small>최근 30일 지킨 비율</small><b>${m.rate ?? "-"}<span>${m.rate === null ? "" : "%"}</span></b></div>
        <div class="tile"><small>지금까지 나눔</small><b>${all.s}<span>건</span></b></div>
      </div>
      <h2 class="h">최근 8주</h2>
      <div class="chart">${svg}<div class="legend"><span><i style="background:#2fbf71"></i>먹음</span><span><i style="background:#0078d4"></i>나눔</span><span><i style="background:#d13438"></i>버림</span></div></div>
      ${r1 !== null && r2 !== null ? `<div class="card insight" style="margin-top:12px"><p>${r2 < r1 ? `👏 버리는 비율이 앞의 4주 <b>${Math.round(r1 * 100)}%</b>에서 최근 4주 <b>${Math.round(r2 * 100)}%</b>로 줄었어요.` : r2 > r1 ? `최근 4주 버리는 비율이 <b>${Math.round(r2 * 100)}%</b>로 앞의 4주(${Math.round(r1 * 100)}%)보다 늘었어요. 장보기 전에 냉장고를 먼저 확인해 보세요.` : `버리는 비율이 앞의 4주와 같아요(${Math.round(r2 * 100)}%).`}</p></div>` : ""}
      ${byCat.length ? `<h2 class="h">자주 버리는 분류</h2><div class="chart">${byCat.slice(0, 5).map(([c, n]) => `<div class="hbar"><span>${emo(c)} ${CATS[c] ? CATS[c][0] : "기타"}</span><span class="tr"><i style="width:${n / byCat[0][1] * 100}%"></i></span><b>${n}건</b></div>`).join("")}
        <p class="note">가장 많이 버린 재료는 <b>${esc(byName[0][0])}</b>(${byName[0][1]}건)이에요. 다음 장보기 때는 양을 줄이거나 작은 포장을 골라 보세요.</p></div>` : ""}`;
  };

  pages.data = () => `<h1>데이터</h1><p class="sub">모든 정보는 <b>이 브라우저에만</b> 저장되고 서버로 보내지 않아요. 기기를 바꿀 때는 백업 파일을 이용하세요.</p>
    <div class="st-row"><div class="grow">백업 파일 내려받기<small>냉장고·장보기·기록을 JSON 파일로 저장합니다</small></div><button class="btn" data-a="export">내려받기</button></div>
    <div class="st-row"><div class="grow">백업 파일 불러오기<small>현재 데이터를 백업 파일 내용으로 바꿉니다</small></div><label class="btn">파일 선택<input type="file" accept="application/json,.json" data-a="import" hidden></label></div>
    <div class="st-row"><div class="grow">예시 데이터 넣기<small>발표·체험용 예시 재료와 6주치 기록으로 바꿉니다</small></div><button class="btn" data-a="seed">넣기</button></div>
    <div class="st-row"><div class="grow">모두 지우기<small>냉장고, 장보기, 기록을 모두 지웁니다</small></div><button class="btn" data-a="wipe">지우기</button></div>`;

  /* ================= 라우팅/렌더 ================= */
  const PAGES = Object.keys(pages);
  let page = "home";
  function render() {
    const y = main.scrollTop;
    const keep = page === "share" ? $$("[data-sh]").reduce((a, x) => (a[x.dataset.sh] = x.checked, a), {}) : null;
    main.innerHTML = pages[page]();
    $$("#nav [data-p]").forEach(b => b.classList.toggle("cur", b.dataset.p === page));
    const urgent = NG.items().filter(x => { const d = NG.dday(x.exp); return d !== null && d <= 1; }).length;
    const nb = $("#nb-fridge"); nb.textContent = urgent; nb.classList.toggle("on", urgent > 0);
    if (page === "share" && $("#share-txt")) {
      if (keep) $$("[data-sh]").forEach(x => { if (x.dataset.sh in keep) x.checked = keep[x.dataset.sh]; });
      $("#share-txt").value = shareText();
    }
    main.scrollTop = y;
  }
  function go(p) {
    if (p === "add") { go("fridge"); itemDialog(); return; }
    if (!PAGES.includes(p)) p = "home";
    if (p !== page) main.scrollTop = 0;
    page = p;
    if (location.hash.slice(1) !== p) history.replaceState(null, "", "#" + p);
    render();
  }
  addEventListener("hashchange", () => go(location.hash.slice(1)));
  addEventListener("storage", e => { if (e.key && e.key.startsWith("namgim:") && e.key !== NamgimTheme.KEY) render(); });

  /* ================= 이벤트 ================= */
  $("#nav").addEventListener("click", e => { const b = e.target.closest("[data-p]"); b && go(b.dataset.p); });
  $("#fab").onclick = () => itemDialog();
  main.addEventListener("click", e => {
    const t = e.target.closest("button, [data-recipe]"); if (!t) return;
    const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.eat) return useItem(d.eat, "eaten");
    if (d.more) {
      const it = NG.items().find(x => x.id === d.more); if (!it) return;
      return menu(t, [
        ["🍽️", "전부 먹었어요", () => useItem(it.id, "eaten", true)],
        ["🤝", "나눴어요", () => useItem(it.id, "shared", true)],
        ["🗑️", "버렸어요", () => useItem(it.id, "wasted", true)],
        null,
        ["✏️", "수정", () => itemDialog(it)],
        ["↩️", "잘못 넣어서 삭제", () => removeItem(it.id)]
      ]);
    }
    if (d.recipe !== undefined) { const m = matchRecipes().find(x => x.r === R[+d.recipe]); return recipeDialog(m); }
    if (d.shopDel) { NG.set("shop", NG.get("shop", []).filter(s => s.id !== d.shopDel)); return render(); }
    const a = d.a;
    if (a === "add") itemDialog();
    if (a === "seed") { if (NG.get("started", false) && !confirm("지금 데이터를 예시 데이터로 바꿀까요?")) return; NG.seed(); toast("예시 데이터를 넣었어요"); go("home"); }
    if (a === "shop-add") addShopFromInput();
    if (a === "shop-clear") { NG.set("shop", NG.get("shop", []).filter(s => !s.done)); render(); }
    if (a === "shop-move") moveShop();
    if (a === "copy") {
      const txt = $("#share-txt").value;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("나눔 글을 복사했어요"), () => { $("#share-txt").select(); document.execCommand("copy"); toast("나눔 글을 복사했어요"); });
    }
    if (a === "shared") {
      const ids = $$("[data-sh]:checked").map(x => x.dataset.sh);
      if (!ids.length) return toast("나눈 재료를 골라 주세요");
      const snap = snapshot(), list = NG.items();
      ids.forEach(id => { const it = list.find(x => x.id === id); if (it) { NG.addLog(it, "shared", ["g", "ml"].includes(it.unit) ? 1 : it.qty); list.splice(list.indexOf(it), 1); } });
      NG.saveItems(list); toast(`${ids.length}개 나눔 완료! 고마워요`, () => restore(snap)); render();
    }
    if (a === "export") {
      const blob = new Blob([JSON.stringify({ app: "namgim", v: 1, at: new Date().toISOString(), ...snapshot() }, null, 2)], { type: "application/json" });
      const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = `남김없이-백업-${NG.ymd(new Date())}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
    }
    if (a === "wipe" && confirm("냉장고, 장보기, 기록을 모두 지울까요? 되돌릴 수 없어요.")) { restore({ items: [], log: [], shop: [] }); toast("모두 지웠어요"); render(); }
  });
  main.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.shop) { const shop = NG.get("shop", []); const s = shop.find(x => x.id === t.dataset.shop); s.done = t.checked; NG.set("shop", shop); render(); }
    if (t.dataset.sh) $("#share-txt").value = shareText();
    if (t.dataset.filter === "sort") { fridgeFilter.sort = t.value; render(); }
    if (t.dataset.a === "import" && t.files[0]) {
      t.files[0].text().then(txt => {
        const d = JSON.parse(txt);
        if (d.app !== "namgim" || !Array.isArray(d.items)) throw new Error();
        restore({ items: d.items, log: d.log || [], shop: d.shop || [] }); NG.set("started", true); toast("백업을 불러왔어요"); go("home");
      }).catch(() => toast("남김없이 백업 파일이 아니에요"));
    }
  });
  main.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.filter === "q") { fridgeFilter.q = t.value.trim(); const pos = t.selectionStart; render(); const n = $("[data-filter=q]"); n.focus(); n.setSelectionRange(pos, pos); }
    if (t.id === "shop-in") {
      const n = t.value.trim(), f = n ? inFridge(n) : [];
      $("#shop-hint").innerHTML = f.length ? `<div class="hint" style="margin:-4px 0 12px">냉장고에 이미 있어요: ${f.map(x => `${esc(x.name)} ${x.qty}${esc(x.unit)} (${NG.ddayLabel(NG.dday(x.exp))})`).join(", ")}</div>` : "";
    }
  });
  main.addEventListener("keydown", e => { if (e.target.id === "shop-in" && e.key === "Enter" && !e.isComposing) addShopFromInput(); });
  main.addEventListener("click", e => { const b = e.target.closest("[data-filter=place] button"); if (b) { fridgeFilter.place = b.dataset.v; render(); } });
  function addShopFromInput() {
    const i = $("#shop-in"), n = i.value.trim(); if (!n) return;
    addShop([n]); render(); $("#shop-in").focus();
  }
  function moveShop() {
    const done = NG.get("shop", []).filter(s => s.done);
    const guess = n => { const p = PRESETS.find(x => n.includes(x[0]) || NG.norm(n).includes(x[0])); return p || [n, "etc", "개"]; };
    const quick = [[3, "3일"], [7, "1주"], [14, "2주"], [30, "1달"]];
    dialog(`<div class="db"><h2>산 것 냉장고에 넣기</h2>
      <p class="note" style="margin:0 0 10px">포장지의 소비기한을 넣어 주세요. 비워 두면 '날짜 없음'으로 들어가요.</p>
      ${done.map(s => { const g = guess(s.name); return `<div class="ckrow" data-mv="${s.id}" style="flex-wrap:wrap"><span class="grow">${emo(g[1])} <b>${esc(s.name)}</b></span>
        <select class="field" data-k="place" style="width:80px">${PLACES.map(p => `<option>${p}</option>`).join("")}</select>
        <input class="field" type="date" data-k="exp" style="width:150px">
        <span style="width:100%;display:flex;gap:4px;justify-content:flex-end">${quick.map(([d, l]) => `<button type="button" class="chipbtn" data-d="${d}">+${l}</button>`).join("")}</span></div>`; }).join("")}
    </div><div class="df"><button class="btn primary" data-a="ok">냉장고에 넣기</button><button class="btn" data-close>취소</button></div>`, (box, close) => {
      box.addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) $("[data-k=exp]", b.closest("[data-mv]")).value = NG.addDays(+b.dataset.d); });
      $("[data-a=ok]", box).onclick = () => {
        const list = NG.items();
        $$("[data-mv]", box).forEach(r => {
          const s = done.find(x => x.id === r.dataset.mv), g = guess(s.name);
          list.push({ id: NG.uid(), name: s.name, cat: g[1], qty: g[2] === "g" ? 300 : 1, unit: g[2], place: $("[data-k=place]", r).value, exp: $("[data-k=exp]", r).value || null, added: NG.ymd(new Date()) });
        });
        NG.saveItems(list); NG.set("shop", NG.get("shop", []).filter(s => !s.done)); NG.set("started", true);
        close(); toast(`${done.length}개를 냉장고에 넣었어요`); render();
      };
    });
  }

  go(location.hash.slice(1) || "home");
})();
