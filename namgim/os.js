/* 남김없이 — Windows 11 스타일 데스크톱 셸 */
(() => {
  "use strict";

  /* ================= 유틸 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isMobile = () => window.innerWidth <= 700;
  const coarse = matchMedia("(pointer: coarse)");
  const CATS = NG.CATS;

  /* ================= 아이콘 (자체 제작) ================= */
  const I = {
    start: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ec4ff"/><stop offset="1" stop-color="#0a6fd6"/></linearGradient></defs><rect x="2.5" y="2.5" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="12.9" y="2.5" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="2.5" y="12.9" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="12.9" y="12.9" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/></svg>`,
    search: `<svg viewBox="0 0 24 24" style="stroke:currentColor;fill:none;stroke-width:1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/></svg>`,
    namgim: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd6ff"/><stop offset="1" stop-color="#2a8fe0"/></linearGradient></defs><rect x="4.5" y="2" width="15" height="20" rx="3" fill="url(#g-fr)"/><rect x="4.5" y="9" width="15" height="1.2" fill="#fff" opacity=".8"/><rect x="7" y="4.5" width="1.6" height="3" rx=".8" fill="#fff"/><rect x="7" y="12" width="1.6" height="4.5" rx=".8" fill="#fff"/><path d="M13 19.5c0-3 1.8-5 5.5-5.5-.3 3.6-2.2 5.5-5.5 5.5Z" fill="#2fbf71"/><path d="M13.3 19.2 16.5 16" stroke="#0f7b5f" stroke-width=".8" stroke-linecap="round"/></svg>`,
    plan: `<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13.5A1.5 1.5 0 0 1 18.5 22h-12A1.5 1.5 0 0 1 5 20.5v-17A1.5 1.5 0 0 1 6 2Z" fill="#fff" stroke="#9aa7b8" stroke-width=".8"/><path d="M15 2v5h5" fill="#dfe6ef"/><rect x="2.5" y="9" width="11" height="10" rx="1.6" fill="#2f6fd6"/><path d="M5 11.5h6M5 14h6M5 16.5h4" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/><path d="M15.5 12h2.5M15.5 15h2.5M15.5 18h2.5" stroke="#9aa7b8" stroke-width="1" stroke-linecap="round"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-se" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa8ba"/><stop offset="1" stop-color="#55627a"/></linearGradient></defs><path d="M10.3 2h3.4l.5 2.6 1.7.8 2.3-1.4 2.4 2.4-1.4 2.3.8 1.7 2.6.5v3.4l-2.6.5-.8 1.7 1.4 2.3-2.4 2.4-2.3-1.4-1.7.8-.5 2.6h-3.4l-.5-2.6-1.7-.8-2.3 1.4-2.4-2.4 1.4-2.3-.8-1.7L2 13.7v-3.4l2.6-.5.8-1.7L4 5.8l2.4-2.4 2.3 1.4 1.7-.8z" fill="url(#g-se)"/><circle cx="12" cy="12" r="3.6" fill="#eef2f7"/></svg>`,
    about: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0a6fd6"/><circle cx="12" cy="7.4" r="1.4" fill="#fff"/><rect x="10.8" y="10" width="2.4" height="8" rx="1.2" fill="#fff"/></svg>`
  };
  const ico = name => `<span class="ico">${I[name]}</span>`;
  const sv = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const S = {
    min: `<svg viewBox="0 0 10 10"><path d="M0 5h10"/></svg>`, max: `<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5"/></svg>`,
    restore: `<svg viewBox="0 0 10 10"><rect x=".5" y="2.5" width="7" height="7" rx="1.2"/><path d="M2.5 2.5V1.8A1.3 1.3 0 0 1 3.8.5h4.4A1.3 1.3 0 0 1 9.5 1.8v4.4a1.3 1.3 0 0 1-1.3 1.3H7.5"/></svg>`,
    close: `<svg viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg>`,
    lock: sv(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
    power: sv(`<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>`), restart: sv(`<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>`),
    refresh: sv(`<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>`), brush: sv(`<path d="M14 4l6 6-8 8H6v-6z"/>`),
    moon: sv(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>`),
    view: sv(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`),
    sys: sv(`<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`), info: sv(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>`),
    plus: sv(`<path d="M12 5v14M5 12h14"/>`)
  };

  /* ================= 설정 ================= */
  const KEY = NamgimTheme.KEY;
  const settings = Object.assign({ theme: "system", accent: null, wall: "bloom", motion: true, focus: false, lock: true }, NamgimTheme.read());
  const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 무시 */ } };
  const isDark = () => settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  function applySettings() {
    saveSettings();
    NamgimTheme.apply();
    document.body.classList.toggle("reduce-motion", !settings.motion);
    $("#icons").style.visibility = settings.focus ? "hidden" : "";
    $$(".qs").forEach(b => {
      const k = b.dataset.qs;
      b.classList.toggle("on", k === "theme" ? isDark() : k === "motion" ? settings.motion : k === "focus" ? settings.focus : false);
    });
    wins.forEach(w => w.sync && w.sync());
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

  /* ================= 배경화면 ================= */
  (function bloom() {
    let s = "";
    const petal = (rot, len, wid, fill, op) =>
      `<path transform="rotate(${rot})" d="M0 0 C ${-wid} ${-len * .3}, ${-wid * .8} ${-len * .85}, 0 ${-len} C ${wid * .8} ${-len * .85}, ${wid} ${-len * .3}, 0 0Z" fill="${fill}" opacity="${op}"/>`;
    for (let i = -5; i <= 5; i++) s += petal(i * 16, 470 - Math.abs(i) * 18, 130, i % 2 ? "url(#petalA)" : "url(#petalB)", .82);
    for (let i = -4; i <= 4; i++) s += petal(i * 18 + 8, 330 - Math.abs(i) * 14, 90, i % 2 ? "url(#petalB)" : "url(#petalA)", .9);
    $("#bloom").innerHTML = s;
  })();

  /* ================= 시계 ================= */
  function tick() {
    const d = new Date();
    $("#clock-t").textContent = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
    $("#clock-d").textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $("#lock-clock").textContent = `${d.getHours()}:${pad(d.getMinutes())}`;
    $("#lock-date").textContent = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  }
  tick(); setInterval(tick, 5000);

  /* ================= 냉장고 요약 (위젯·시작 메뉴·알림 공용) ================= */
  function fridge() {
    const items = NG.sorted(NG.items());
    const soon = items.filter(x => { const d = NG.dday(x.exp); return d !== null && d >= 0 && d <= 3; });
    const over = items.filter(x => { const d = NG.dday(x.exp); return d !== null && d < 0; });
    const from = NG.addDays(-29), l = NG.log().filter(x => x.date >= from);
    const kept = l.filter(x => x.result !== "wasted").length;
    return { items, soon, over, rate: l.length ? Math.round(kept / l.length * 100) : null, wasted: l.length - kept, kept };
  }
  const itemLine = it => `<button class="s-row" data-open="namgim" data-route="fridge"><span class="ico" style="font-size:22px">${NG.emoji(it)}</span><span>${esc(it.name)}<small>${it.qty}${esc(it.unit)} · ${esc(it.place)} · ${NG.ddayLabel(NG.dday(it.exp))}</small></span></button>`;

  /* ================= 알림 / 토스트 ================= */
  const notifs = [];
  function toast(title, body) {
    notifs.unshift({ title, body, t: new Date() });
    $("#notif-dot").classList.add("on");
    if (settings.focus) return;
    const el = h(`<div class="toast"><small>남김없이</small><b>${esc(title)}</b><div>${esc(body)}</div></div>`);
    el.onclick = () => openApp("namgim", "fridge");
    $("#toast").append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 220); }, 4500);
  }

  /* ================= 앱 정의 ================= */
  const APPS = {
    namgim: { title: "남김없이", icon: "namgim", w: 1120, h: 740, src: "namgim/app.html", desc: "냉장고 지킴이 서비스" },
    plan: { title: "남김없이 사업 기획서", icon: "plan", w: 920, h: 760, src: "namgim/plan.html", desc: "문제·SDG·수익 모델·로드맵" },
    settings: { title: "설정", icon: "settings", w: 900, h: 620, mount: mountSettings, desc: "테마·강조색·배경" },
    about: { title: "남김없이 정보", icon: "about", w: 560, h: 540, mount: mountAbout, desc: "프로젝트 소개와 출처" }
  };
  const PINNED = ["namgim", "plan", "settings"];
  const DESKTOP = [["namgim", "남김없이"], ["plan", "사업 기획서"], ["settings", "설정"], ["about", "정보"]];

  /* ================= 창 관리자 ================= */
  const wins = new Map();
  let zTop = 10, cascade = 0;
  const area = () => { const r = $("#desktop").getBoundingClientRect(); return { w: r.width, h: r.height }; };

  function openApp(id, route) {
    let w = wins.get(id);
    if (w) {
      if (w.min) restoreWin(w);
      focusWin(w);
      if (route && w.frame) w.frame.contentWindow.location.hash = route;
      return w;
    }
    const app = APPS[id];
    const el = h(`<section class="win" role="dialog" aria-label="${esc(app.title)}">
      <header class="titlebar">${ico(app.icon)}<span class="title-text">${esc(app.title)}</span>
        <button class="wc min" aria-label="최소화" title="최소화">${S.min}</button>
        <button class="wc max" aria-label="최대화" title="최대화">${S.max}</button>
        <button class="wc close" aria-label="닫기" title="닫기">${S.close}</button>
      </header>
      <div class="win-body"></div>
      ${["n", "s", "e", "w", "ne", "nw", "se", "sw"].map(d => `<div class="rz ${d}" data-d="${d}"></div>`).join("")}
    </section>`);
    const A = area();
    const ww = Math.min(app.w, A.w - 32), hh = Math.min(app.h, A.h - 24);
    const off = (cascade++ % 6) * 28;
    w = { id, el, app, x: clamp((A.w - ww) / 2 - 60 + off, 8, Math.max(8, A.w - ww)), y: clamp((A.h - hh) / 2 - 30 + off, 4, Math.max(4, A.h - hh)), w: ww, h: hh, max: false, min: false };
    wins.set(id, w);
    place(w);
    $("#windows").append(el);
    wireWin(w);
    const body = $(".win-body", el);
    if (app.src) {
      w.frame = h(`<iframe title="${esc(app.title)}" src="${app.src}${route ? "#" + route : ""}"></iframe>`);
      body.append(w.frame);
    } else app.mount(body, w);
    focusWin(w);
    renderTaskbar();
    bounce(id);
    return w;
  }
  function place(w) {
    const s = w.el.style;
    if (w.max) { s.left = "0px"; s.top = "0px"; s.width = "100%"; s.height = "100%"; }
    else { s.left = w.x + "px"; s.top = w.y + "px"; s.width = w.w + "px"; s.height = w.h + "px"; }
    const mb = $(".wc.max", w.el);
    mb.innerHTML = w.max ? S.restore : S.max;
    mb.title = w.max ? "이전 크기로 복원" : "최대화";
    w.el.classList.toggle("max", w.max);
  }
  function animate(w, fn) {
    if (!settings.motion) return fn();
    w.el.classList.add("anim"); fn();
    setTimeout(() => w.el.classList.remove("anim"), 220);
  }
  function focusWin(w) {
    wins.forEach(o => o.el.classList.remove("focused"));
    if (w) { w.el.style.zIndex = ++zTop; w.el.classList.add("focused"); }
    renderTaskbar();
  }
  function topWin() {
    let best = null;
    wins.forEach(o => { if (!o.min && (!best || +o.el.style.zIndex > +best.el.style.zIndex)) best = o; });
    return best;
  }
  function closeWin(w) {
    w.el.classList.add("closing");
    wins.delete(w.id);
    setTimeout(() => w.el.remove(), settings.motion ? 140 : 0);
    focusWin(topWin());
  }
  function minimizeWin(w) {
    const btn = $(`#tb-apps [data-app="${w.id}"]`);
    w.min = true;
    if (btn && settings.motion) {
      const b = btn.getBoundingClientRect(), r = w.el.getBoundingClientRect();
      w.el.style.transformOrigin = "0 0";
      w.el.style.transform = `translate(${b.left + b.width / 2 - r.left - r.width * .1}px, ${b.top - r.top}px) scale(.2)`;
      w.el.classList.add("minimizing");
      setTimeout(() => { if (w.min) w.el.hidden = true; }, 230);
    } else w.el.hidden = true;
    focusWin(topWin());
  }
  function restoreWin(w) {
    w.min = false; w.el.hidden = false;
    requestAnimationFrame(() => { w.el.classList.remove("minimizing"); w.el.style.transform = ""; });
  }
  function toggleMax(w) { if (!isMobile()) animate(w, () => { w.max = !w.max; place(w); }); }
  function snapTo(w, x, y, ww, hh) {
    const A = area();
    animate(w, () => { w.max = false; w.x = x * A.w; w.y = y * A.h; w.w = ww * A.w; w.h = hh * A.h; place(w); });
  }
  // iframe 안을 클릭하면 그 창으로 포커스
  window.addEventListener("blur", () => setTimeout(() => {
    const f = document.activeElement;
    if (f && f.tagName === "IFRAME") { const w = [...wins.values()].find(o => o.frame === f); if (w && !w.el.classList.contains("focused")) focusWin(w); closeFlyouts(); hideCtx(); }
  }));

  function wireWin(w) {
    const el = w.el, tb = $(".titlebar", el);
    el.addEventListener("pointerdown", () => focusWin(w), true);
    $(".wc.close", el).onclick = () => closeWin(w);
    $(".wc.min", el).onclick = () => minimizeWin(w);
    const mb = $(".wc.max", el);
    let snapT, flyout;
    const hideSnap = () => { clearTimeout(snapT); flyout && flyout.remove(); flyout = null; };
    mb.onclick = () => { hideSnap(); toggleMax(w); };
    mb.addEventListener("pointerenter", e => {
      if (e.pointerType !== "mouse" || isMobile()) return;
      snapT = setTimeout(() => {
        flyout = h(`<div class="snap-flyout">
          <div class="snap-opt"><i data-s="0,0,.5,1"></i><i data-s=".5,0,.5,1"></i></div>
          <div class="snap-opt"><i class="wide" data-s="0,0,.667,1"></i><i data-s=".667,0,.333,1"></i></div>
          <div class="snap-opt"><i data-s="0,0,.333,1"></i><i data-s=".333,0,.334,1"></i><i data-s=".667,0,.333,1"></i></div>
        </div>`);
        flyout.addEventListener("click", ev => {
          const s = ev.target.dataset.s; if (!s) return;
          const [x, y, ww, hh] = s.split(",").map(Number); snapTo(w, x, y, ww, hh); hideSnap();
        });
        flyout.addEventListener("pointerleave", hideSnap);
        el.append(flyout);
      }, 450);
    });
    mb.addEventListener("pointerleave", e => { clearTimeout(snapT); if (flyout && !flyout.contains(e.relatedTarget)) hideSnap(); });

    tb.addEventListener("dblclick", e => { if (!e.target.closest(".wc")) toggleMax(w); });
    tb.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest(".wc") || isMobile()) return;
      const A = area(), sx = e.clientX, sy = e.clientY;
      let ox = w.x, oy = w.y, moved = false, zone = null;
      const prev = $("#snap-preview");
      tb.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved && w.max) { w.max = false; ox = clamp(ev.clientX - w.w * (sx / A.w), 0, A.w - w.w); oy = 0; place(w); }
        moved = true;
        w.x = clamp(ox + dx, -w.w + 80, A.w - 80); w.y = clamp(oy + dy, 0, A.h - 40);
        place(w);
        zone = ev.clientY <= 2 ? [0, 0, 1, 1] : ev.clientX <= 2 ? [0, 0, .5, 1] : ev.clientX >= window.innerWidth - 3 ? [.5, 0, .5, 1] : null;
        if (zone) Object.assign(prev.style, { left: zone[0] * A.w + 8 + "px", top: "8px", width: zone[2] * A.w - 16 + "px", height: A.h - 16 + "px" });
        prev.classList.toggle("on", !!zone);
      };
      const up = () => {
        tb.removeEventListener("pointermove", move); tb.removeEventListener("pointerup", up); tb.removeEventListener("pointercancel", up);
        document.body.classList.remove("dragging");
        prev.classList.remove("on");
        if (zone) { if (zone[2] === 1) animate(w, () => { w.max = true; place(w); }); else snapTo(w, ...zone); }
      };
      tb.addEventListener("pointermove", move); tb.addEventListener("pointerup", up); tb.addEventListener("pointercancel", up);
    });

    $$(".rz", el).forEach(hd => hd.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const d = hd.dataset.d, sx = e.clientX, sy = e.clientY, o = { x: w.x, y: w.y, w: w.w, h: w.h };
      hd.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (d.includes("e")) w.w = Math.max(340, o.w + dx);
        if (d.includes("s")) w.h = Math.max(240, o.h + dy);
        if (d.includes("w")) { w.w = Math.max(340, o.w - dx); w.x = o.x + o.w - w.w; }
        if (d.includes("n")) { w.h = Math.max(240, o.h - dy); w.y = Math.max(0, o.y + o.h - w.h); }
        place(w);
      };
      const up = () => { hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); document.body.classList.remove("dragging"); };
      hd.addEventListener("pointermove", move); hd.addEventListener("pointerup", up);
    }));
  }

  /* ================= 작업 표시줄 ================= */
  $("#tb-start").innerHTML = ico("start");
  $("#tb-search").innerHTML = `<span class="ico" style="color:var(--text)">${I.search}</span>`;
  function renderTaskbar() {
    const ids = [...PINNED, ...[...wins.keys()].filter(k => !PINNED.includes(k))];
    const top = topWin();
    $("#tb-apps").innerHTML = ids.map(id => {
      const w = wins.get(id);
      const cls = ["tb-btn", w ? "open" : "", w && top === w && w.el.classList.contains("focused") ? "active" : ""].join(" ");
      return `<button class="${cls}" data-app="${id}" title="${esc(APPS[id].title)}" aria-label="${esc(APPS[id].title)}">${ico(APPS[id].icon)}</button>`;
    }).join("");
  }
  function bounce(id) {
    const b = $(`#tb-apps [data-app="${id}"]`); if (!b || !settings.motion) return;
    b.classList.add("bounce"); setTimeout(() => b.classList.remove("bounce"), 500);
  }
  $("#tb-apps").addEventListener("click", e => {
    const b = e.target.closest("[data-app]"); if (!b) return;
    closeFlyouts();
    const id = b.dataset.app, w = wins.get(id);
    if (!w) return openApp(id);
    if (w.min) { restoreWin(w); focusWin(w); }
    else if (w.el.classList.contains("focused")) minimizeWin(w);
    else focusWin(w);
  });
  $("#tb-apps").addEventListener("contextmenu", e => {
    const b = e.target.closest("[data-app]"); if (!b) return;
    e.preventDefault();
    const id = b.dataset.app, w = wins.get(id), r = b.getBoundingClientRect();
    showCtx(r.left, r.top - 8, [
      [ico(APPS[id].icon), APPS[id].title, () => openApp(id)],
      ...(id === "namgim" ? [[S.plus, "재료 추가", () => openApp("namgim", "add")]] : []),
      ...(w ? [null, [S.close, "창 닫기", () => closeWin(w)]] : [])
    ], true);
  });

  /* ================= 플라이아웃 ================= */
  const FLY = { start: "#start", widgets: "#widgets", quick: "#quick", calendar: "#calendar" };
  function closeFlyouts(except) {
    Object.entries(FLY).forEach(([k, sel]) => {
      if (k === except) return;
      const el = $(sel);
      if (el.hidden) return;
      if (!settings.motion) { el.hidden = true; return; }
      el.classList.add("closing");
      setTimeout(() => { el.hidden = true; el.classList.remove("closing"); }, 140);
    });
  }
  function toggleFly(name, after) {
    const el = $(FLY[name]);
    if (!el.hidden && !el.classList.contains("closing")) { closeFlyouts(); return; }
    closeFlyouts(name); hideCtx();
    el.classList.remove("closing"); el.hidden = false;
    ({ start: renderStart, widgets: renderWidgets, calendar: renderCalendar }[name] || (() => {}))();
    after && after();
  }
  $("#tb-start").onclick = () => toggleFly("start");
  $("#tb-search").onclick = () => toggleFly("start", () => $("#start-q").focus());
  $("#tb-widgets").onclick = () => toggleFly("widgets");
  $("#tray-quick").onclick = () => toggleFly("quick");
  $("#tray-clock").onclick = () => toggleFly("calendar");
  document.addEventListener("pointerdown", e => {
    if (!e.target.closest(".flyout, #taskbar, .ctx, #calendar")) closeFlyouts();
    if (!e.target.closest(".ctx")) hideCtx();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeFlyouts(); hideCtx(); } });

  // 공통 클릭: data-open(+data-route)
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-open]");
    if (o && !o.closest(".win")) { closeFlyouts(); openApp(o.dataset.open, o.dataset.route); }
  });

  /* ---------- 시작 메뉴 ---------- */
  function renderStart() {
    $("#start-q").value = ""; $("#start-body").hidden = false; $("#start-results").hidden = true;
    $("#start-pinned").innerHTML = Object.entries(APPS).map(([id, a]) => `<button class="s-app" data-open="${id}">${ico(a.icon)}<span>${esc(a.title)}</span></button>`).join("")
      + `<button class="s-app" data-open="namgim" data-route="add"><span class="ico" style="font-size:26px">➕</span><span>재료 추가</span></button>`
      + `<button class="s-app" data-open="namgim" data-route="cook"><span class="ico" style="font-size:26px">🍳</span><span>오늘 뭐 먹지</span></button>`;
    const f = fridge();
    const rec = [...f.over, ...f.soon].slice(0, 6);
    $("#start-apps").innerHTML = rec.length ? rec.map(itemLine).join("")
      : `<div class="empty" style="grid-column:1/-1;padding:8px 10px">${f.items.length ? "3일 안에 기한이 끝나는 재료가 없어요. 잘하고 있어요! 👏" : "남김없이를 열어 냉장고 재료를 넣어 보세요."}</div>`;
  }
  function hl(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  $("#start-q").addEventListener("input", e => {
    const q = e.target.value.trim(), res = $("#start-results");
    $("#start-body").hidden = !!q; res.hidden = !q;
    if (!q) return;
    const apps = Object.entries(APPS).filter(([, a]) => (a.title + a.desc).includes(q));
    const items = NG.sorted(NG.items()).filter(x => NG.norm(x.name).includes(q));
    const recs = (window.RECIPES || []).filter(r => r.name.includes(q) || [...r.need, ...r.opt].includes(q));
    res.innerHTML = `<div class="start-head"><h2>검색 결과</h2></div>` +
      (apps.length + items.length + recs.length ? apps.map(([id, a]) => `<button class="list-row s-row" data-open="${id}">${ico(a.icon)}<span>${hl(a.title, q)}<small>앱 · ${esc(a.desc)}</small></span></button>`).join("")
        + items.map(it => `<button class="list-row s-row" data-open="namgim" data-route="fridge"><span class="ico" style="font-size:22px">${NG.emoji(it)}</span><span>${hl(it.name, q)}<small>냉장고 · ${it.qty}${esc(it.unit)} · ${NG.ddayLabel(NG.dday(it.exp))}</small></span></button>`).join("")
        + recs.map(r => `<button class="list-row s-row" data-open="namgim" data-route="cook"><span class="ico" style="font-size:22px">${r.emoji}</span><span>${hl(r.name, q)}<small>요리 · ${r.min}분</small></span></button>`).join("")
        : `<div class="empty">"${esc(q)}"에 대한 결과가 없습니다.</div>`);
  });
  $("#start-q").addEventListener("keydown", e => { if (e.key === "Enter") { const f = $("#start-results [data-open]"); f && f.click(); } });
  $("#power").onclick = e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    showCtx(r.left - 160, r.top - 8, [[S.lock, "잠금", lock], [S.restart, "다시 시작", () => shutdown(true)], [S.power, "시스템 종료", () => shutdown(false)]], true);
  };

  /* ---------- 위젯 ---------- */
  function renderWidgets() {
    const d = new Date(), f = fridge(), C = 2 * Math.PI * 46;
    $("#widgets").innerHTML = `
      <p class="wg-time">${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })} · ${d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</p>
      <div class="wg-grid">
        <div class="wg wide wg-goal" style="background:linear-gradient(135deg,#0f7b5f,#2fbf71)">
          <h3>🧊 먼저 먹어야 할 것</h3>
          ${f.items.length ? `<ul class="wg-list wg-white">${f.items.slice(0, 4).map(it => `<li><b>${esc(it.name)}</b> — ${NG.ddayLabel(NG.dday(it.exp))}</li>`).join("")}</ul>` : `<p>아직 냉장고에 넣은 재료가 없어요.</p>`}
          <button data-open="namgim" data-route="fridge" style="margin-top:12px">냉장고 열기</button>
          <button data-open="namgim" data-route="cook" style="margin-top:12px">이 재료로 요리 추천</button>
        </div>
        <div class="wg"><h3>최근 30일 지킨 비율</h3>
          <div class="wg-ring"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" fill="none" stroke="var(--stroke-2)" stroke-width="9"/>
            <circle cx="55" cy="55" r="46" fill="none" stroke="#2fbf71" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * (f.rate || 0) / 100} ${C}" transform="rotate(-90 55 55)"/>
            <text x="55" y="61" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="inherit">${f.rate === null ? "-" : f.rate + "%"}</text></svg></div>
          <p style="margin:6px 0 0;font-size:12px;color:var(--text-2);text-align:center">먹음·나눔 ${f.kept}건 / 버림 ${f.wasted}건</p>
        </div>
        <div class="wg"><h3>알고 계셨나요?</h3><p style="margin:0;font-size:13px;line-height:1.6">2022년 전 세계에서 버려진 음식의 <b>60%</b>가 가정에서 나왔어요.</p>
          <p style="margin:6px 0 0;font-size:11px;color:var(--text-2)">출처: UNEP Food Waste Index Report 2024</p></div>
        <div class="wg wide"><h3>📄 사업 기획서</h3><p style="margin:0 0 10px;font-size:13px;line-height:1.6">남김없이가 어떤 문제를 풀고, 어떤 SDG에 기여하며, 어떻게 돈을 벌지 정리했어요.</p>
          <button class="btn" data-open="plan">기획서 열기</button></div>
      </div>`;
  }

  /* ---------- 달력 / 알림 ---------- */
  function renderCalendar() {
    $("#notif-dot").classList.remove("on");
    $("#notifs").innerHTML = `<h3>알림 <button id="clear-n">모두 지우기</button></h3>` +
      (notifs.length ? notifs.map(n => `<div class="notif"><b>${esc(n.title)}</b>${esc(n.body)}<br><small>${n.t.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}</small></div>`).join("")
        : `<div class="empty" style="padding:12px 4px">새 알림 없음</div>`);
    $("#clear-n").onclick = () => { notifs.length = 0; renderCalendar(); };
    const d = new Date(), y = d.getFullYear(), m = d.getMonth();
    $("#cal-title").textContent = `${y}년 ${m + 1}월`;
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), prevDays = new Date(y, m, 0).getDate();
    // 이번 달 소비기한이 있는 날 표시
    const expDays = new Set(NG.items().filter(x => x.exp && x.exp.startsWith(`${y}-${pad(m + 1)}`)).map(x => +x.exp.slice(8)));
    let s = ["일", "월", "화", "수", "목", "금", "토"].map(x => `<span class="dow">${x}</span>`).join("");
    for (let i = first - 1; i >= 0; i--) s += `<span class="other">${prevDays - i}</span>`;
    for (let i = 1; i <= days; i++) s += `<span class="${i === d.getDate() ? "today" : ""} ${expDays.has(i) ? "has-exp" : ""}" ${expDays.has(i) ? `title="소비기한인 재료가 있어요"` : ""}>${i}</span>`;
    const rest = (7 - (first + days) % 7) % 7;
    for (let i = 1; i <= rest; i++) s += `<span class="other">${i}</span>`;
    $("#cal-grid").innerHTML = s;
  }

  /* ---------- 빠른 설정 ---------- */
  const WALLS = ["bloom", "sunset", "forest"];
  $("#quick").addEventListener("click", e => {
    const b = e.target.closest(".qs"); if (!b) return;
    const k = b.dataset.qs;
    if (k === "theme") settings.theme = isDark() ? "light" : "dark";
    if (k === "motion") settings.motion = !settings.motion;
    if (k === "focus") settings.focus = !settings.focus;
    if (k === "wall") settings.wall = WALLS[(WALLS.indexOf(settings.wall) + 1) % WALLS.length];
    applySettings();
  });
  const dim = h(`<div id="dim"></div>`); document.body.append(dim);
  $("#bright").addEventListener("input", e => { dim.style.opacity = (100 - e.target.value) / 100; });

  /* ================= 우클릭 메뉴 ================= */
  function showCtx(x, y, items, above) {
    const m = $("#ctx");
    m.innerHTML = ""; m.hidden = false;
    items.forEach(it => {
      if (!it) return m.append(h("<hr>"));
      const b = h(`<button>${it[0]}<span>${esc(it[1])}</span></button>`);
      b.onclick = () => { hideCtx(); closeFlyouts(); it[2](); };
      m.append(b);
    });
    const r = m.getBoundingClientRect();
    m.style.left = clamp(x, 4, window.innerWidth - r.width - 4) + "px";
    m.style.top = clamp(above ? y - r.height : y, 4, window.innerHeight - r.height - 4) + "px";
  }
  function hideCtx() { $("#ctx").hidden = true; }
  $("#desktop").addEventListener("contextmenu", e => {
    if (e.target.closest(".win")) return;
    e.preventDefault();
    showCtx(e.clientX, e.clientY, [
      [S.plus, "재료 추가", () => openApp("namgim", "add")],
      [S.view, "아이콘 새로 정렬", () => renderIcons(true)],
      [S.refresh, "새로 고침", () => location.reload()],
      null,
      [S.brush, "다음 배경 화면", () => { settings.wall = WALLS[(WALLS.indexOf(settings.wall) + 1) % WALLS.length]; applySettings(); }],
      [S.moon, isDark() ? "밝은 테마로 전환" : "어두운 테마로 전환", () => { settings.theme = isDark() ? "light" : "dark"; applySettings(); }],
      null,
      [ico("settings"), "개인 설정", () => openApp("settings")]
    ]);
  });

  /* ================= 바탕화면 아이콘 ================= */
  function renderIcons(anim) {
    const box = $("#icons");
    box.innerHTML = DESKTOP.map(([id, label]) => `<button class="d-icon" role="listitem" data-app="${id}">${ico(APPS[id].icon)}<span>${esc(label)}</span></button>`).join("");
    if (anim && settings.motion) $$(".d-icon", box).forEach((b, i) => b.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 250, delay: i * 40, fill: "backwards" }));
  }
  renderIcons();
  $("#icons").addEventListener("click", e => {
    const b = e.target.closest(".d-icon"); if (!b) return;
    $$(".d-icon").forEach(x => x.classList.toggle("sel", x === b));
    if (coarse.matches) openApp(b.dataset.app);
  });
  $("#icons").addEventListener("dblclick", e => { const b = e.target.closest(".d-icon"); if (b) openApp(b.dataset.app); });
  $("#icons").addEventListener("keydown", e => { const b = e.target.closest(".d-icon"); if (b && e.key === "Enter") { e.preventDefault(); openApp(b.dataset.app); } });
  $("#desktop").addEventListener("pointerdown", e => { if (!e.target.closest(".d-icon, .win")) $$(".d-icon").forEach(x => x.classList.remove("sel")); });

  /* ================= 앱: 설정 ================= */
  function mountSettings(body, w) {
    body.innerHTML = `<div class="st">
      <nav class="st-nav scroll">
        <div class="st-user"><span class="avatar">🧊</span><div><b>우리 집</b><small>남김없이 사용자</small></div></div>
        <button data-p="personal">${S.brush}개인 설정</button>
        <button data-p="system">${S.sys}시스템</button>
      </nav>
      <div class="st-main scroll"></div>
    </div>`;
    const main = $(".st-main", body);
    const ACCENTS = [[null, "기본"], ["#2FBF71", "남김없이 초록"], ["#BF8B2E", "SDG 12"], ["#3F7E44", "SDG 13"], ["#DDA63A", "SDG 2"], ["#E5243B", "빨강"], ["#8764B8", "보라"]];
    let cur = "personal";
    function page(p) {
      cur = p;
      $$(".st-nav [data-p]", body).forEach(b => b.classList.toggle("cur", b.dataset.p === p));
      if (p === "personal") {
        main.innerHTML = `<h1>개인 설정</h1>
          <div class="st-row">${S.moon}<div class="grow">모드 선택<small>바탕화면과 모든 앱 창의 색이 함께 바뀝니다</small></div>
            <div class="seg">${[["light", "밝게"], ["dark", "어둡게"], ["system", "시스템"]].map(([k, l]) => `<button data-theme="${k}" class="${settings.theme === k ? "cur" : ""}">${l}</button>`).join("")}</div></div>
          <div class="st-row">${S.brush}<div class="grow">강조 색
            <div class="swatches" style="margin-top:10px">${ACCENTS.map(([c, t]) => `<button data-accent="${c || ""}" title="${t}" class="${(settings.accent || "") === (c || "") ? "cur" : ""}" style="background:${c || "linear-gradient(135deg,#0067C0 50%,#4CC2FF 50%)"}"></button>`).join("")}</div></div></div>
          <div class="st-row">${S.view}<div class="grow">배경 화면
            <div class="walls" style="margin-top:10px">${[["bloom", "#2f7fe0", "#c9ddf4"], ["sunset", "#e5243b", "#f6d2c4"], ["forest", "#3f7e44", "#cfe8cf"]].map(([k, a, b]) => `<button data-wall="${k}" class="${settings.wall === k ? "cur" : ""}" style="background:radial-gradient(circle at 50% 110%, ${a} 0 35%, ${b} 70%)" aria-label="${k}"></button>`).join("")}</div></div></div>`;
      } else {
        const tg = (k, t, d) => `<div class="st-row"><div class="grow">${t}<small>${d}</small></div><button class="toggle ${settings[k] ? "on" : ""}" data-tg="${k}" role="switch" aria-checked="${settings[k]}" aria-label="${t}"></button></div>`;
        main.innerHTML = `<h1>시스템</h1>
          ${tg("motion", "애니메이션 효과", "창 열기·최소화 등 움직임 효과")}
          ${tg("focus", "집중 모드", "알림 팝업과 바탕화면 아이콘을 숨깁니다")}
          ${tg("lock", "시작할 때 잠금 화면", "페이지를 열 때 잠금 화면을 보여줍니다")}`;
      }
    }
    w.sync = () => page(cur);
    body.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.p) return page(t.dataset.p);
      if (t.dataset.theme) settings.theme = t.dataset.theme;
      else if (t.dataset.accent !== undefined) settings.accent = t.dataset.accent || null;
      else if (t.dataset.wall) settings.wall = t.dataset.wall;
      else if (t.dataset.tg) settings[t.dataset.tg] = !settings[t.dataset.tg];
      else return;
      applySettings();
    });
    page("personal");
  }

  /* ================= 앱: 정보 ================= */
  function mountAbout(body) {
    body.innerHTML = `<div class="about scroll" style="flex:1;user-select:text">
      <div class="logo">${ico("namgim")}<div><b>남김없이</b><div style="color:var(--text-2)">우리 집 냉장고 지킴이</div></div></div>
      <p><b>남김없이</b>는 SDGs 목표 12(책임 있는 소비와 생산)의 세부목표 12.3, 가정의 음식물 쓰레기 줄이기를 위한 서비스입니다. 냉장고 재료의 소비기한을 챙기고, 급한 재료로 요리를 추천하고, 남는 음식은 나누고, 버린 양을 기록해 줄어드는 것을 보여 줍니다.</p>
      <hr>
      <b>구성</b>
      <ul>
        <li><a href="#" data-open="namgim">남김없이 서비스</a> — 실제로 쓸 수 있는 웹 서비스 (<a href="namgim/app.html" target="_blank" rel="noopener">새 탭에서 열기</a>)</li>
        <li><a href="#" data-open="plan">사업 기획서</a> — 문제, SDG, 고객, 수익 모델, 로드맵</li>
      </ul>
      <p>창은 제목 표시줄을 끌어 옮기고, 화면 위·왼쪽·오른쪽 끝으로 끌면 스냅됩니다. 데이터는 이 브라우저에만 저장됩니다.</p>
      <hr>
      <b>출처</b>
      <ul>
        <li><a href="https://www.unep.org/resources/publication/food-waste-index-report-2024" target="_blank" rel="noopener">UNEP Food Waste Index Report 2024</a></li>
        <li><a href="https://sdgs.un.org/goals/goal12" target="_blank" rel="noopener">UN SDG Goal 12</a></li>
      </ul>
      <p style="color:var(--text-2);font-size:12px">Windows 11의 디자인 느낌을 참고해 만든 학습용 프로젝트이며 Microsoft와 관련이 없습니다.</p>
    </div>`;
    body.addEventListener("click", e => { const a = e.target.closest("a[data-open]"); if (a) { e.preventDefault(); openApp(a.dataset.open); } });
  }

  /* ================= 잠금 / 종료 ================= */
  function lock() { closeFlyouts(); tick(); $("#lock").classList.remove("gone"); }
  function boot() {
    if (boot.done) return; boot.done = true;
    if (!isMobile()) openApp("namgim");
    setTimeout(() => {
      const f = fridge();
      if (f.over.length) toast("날짜가 지난 재료가 있어요", `${f.over.map(x => x.name).join(", ")} — 상태를 확인해 주세요.`);
      if (f.soon.length) toast(`3일 안에 먹어야 할 재료 ${f.soon.length}개`, f.soon.map(x => `${x.name}(${NG.ddayLabel(NG.dday(x.exp))})`).join(", "));
      if (!f.items.length) toast("남김없이에 오신 것을 환영합니다", "냉장고 재료를 넣거나 예시 데이터로 체험해 보세요.");
    }, 700);
  }
  function unlock() {
    const l = $("#lock"); if (l.classList.contains("gone")) return;
    l.classList.add("gone"); boot();
  }
  $("#lock").addEventListener("click", unlock);
  document.addEventListener("keydown", e => { if (!$("#lock").classList.contains("gone") && !e.ctrlKey && !e.metaKey) unlock(); });
  let ty = null;
  $("#lock").addEventListener("touchstart", e => { ty = e.touches[0].clientY; }, { passive: true });
  $("#lock").addEventListener("touchmove", e => { if (ty !== null && ty - e.touches[0].clientY > 40) { unlock(); ty = null; } }, { passive: true });
  function shutdown(restart) {
    const s = $("#shutdown"); s.hidden = false;
    $("p", s).textContent = restart ? "다시 시작하는 중..." : "종료하는 중...";
    setTimeout(() => {
      if (restart) return location.reload();
      s.innerHTML = `<p>남은 음식은 없나요? 이제 꺼도 좋습니다.</p><button class="btn primary">다시 켜기</button>`;
      $("button", s).onclick = () => location.reload();
    }, 1800);
  }

  function updateBadge() {
    const f = fridge();
    $("#w-sub").textContent = f.over.length + f.soon.length ? `임박 ${f.over.length + f.soon.length}개` : f.items.length ? "모두 여유 있어요" : "재료를 넣어 보세요";
  }
  updateBadge();
  // 다른 창(앱)에서 데이터가 바뀌면 열려 있는 패널 갱신
  addEventListener("storage", e => {
    if (!e.key || !e.key.startsWith("namgim:") || e.key === KEY) return;
    updateBadge();
    if (!$("#widgets").hidden) renderWidgets();
    if (!$("#start").hidden && !$("#start-q").value) renderStart();
  });

  /* ================= 시작 ================= */
  applySettings();
  renderTaskbar();
  const params = new URLSearchParams(location.search);
  if (!settings.lock || params.has("nolock")) { $("#lock").classList.add("gone"); boot(); }
  window.addEventListener("resize", () => {
    const A = area();
    wins.forEach(w => { w.w = Math.min(w.w, A.w); w.h = Math.min(w.h, A.h); w.x = clamp(w.x, 0, Math.max(0, A.w - w.w)); w.y = clamp(w.y, 0, Math.max(0, A.h - w.h)); place(w); });
  });
})();
