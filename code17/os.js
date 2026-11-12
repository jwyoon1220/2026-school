/* Code17 — Windows 11 스타일 데스크톱 셸 */
(() => {
  "use strict";

  /* ================= 유틸 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("code17:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("code17:" + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } }
  };
  const G = window.SDGS, P = window.PRINCIPLES;
  const isMobile = () => window.innerWidth <= 700;
  const coarse = matchMedia("(pointer: coarse)");
  const root = document.documentElement;

  /* ================= 아이콘 (자체 제작) ================= */
  const I = {
    start: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ec4ff"/><stop offset="1" stop-color="#0a6fd6"/></linearGradient></defs><rect x="2.5" y="2.5" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="12.9" y="2.5" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="2.5" y="12.9" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/><rect x="12.9" y="12.9" width="8.6" height="8.6" rx="2.2" fill="url(#g-st)"/></svg>`,
    search: `<svg viewBox="0 0 24 24" style="stroke:currentColor;fill:none;stroke-width:1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/></svg>`,
    explorer: `<svg viewBox="0 0 24 24"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4h5l2 2h8A2.5 2.5 0 0 1 22 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5z" fill="#E8A33D"/><rect x="2" y="8" width="20" height="12" rx="2.5" fill="#FFC83D"/><rect x="2" y="8" width="20" height="2" rx="1" fill="#FFD86B"/></svg>`,
    notepad: `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="#fff" stroke="#9aa7b8" stroke-width=".8"/><rect x="4" y="3" width="16" height="4.5" rx="2.2" fill="#3a8ee6"/><path d="M7.5 11h9M7.5 14h9M7.5 17h6" stroke="#9aa7b8" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    idea: `<svg viewBox="0 0 24 24"><defs><radialGradient id="g-id" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff3b0"/><stop offset="1" stop-color="#fcc30b"/></radialGradient></defs><path d="M12 2.5a7 7 0 0 0-4 12.7V17h8v-1.8A7 7 0 0 0 12 2.5Z" fill="url(#g-id)"/><rect x="8" y="17.5" width="8" height="2" rx=".8" fill="#8a96a6"/><rect x="9" y="20" width="6" height="2" rx=".8" fill="#6b7685"/><path d="M10 10.5l2 2 2-2" stroke="#c98a00" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>`,
    principles: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-pr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb6ff"/><stop offset="1" stop-color="#1a5fb4"/></linearGradient></defs><path d="M12 2 4 5v6.2c0 4.6 3.3 8.8 8 10 4.7-1.2 8-5.4 8-10V5z" fill="url(#g-pr)"/><path d="m8.5 12 2.4 2.4 4.8-5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><defs><linearGradient id="g-se" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa8ba"/><stop offset="1" stop-color="#55627a"/></linearGradient></defs><path d="M10.3 2h3.4l.5 2.6 1.7.8 2.3-1.4 2.4 2.4-1.4 2.3.8 1.7 2.6.5v3.4l-2.6.5-.8 1.7 1.4 2.3-2.4 2.4-2.3-1.4-1.7.8-.5 2.6h-3.4l-.5-2.6-1.7-.8-2.3 1.4-2.4-2.4 1.4-2.3-.8-1.7L2 13.7v-3.4l2.6-.5.8-1.7L4 5.8l2.4-2.4 2.3 1.4 1.7-.8z" fill="url(#g-se)"/><circle cx="12" cy="12" r="3.6" fill="#eef2f7"/></svg>`,
    about: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0a6fd6"/><circle cx="12" cy="7.4" r="1.4" fill="#fff"/><rect x="10.8" y="10" width="2.4" height="8" rx="1.2" fill="#fff"/></svg>`,
    wheel: (() => {
      let s = `<svg viewBox="0 0 24 24">`;
      G.forEach((g, i) => {
        const a0 = (i / 17) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 17) * Math.PI * 2 - Math.PI / 2 + 0.02;
        const p = (r, a) => `${12 + r * Math.cos(a)} ${12 + r * Math.sin(a)}`;
        s += `<path d="M${p(10.5, a0)} A10.5 10.5 0 0 1 ${p(10.5, a1)} L${p(6, a1)} A6 6 0 0 0 ${p(6, a0)}Z" fill="${g.color}"/>`;
      });
      return s + `</svg>`;
    })()
  };
  const ico = name => `<span class="ico">${I[name]}</span>`;
  const gIco = g => `<span class="goal-ico" style="background:${g.color}">${g.n}</span>`;
  const sv = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
  const S = {
    back: sv(`<path d="M19 12H5M11 6l-6 6 6 6"/>`), fwd: sv(`<path d="M5 12h14M13 6l6 6-6 6"/>`),
    up: sv(`<path d="M12 19V5M6 11l6-6 6 6"/>`), refresh: sv(`<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>`),
    chev: sv(`<path d="m9 5 7 7-7 7"/>`), home: sv(`<path d="M3 11 12 4l9 7M5 10v10h14V10"/>`),
    min: `<svg viewBox="0 0 10 10"><path d="M0 5h10"/></svg>`, max: `<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5"/></svg>`,
    restore: `<svg viewBox="0 0 10 10"><rect x=".5" y="2.5" width="7" height="7" rx="1.2"/><path d="M2.5 2.5V1.8A1.3 1.3 0 0 1 3.8.5h4.4A1.3 1.3 0 0 1 9.5 1.8v4.4a1.3 1.3 0 0 1-1.3 1.3H7.5"/></svg>`,
    close: `<svg viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9"/></svg>`,
    plus: sv(`<path d="M12 5v14M5 12h14"/>`), save: sv(`<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>`),
    lock: sv(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
    power: sv(`<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>`), restart: sv(`<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>`),
    brush: sv(`<path d="M14 4l6 6-8 8H6v-6z"/>`), moon: sv(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>`),
    view: sv(`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`),
    person: sv(`<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`), sys: sv(`<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`),
    info: sv(`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>`), dice: sv(`<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8" class="fill"/><circle cx="15" cy="15" r=".8" class="fill"/><circle cx="15" cy="9" r=".8" class="fill"/><circle cx="9" cy="15" r=".8" class="fill"/>`),
    note: sv(`<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>`)
  };

  /* ================= 상태 ================= */
  const visited = new Set(store.get("visited", []));
  const markVisited = n => { visited.add(n); store.set("visited", [...visited]); };

  /* ================= 테마 / 설정 ================= */
  const settings = Object.assign({ theme: "system", accent: null, wall: "bloom", motion: true, focus: false, lock: true }, store.get("settings", {}));
  const saveSettings = () => store.set("settings", settings);
  const isDark = () => settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  function applySettings() {
    if (settings.theme === "system") root.removeAttribute("data-theme"); else root.dataset.theme = settings.theme;
    // 배경 테마 속성은 다크 조합 선택자와 맞추기 위해 실제 다크 여부를 반영
    if (settings.wall === "bloom") root.removeAttribute("data-wall"); else root.dataset.wall = settings.wall;
    if (settings.theme === "system" && isDark() && settings.wall !== "bloom") root.dataset.theme = "dark";
    if (settings.accent) {
      root.style.setProperty("--accent", settings.accent);
      const c = settings.accent.replace("#", ""), r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
      root.style.setProperty("--on-accent", (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? "#000" : "#fff");
    } else { root.style.removeProperty("--accent"); root.style.removeProperty("--on-accent"); }
    document.body.classList.toggle("reduce-motion", !settings.motion);
    $("#icons").style.visibility = settings.focus ? "hidden" : "";
    $$(".qs").forEach(b => {
      const k = b.dataset.qs;
      b.classList.toggle("on", k === "theme" ? isDark() : k === "motion" ? settings.motion : k === "focus" ? settings.focus : false);
    });
    $$("[data-sync]").forEach(fn => fn._sync && fn._sync());
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

  /* ================= 배경화면 꽃 ================= */
  (function bloom() {
    const g = $("#bloom"); let s = "";
    const petal = (rot, len, wid, fill, op) =>
      `<path transform="rotate(${rot})" d="M0 0 C ${-wid} ${-len * .3}, ${-wid * .8} ${-len * .85}, 0 ${-len} C ${wid * .8} ${-len * .85}, ${wid} ${-len * .3}, 0 0Z" fill="${fill}" opacity="${op}"/>`;
    for (let i = -5; i <= 5; i++) s += petal(i * 16, 470 - Math.abs(i) * 18, 130, i % 2 ? "url(#petalA)" : "url(#petalB)", .82);
    for (let i = -4; i <= 4; i++) s += petal(i * 18 + 8, 330 - Math.abs(i) * 14, 90, i % 2 ? "url(#petalB)" : "url(#petalA)", .9);
    g.innerHTML = s;
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

  /* ================= 알림 / 토스트 ================= */
  const notifs = [];
  function toast(title, body) {
    notifs.unshift({ title, body, t: new Date() });
    $("#notif-dot").classList.add("on");
    if (settings.focus) return;
    const el = h(`<div class="toast"><small>Code17</small><b>${esc(title)}</b><div>${esc(body)}</div></div>`);
    $("#toast").append(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 220); }, 3800);
  }

  /* ================= 앱 정의 ================= */
  const APPS = {
    explorer: { title: "SDG 탐색기", icon: "explorer", w: 1060, h: 700, mount: mountExplorer },
    notepad: { title: "아이디어 메모장", icon: "notepad", w: 720, h: 520, mount: mountNotepad },
    generator: { title: "아이디어 생성기", icon: "idea", w: 760, h: 620, mount: mountGenerator },
    principles: { title: "개발자 원칙", icon: "principles", w: 860, h: 640, mount: mountPrinciples },
    settings: { title: "설정", icon: "settings", w: 940, h: 640, mount: mountSettings },
    about: { title: "Code17 정보", icon: "about", w: 560, h: 560, mount: mountAbout }
  };
  const PINNED = ["explorer", "notepad", "generator", "principles", "settings"];
  const DESKTOP = [
    ["explorer", "SDG 탐색기"], ["notepad", "아이디어 메모장"], ["generator", "아이디어 생성기"],
    ["principles", "개발자 원칙"], ["settings", "설정"], ["about", "Code17 정보"]
  ];

  /* ================= 창 관리자 ================= */
  const wins = new Map();
  let zTop = 10, cascade = 0;
  const area = () => { const r = $("#desktop").getBoundingClientRect(); return { w: r.width, h: r.height }; };

  function openApp(id, arg) {
    let w = wins.get(id);
    if (w) {
      if (w.min) restoreWin(w);
      focusWin(w);
      w.onArg && w.onArg(arg);
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
    const ww = Math.min(app.w, A.w - 32), hh = Math.min(app.h, A.h - 32);
    const off = (cascade++ % 6) * 28;
    w = { id, el, app, x: clamp((A.w - ww) / 2 - 80 + off, 8, A.w - ww), y: clamp((A.h - hh) / 2 - 50 + off, 8, A.h - hh), w: ww, h: hh, max: false, min: false };
    wins.set(id, w);
    place(w);
    $("#windows").append(el);
    wireWin(w);
    app.mount($(".win-body", el), w, arg);
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
  function setTitle(w, t) { $(".title-text", w.el).textContent = t; w.el.setAttribute("aria-label", t); }
  function focusWin(w) {
    wins.forEach(o => o.el.classList.remove("focused"));
    if (!w) { renderTaskbar(); return; }
    w.el.style.zIndex = ++zTop;
    w.el.classList.add("focused");
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
    setTimeout(() => { w.el.remove(); }, settings.motion ? 140 : 0);
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
  function toggleMax(w) {
    if (isMobile()) return;
    animate(w, () => { w.max = !w.max; place(w); });
  }
  function snapTo(w, x, y, ww, hh) {
    const A = area();
    animate(w, () => { w.max = false; w.x = x * A.w; w.y = y * A.h; w.w = ww * A.w; w.h = hh * A.h; place(w); });
  }

  function wireWin(w) {
    const el = w.el, tb = $(".titlebar", el);
    el.addEventListener("pointerdown", () => focusWin(w), true);
    $(".wc.close", el).onclick = () => closeWin(w);
    $(".wc.min", el).onclick = () => minimizeWin(w);
    const mb = $(".wc.max", el);
    mb.onclick = () => { hideSnap(); toggleMax(w); };
    // 스냅 레이아웃 (최대화 버튼에 마우스를 올리면)
    let snapT, flyout;
    const hideSnap = () => { clearTimeout(snapT); flyout && flyout.remove(); flyout = null; };
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

    // 드래그 이동 + 가장자리 스냅
    tb.addEventListener("dblclick", e => { if (!e.target.closest(".wc")) toggleMax(w); });
    tb.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest(".wc") || isMobile()) return;
      const A = area(), sx = e.clientX, sy = e.clientY;
      let ox = w.x, oy = w.y, moved = false, zone = null;
      const prev = $("#snap-preview");
      tb.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved && w.max) { // 최대화 상태에서 끌면 원래 크기로
          w.max = false; ox = clamp(ev.clientX - w.w * (sx / A.w), 0, A.w - w.w); oy = 0; place(w);
        }
        moved = true;
        w.x = clamp(ox + dx, -w.w + 80, A.w - 80); w.y = clamp(oy + dy, 0, A.h - 40);
        place(w);
        zone = ev.clientY <= 2 ? [0, 0, 1, 1] : ev.clientX <= 2 ? [0, 0, .5, 1] : ev.clientX >= window.innerWidth - 3 ? [.5, 0, .5, 1] : null;
        if (zone) Object.assign(prev.style, { left: zone[0] * A.w + 8 + "px", top: 8 + "px", width: zone[2] * A.w - 16 + "px", height: A.h - 16 + "px" });
        prev.classList.toggle("on", !!zone);
      };
      const up = () => {
        tb.removeEventListener("pointermove", move); tb.removeEventListener("pointerup", up); tb.removeEventListener("pointercancel", up);
        prev.classList.remove("on");
        if (zone) { if (zone[2] === 1) { animate(w, () => { w.max = true; place(w); }); } else snapTo(w, ...zone); }
      };
      tb.addEventListener("pointermove", move); tb.addEventListener("pointerup", up); tb.addEventListener("pointercancel", up);
    });

    // 크기 조절
    $$(".rz", el).forEach(hd => hd.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const d = hd.dataset.d, sx = e.clientX, sy = e.clientY, o = { x: w.x, y: w.y, w: w.w, h: w.h };
      const MW = 340, MH = 240;
      hd.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (d.includes("e")) w.w = Math.max(MW, o.w + dx);
        if (d.includes("s")) w.h = Math.max(MH, o.h + dy);
        if (d.includes("w")) { w.w = Math.max(MW, o.w - dx); w.x = o.x + o.w - w.w; }
        if (d.includes("n")) { w.h = Math.max(MH, o.h - dy); w.y = Math.max(0, o.y + o.h - w.h); }
        place(w);
      };
      const up = () => { hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); };
      hd.addEventListener("pointermove", move); hd.addEventListener("pointerup", up);
    }));
  }

  /* ================= 작업 표시줄 ================= */
  $("#tb-start").innerHTML = ico("start");
  $("#tb-search").innerHTML = `<span class="ico" style="color:var(--text)">${I.search}</span>`;
  function renderTaskbar() {
    const ids = [...PINNED, ...[...wins.keys()].filter(k => !PINNED.includes(k))];
    const top = topWin();
    const box = $("#tb-apps");
    box.innerHTML = ids.map(id => {
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
    const id = b.dataset.app, w = wins.get(id);
    const r = b.getBoundingClientRect();
    showCtx(r.left, r.top - 8, [
      [ico(APPS[id].icon), APPS[id].title, () => openApp(id)],
      ...(w ? [null, [S.close, "창 닫기", () => closeWin(w)]] : [])
    ], true);
  });

  /* ================= 플라이아웃 ================= */
  const FLY = { start: "#start", widgets: "#widgets", quick: "#quick", calendar: "#calendar" };
  let openFly = null;
  function closeFlyouts(except) {
    Object.entries(FLY).forEach(([k, sel]) => {
      if (k === except) return;
      const el = $(sel);
      if (el.hidden) return;
      if (!settings.motion) { el.hidden = true; return; }
      el.classList.add("closing");
      setTimeout(() => { el.hidden = true; el.classList.remove("closing"); }, 140);
    });
    if (openFly !== except) openFly = except || null;
  }
  function toggleFly(name, after) {
    const el = $(FLY[name]);
    if (!el.hidden && !el.classList.contains("closing")) { closeFlyouts(); return; }
    closeFlyouts(name);
    hideCtx();
    el.classList.remove("closing"); el.hidden = false; openFly = name;
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
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeFlyouts(); hideCtx(); }
  });

  /* ---------- 시작 메뉴 ---------- */
  function renderStart() {
    $("#start-q").value = ""; $("#start-body").hidden = false; $("#start-results").hidden = true;
    $("#start-pinned").innerHTML = G.map(g => `<button class="s-app" data-goal="${g.n}" title="${esc(g.ko)}">${gIco(g)}<span>${esc(g.ko)}</span></button>`).join("");
    $("#start-apps").innerHTML = Object.entries(APPS).map(([id, a]) =>
      `<button class="s-row" data-open="${id}">${ico(a.icon)}<span>${esc(a.title)}<small>${esc(APP_DESC[id])}</small></span></button>`).join("");
  }
  const APP_DESC = {
    explorer: "17개 목표 폴더 열어보기", notepad: "떠오른 아이디어 적어두기", generator: "무작위로 서비스 기획안 뽑기",
    principles: "좋은 서비스를 위한 체크리스트", settings: "테마·강조색·배경", about: "만든 이유와 출처"
  };
  function hl(text, q) {
    const t = esc(text); if (!q) return t;
    const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return t;
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  function searchAll(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    const out = [];
    G.forEach(g => {
      if ([g.ko, g.en, g.goal, String(g.n)].some(s => s.toLowerCase().includes(q))) out.push({ type: "goal", g });
      g.ideas.forEach(i => {
        if ([i.name, i.desc, ...i.feat, ...i.tech].some(s => s.toLowerCase().includes(q))) out.push({ type: "idea", g, i });
      });
    });
    Object.entries(APPS).forEach(([id, a]) => { if (a.title.toLowerCase().includes(q)) out.push({ type: "app", id, a }); });
    return out;
  }
  function resultRows(res, q) {
    if (!res.length) return `<div class="empty">"${esc(q)}"에 대한 결과가 없습니다. 다른 단어로 찾아보세요. (예: 접근성, 지도, 기후)</div>`;
    return res.slice(0, 40).map(r => r.type === "goal"
      ? `<button class="list-row" data-goal="${r.g.n}">${gIco(r.g)}<span>${hl(r.g.ko, q)}<small>목표 ${r.g.n} · ${hl(r.g.en, q)}</small></span></button>`
      : r.type === "idea"
        ? `<button class="list-row" data-goal="${r.g.n}">${gIco(r.g)}<span>${hl(r.i.name, q)}<small>${hl(r.i.desc, q)}</small></span></button>`
        : `<button class="list-row" data-open="${r.id}">${ico(r.a.icon)}<span>${hl(r.a.title, q)}<small>앱</small></span></button>`).join("");
  }
  $("#start-q").addEventListener("input", e => {
    const q = e.target.value, res = $("#start-results");
    $("#start-body").hidden = !!q.trim(); res.hidden = !q.trim();
    if (q.trim()) res.innerHTML = `<div class="start-head"><h2>검색 결과</h2></div>` + resultRows(searchAll(q), q.trim());
  });
  $("#start-q").addEventListener("keydown", e => {
    if (e.key === "Enter") { const f = $("#start-results [data-goal], #start-results [data-open]"); f && f.click(); }
  });
  $("#power").onclick = e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    showCtx(r.left - 160, r.top - 8, [
      [S.lock, "잠금", () => lock()],
      [S.restart, "다시 시작", () => shutdown(true)],
      [S.power, "시스템 종료", () => shutdown(false)]
    ], true);
  };

  // 공통 클릭 위임: data-goal / data-open
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goal]");
    if (g && !g.closest(".win")) { closeFlyouts(); openApp("explorer", { goal: +g.dataset.goal }); return; }
    const o = e.target.closest("[data-open]");
    if (o && !o.closest(".win")) { closeFlyouts(); openApp(o.dataset.open); }
  });

  /* ---------- 위젯 ---------- */
  const dayOfYear = d => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const todayGoal = () => G[dayOfYear(new Date()) % 17];
  function renderWidgets() {
    const d = new Date(), g = todayGoal();
    const all = G.flatMap(x => x.ideas.map(i => ({ g: x, i })));
    const picks = [...all].sort(() => Math.random() - .5).slice(0, 3);
    const tip = P[d.getDate() % P.length];
    const v = visited.size, C = 2 * Math.PI * 46;
    $("#widgets").innerHTML = `
      <p class="wg-time">${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })} · ${d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })}</p>
      <div class="wg-grid">
        <div class="wg wide wg-goal" style="background:${g.color}">
          <h3>오늘의 목표</h3><div class="big">${pad(g.n)}</div>
          <p><b>${esc(g.ko)}</b><br>${esc(g.goal)}</p>
          <button data-goal="${g.n}">이 목표 살펴보기</button>
        </div>
        <div class="wg"><h3>탐색 진행률</h3>
          <div class="wg-ring"><svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" fill="none" stroke="var(--stroke-2)" stroke-width="9"/>
            <circle cx="55" cy="55" r="46" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * v / 17} ${C}" transform="rotate(-90 55 55)"/>
            <text x="55" y="61" text-anchor="middle" font-size="20" font-weight="700" fill="var(--text)" font-family="inherit">${v}/17</text></svg></div>
          <div class="wg-mini">${G.map(x => `<i style="background:${x.color}" class="${visited.has(x.n) ? "on" : ""}" title="${esc(x.ko)}"></i>`).join("")}</div>
        </div>
        <div class="wg"><h3>개발자 팁</h3><p style="margin:0;font-size:13px;line-height:1.6"><b>${esc(tip.t)}</b><br>${esc(tip.d)}</p></div>
        <div class="wg wide"><h3>만들어 볼 만한 서비스</h3>
          <ul class="wg-list">${picks.map(p => `<li><a href="#" data-goal="${p.g.n}" style="color:inherit;text-decoration:none"><b>${esc(p.i.name)}</b> — ${esc(p.i.desc)} <span style="color:var(--text-2)">(목표 ${p.g.n})</span></a></li>`).join("")}</ul>
        </div>
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
    let s = ["일", "월", "화", "수", "목", "금", "토"].map(x => `<span class="dow">${x}</span>`).join("");
    for (let i = first - 1; i >= 0; i--) s += `<span class="other">${prevDays - i}</span>`;
    for (let i = 1; i <= days; i++) s += `<span class="${i === d.getDate() ? "today" : ""}">${i}</span>`;
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
    if (k === "focus") { settings.focus = !settings.focus; if (!settings.focus) toast("집중 모드 해제", "알림과 바탕화면 아이콘이 다시 보입니다."); }
    if (k === "wall") settings.wall = WALLS[(WALLS.indexOf(settings.wall) + 1) % WALLS.length];
    saveSettings(); applySettings();
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
      [S.view, "아이콘 정렬 새로 고침", () => renderIcons(true)],
      [S.refresh, "새로 고침", () => location.reload()],
      null,
      [S.brush, "다음 배경 화면", () => { settings.wall = WALLS[(WALLS.indexOf(settings.wall) + 1) % WALLS.length]; saveSettings(); applySettings(); }],
      [S.moon, isDark() ? "밝은 테마로 전환" : "어두운 테마로 전환", () => { settings.theme = isDark() ? "light" : "dark"; saveSettings(); applySettings(); }],
      null,
      [ico("settings"), "개인 설정", () => openApp("settings")],
      [ico("about"), "Code17 정보", () => openApp("about")]
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

  /* ================= 앱: SDG 탐색기 ================= */
  const folderSvg = g => `<svg class="fsvg" viewBox="0 0 72 58"><path d="M4 8a4 4 0 0 1 4-4h17l6 6h33a4 4 0 0 1 4 4v36a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#E8A33D"/><rect x="4" y="15" width="64" height="39" rx="4" fill="#FFC83D"/><rect x="4" y="15" width="64" height="3" rx="1.5" fill="#FFD86B"/><rect x="42" y="26" width="20" height="20" rx="4" fill="${g.color}"/><text x="52" y="40.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Segoe UI, Pretendard, sans-serif">${g.n}</text></svg>`;

  function mountExplorer(body, w, arg) {
    let hist = [], idx = -1;
    body.innerHTML = `
      <div class="ex-toolbar">
        <button class="icon-btn" data-x="back" aria-label="뒤로" title="뒤로">${S.back}</button>
        <button class="icon-btn" data-x="fwd" aria-label="앞으로" title="앞으로">${S.fwd}</button>
        <button class="icon-btn" data-x="up" aria-label="위로" title="상위 폴더">${S.up}</button>
        <button class="icon-btn" data-x="refresh" aria-label="새로 고침" title="새로 고침">${S.refresh}</button>
        <div class="ex-path"></div>
        <input class="field ex-search" type="search" placeholder="SDGs 검색" aria-label="SDGs 검색">
      </div>
      <div class="ex-main">
        <nav class="ex-nav scroll">
          <button data-loc="home">${S.home}<span>홈</span></button>
          <button data-x="notes">${ico("notepad")}<span>내 아이디어 메모</span></button>
          <button data-x="principles">${ico("principles")}<span>개발자 원칙</span></button>
          <hr>
          ${G.map(g => `<button data-loc="goal:${g.n}">${gIco(g)}<span>${esc(g.ko)}</span></button>`).join("")}
        </nav>
        <div class="ex-content scroll"></div>
      </div>
      <div class="ex-status"></div>`;
    const content = $(".ex-content", body), path = $(".ex-path", body), status = $(".ex-status", body), search = $(".ex-search", body);

    function go(loc, push = true) {
      if (push) { hist = hist.slice(0, idx + 1); hist.push(loc); idx = hist.length - 1; }
      render(loc);
    }
    function crumbs(parts) {
      path.innerHTML = parts.map((p, i) => (i ? S.chev : "") + `<button data-loc="${p[0]}">${esc(p[1])}</button>`).join("");
    }
    function render(loc) {
      $(".ex-toolbar [data-x=back]", body).disabled = idx <= 0;
      $(".ex-toolbar [data-x=fwd]", body).disabled = idx >= hist.length - 1;
      $(".ex-toolbar [data-x=up]", body).disabled = loc === "home";
      $$(".ex-nav [data-loc]", body).forEach(b => b.classList.toggle("cur", b.dataset.loc === loc));
      content.scrollTop = 0;
      if (loc === "home") {
        setTitle(w, "SDG 탐색기");
        crumbs([["home", "SDGs"]]);
        content.innerHTML = `
          <div class="card" style="margin-bottom:18px"><p><b>개발자가 서비스로 할 수 있는 일</b><br>
          지속가능발전목표(SDGs)는 2015년 UN 총회에서 채택된 17개의 목표입니다. 각 폴더를 열면 그 목표를 위해 개발자가 만들 수 있는 서비스 아이디어를 볼 수 있습니다.</p></div>
          <div class="sec-title">목표 폴더 (17)</div>
          <div class="folders">${G.map(g => `<button class="folder" data-loc="goal:${g.n}" title="${esc(g.en)}">${folderSvg(g)}<span>${pad(g.n)} ${esc(g.ko)}</span></button>`).join("")}</div>`;
        status.textContent = `항목 17개 · 탐색한 목표 ${visited.size}개`;
      } else if (loc.startsWith("goal:")) {
        const g = G[+loc.slice(5) - 1];
        markVisited(g.n);
        setTitle(w, `${pad(g.n)} ${g.ko} - SDG 탐색기`);
        crumbs([["home", "SDGs"], [loc, `${pad(g.n)} ${g.ko}`]]);
        const prev = G[g.n - 2], next = G[g.n];
        content.innerHTML = `
          <div class="hero" data-n="${g.n}" style="background:linear-gradient(135deg, ${g.color}, color-mix(in srgb, ${g.color} 70%, #000))">
            <small>목표 ${g.n} · ${esc(g.en)}</small><h1>${esc(g.ko)}</h1><p>${esc(g.goal)}</p>
          </div>
          <div class="sec-title">왜 개발자가 할 수 있을까?</div>
          <div class="card"><p>${esc(g.why)}</p></div>
          <div class="sec-title" style="margin-top:18px">만들 수 있는 서비스</div>
          <div class="ideas">${g.ideas.map((i, k) => `
            <article class="card idea">
              <h3><i style="background:${g.color}"></i>${esc(i.name)}</h3>
              <p>${esc(i.desc)}</p>
              <ul>${i.feat.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
              <div class="chips">${i.tech.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>
              <button class="btn" data-memo="${k}">${S.note}메모장에 담기</button>
            </article>`).join("")}
          </div>
          <div class="sec-title" style="margin-top:18px">만들 때 기억할 것</div>
          <div class="card"><p>${P.slice(0, 3).map(p => `<b>${esc(p.t)}</b> — ${esc(p.d)}`).join("<br>")}</p>
            <div style="margin-top:10px"><button class="btn" data-x="principles">${ico("principles")}개발자 원칙 전체 보기</button></div></div>
          <div class="goal-nav">
            ${prev ? `<button class="btn" data-loc="goal:${prev.n}">${S.back}${pad(prev.n)} ${esc(prev.ko)}</button>` : "<span></span>"}
            ${next ? `<button class="btn" data-loc="goal:${next.n}">${pad(next.n)} ${esc(next.ko)}${S.fwd}</button>` : `<button class="btn" data-loc="home">${S.home}처음으로</button>`}
          </div>`;
        $$("[data-memo]", content).forEach(b => b.onclick = () => {
          const i = g.ideas[+b.dataset.memo];
          addMemo(`[목표 ${g.n} ${g.ko}] ${i.name}\n- ${i.desc}\n- 기능: ${i.feat.join(", ")}\n- 기술: ${i.tech.join(", ")}`);
        });
        status.textContent = `서비스 아이디어 ${g.ideas.length}개 · 목표 ${g.n}/17`;
      } else if (loc.startsWith("search:")) {
        const q = decodeURIComponent(loc.slice(7));
        setTitle(w, `"${q}" 검색 결과 - SDG 탐색기`);
        crumbs([["home", "SDGs"], [loc, `"${q}" 검색 결과`]]);
        const res = searchAll(q).filter(r => r.type !== "app");
        content.innerHTML = `<div class="sec-title">검색 결과 (${res.length})</div>` +
          resultRows(res, q).replace(/data-goal="(\d+)"/g, 'data-loc="goal:$1"');
        status.textContent = `항목 ${res.length}개`;
      }
    }
    body.addEventListener("click", e => {
      const l = e.target.closest("[data-loc]");
      if (l) { const loc = l.dataset.loc; if (loc !== hist[idx]) go(loc); return; }
      const x = e.target.closest("[data-x]"); if (!x || x.disabled) return;
      const a = x.dataset.x;
      if (a === "back" && idx > 0) render(hist[--idx]);
      if (a === "fwd" && idx < hist.length - 1) render(hist[++idx]);
      if (a === "up") go("home");
      if (a === "refresh") render(hist[idx]);
      if (a === "notes") openApp("notepad");
      if (a === "principles") openApp("principles");
    });
    content.addEventListener("dblclick", e => e.preventDefault());
    search.addEventListener("keydown", e => { if (e.key === "Enter" && search.value.trim()) go("search:" + encodeURIComponent(search.value.trim())); });
    w.onArg = a => { if (a && a.goal) go("goal:" + a.goal); };
    go(arg && arg.goal ? "goal:" + arg.goal : "home");
  }

  /* ================= 앱: 메모장 ================= */
  const MEMO_DEFAULT = "# 내 SDG 서비스 아이디어\n\n목표: \n누구를 위해: \n해결하려는 문제: \n해결 방법(서비스): \n필요한 기술: \n\n----------------------------------------\n";
  function addMemo(text) {
    const cur = store.get("memo", MEMO_DEFAULT);
    store.set("memo", cur.replace(/\s*$/, "") + "\n\n" + text + "\n");
    const w = openApp("notepad");
    w.reload && w.reload();
    toast("메모장에 담았습니다", text.split("\n")[0]);
  }
  function mountNotepad(body, w) {
    body.innerHTML = `
      <div class="np-menu">
        <button data-n="new">새로 만들기</button><button data-n="save">.txt로 저장</button>
        <button data-n="smaller">글자 작게</button><button data-n="bigger">글자 크게</button><span class="sp"></span>
        <button data-n="gen">${S.dice}</button>
      </div>
      <textarea class="np-area scroll" spellcheck="false" aria-label="메모 내용"></textarea>
      <div class="np-status"><span class="pos"></span><span class="cnt"></span><span>자동 저장됨</span><span>UTF-8</span></div>`;
    const ta = $("textarea", body);
    let fs = store.get("memoFont", 14);
    const stat = () => {
      const before = ta.value.slice(0, ta.selectionStart).split("\n");
      $(".pos", body).textContent = `줄 ${before.length}, 열 ${before[before.length - 1].length + 1}`;
      $(".cnt", body).textContent = `${ta.value.length}자`;
    };
    w.reload = () => { ta.value = store.get("memo", MEMO_DEFAULT); ta.style.fontSize = fs + "px"; ta.scrollTop = ta.scrollHeight; stat(); };
    w.reload();
    let t; ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => store.set("memo", ta.value), 300); stat(); });
    ["click", "keyup"].forEach(ev => ta.addEventListener(ev, stat));
    $(".np-menu", body).addEventListener("click", e => {
      const b = e.target.closest("[data-n]"); if (!b) return;
      const a = b.dataset.n;
      if (a === "new" && confirm("메모를 모두 지우고 새로 시작할까요?")) { store.set("memo", MEMO_DEFAULT); w.reload(); }
      if (a === "save") {
        const url = URL.createObjectURL(new Blob([ta.value], { type: "text/plain;charset=utf-8" }));
        const l = document.createElement("a"); l.href = url; l.download = "sdg-아이디어.txt"; l.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (a === "smaller" || a === "bigger") { fs = clamp(fs + (a === "bigger" ? 2 : -2), 10, 28); store.set("memoFont", fs); ta.style.fontSize = fs + "px"; }
      if (a === "gen") openApp("generator");
    });
    $("[data-n=gen]", body).title = "아이디어 생성기 열기";
  }

  /* ================= 앱: 아이디어 생성기 ================= */
  const USERS = {
    "어르신": "큰 글씨·음성 안내·단순한 화면", "청소년": "보호자 안내와 안전한 커뮤니티 규칙", "장애인": "스크린리더·키보드만으로 모든 기능 사용",
    "이주민": "여러 언어 지원과 쉬운 한국어", "소상공인": "5분 안에 시작할 수 있는 설정", "우리 학교 학생": "학교 생활에 맞춘 알림과 동아리 공유",
    "지역 주민": "동네 단위 정보와 이웃 참여"
  };
  const PLATFORMS = ["웹 서비스(PWA)", "모바일 앱", "챗봇", "브라우저 확장", "키오스크"];
  function mountGenerator(body) {
    body.innerHTML = `<div class="scroll" style="flex:1;padding:20px 24px">
      <div class="gen-form">
        <label class="wide">목표<select class="field" data-g="goal"><option value="0">무작위</option>${G.map(g => `<option value="${g.n}">${g.n}. ${esc(g.ko)}</option>`).join("")}</select></label>
        <label>누구를 위해<select class="field" data-g="user">${Object.keys(USERS).map(u => `<option>${u}</option>`).join("")}</select></label>
        <label>어떤 형태로<select class="field" data-g="plat">${PLATFORMS.map(p => `<option>${p}</option>`).join("")}</select></label>
      </div>
      <div class="gen-actions" style="margin:0 0 16px"><button class="btn primary" data-a="roll">${S.dice}아이디어 만들기</button></div>
      <div class="card gen-out"><p style="color:var(--text-2)">조건을 고르고 <b>아이디어 만들기</b>를 눌러 보세요. 17개 목표의 서비스 아이디어를 바탕으로 기획안 초안을 만들어 줍니다.</p></div>
    </div>`;
    const out = $(".gen-out", body);
    let last = null;
    function roll() {
      const gv = +$("[data-g=goal]", body).value;
      const g = gv ? G[gv - 1] : G[Math.floor(Math.random() * 17)];
      const i = g.ideas[Math.floor(Math.random() * g.ideas.length)];
      const user = $("[data-g=user]", body).value, plat = $("[data-g=plat]", body).value;
      const pr = P[Math.floor(Math.random() * P.length)];
      last = { g, i, user, plat, pr };
      out.innerHTML = `
        <div class="tag"><span class="goal-ico" style="background:${g.color};width:20px;height:20px;font-size:10px;display:inline-grid;vertical-align:-5px;margin-right:6px">${g.n}</span>목표 ${g.n} · ${esc(g.ko)}</div>
        <h2>${esc(i.name)} <span style="font-weight:400;color:var(--text-2);font-size:15px">— ${esc(user)} 편</span></h2>
        <p>${esc(i.desc)}. 이번에는 <b>${esc(user)}</b>을(를) 주 사용자로 생각하고 <b>${esc(plat)}</b> 형태로 만들어 봅니다.</p>
        <b>핵심 기능</b>
        <ul>${i.feat.map(f => `<li>${esc(f)}</li>`).join("")}<li>${esc(USERS[user])}</li></ul>
        <b>꼭 지킬 원칙: ${esc(pr.t)}</b><p style="margin-top:2px;color:var(--text-2)">${esc(pr.d)}</p>
        <div class="gen-actions">
          <button class="btn primary" data-a="memo">${S.note}메모장에 담기</button>
          <button class="btn" data-a="roll">${S.dice}다시 뽑기</button>
          <button class="btn" data-a="goal">${ico("explorer")}목표 ${g.n} 자세히 보기</button>
        </div>`;
    }
    body.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a;
      if (a === "roll") roll();
      if (a === "memo" && last) addMemo(`[목표 ${last.g.n} ${last.g.ko}] ${last.i.name} — ${last.user} 편 (${last.plat})\n- ${last.i.desc}\n- 기능: ${[...last.i.feat, USERS[last.user]].join(", ")}\n- 원칙: ${last.pr.t}`);
      if (a === "goal" && last) openApp("explorer", { goal: last.g.n });
    });
  }

  /* ================= 앱: 개발자 원칙 ================= */
  const CHECKS = [
    "키보드만으로 모든 기능을 쓸 수 있다", "이미지에 대체 텍스트가 있다", "글자와 배경의 명도 대비가 충분하다",
    "꼭 필요한 개인정보만 수집한다", "느린 인터넷에서도 첫 화면이 빨리 뜬다", "보여주는 숫자와 정보에 출처가 있다",
    "전문가의 판단이 필요한 일은 공식 기관으로 연결한다", "실제 사용자에게 먼저 물어보고 만들었다"
  ];
  function mountPrinciples(body) {
    const done = new Set(store.get("checks", []));
    body.innerHTML = `<div class="st-main scroll" style="padding:20px 28px 28px">
      <h1>좋은 SDG 서비스를 위한 원칙</h1>
      <div class="pr">${P.map((p, i) => `<div class="card"><h3><span>${i + 1}</span>${esc(p.t)}</h3><p>${esc(p.d)}</p></div>`).join("")}</div>
      <div class="sec-title" style="margin-top:22px">출시 전 체크리스트 <span class="cnt" style="font-weight:400;color:var(--text-2)"></span></div>
      <div class="progress"><i></i></div>
      ${CHECKS.map((c, i) => `<label class="check"><input type="checkbox" data-c="${i}" ${done.has(i) ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}
    </div>`;
    const upd = () => { $(".progress i", body).style.width = (done.size / CHECKS.length * 100) + "%"; $(".cnt", body).textContent = `${done.size}/${CHECKS.length}`; };
    upd();
    body.addEventListener("change", e => {
      const c = e.target.dataset.c; if (c === undefined) return;
      e.target.checked ? done.add(+c) : done.delete(+c);
      store.set("checks", [...done]); upd();
      if (done.size === CHECKS.length) toast("체크리스트 완료!", "모든 항목을 확인했습니다. 이제 세상에 내보낼 준비가 됐어요.");
    });
  }

  /* ================= 앱: 설정 ================= */
  function mountSettings(body, w) {
    body.innerHTML = `<div class="st">
      <nav class="st-nav scroll">
        <div class="st-user"><span class="avatar">D</span><div><b>개발자</b><small>SDGs를 위해 코드를 쓰는 사람</small></div></div>
        <button data-p="personal">${S.brush}개인 설정</button>
        <button data-p="system">${S.sys}시스템</button>
        <button data-p="info">${S.info}정보</button>
      </nav>
      <div class="st-main scroll"></div>
    </div>`;
    const main = $(".st-main", body);
    const ACCENTS = [null, ...G.map(g => g.color)];
    function page(p) {
      $$(".st-nav [data-p]", body).forEach(b => b.classList.toggle("cur", b.dataset.p === p));
      main.scrollTop = 0;
      if (p === "personal") {
        main.innerHTML = `<h1>개인 설정</h1>
          <div class="st-row">${S.moon}<div class="grow">모드 선택<small>앱과 작업 표시줄의 색을 바꿉니다</small></div>
            <div class="seg">${[["light", "밝게"], ["dark", "어둡게"], ["system", "시스템"]].map(([k, l]) => `<button data-theme="${k}" class="${settings.theme === k ? "cur" : ""}">${l}</button>`).join("")}</div></div>
          <div class="st-row">${S.brush}<div class="grow">강조 색<small>SDG 목표 색 중 하나를 고를 수 있습니다</small>
            <div class="swatches" style="margin-top:10px">${ACCENTS.map(c => `<button data-accent="${c || ""}" title="${c ? G.find(g => g.color === c).ko : "기본"}" class="${(settings.accent || "") === (c || "") ? "cur" : ""}" style="background:${c || "linear-gradient(135deg,#0067C0 50%,#4CC2FF 50%)"}"></button>`).join("")}</div></div></div>
          <div class="st-row">${S.view}<div class="grow">배경 화면<small>꽃잎 배경의 색 테마</small>
            <div class="walls" style="margin-top:10px">${[["bloom", "#2f7fe0", "#c9ddf4"], ["sunset", "#e5243b", "#f6d2c4"], ["forest", "#3f7e44", "#cfe8cf"]].map(([k, a, b]) => `<button data-wall="${k}" class="${settings.wall === k ? "cur" : ""}" style="background:radial-gradient(circle at 50% 110%, ${a} 0 35%, ${b} 70%)" aria-label="${k}"></button>`).join("")}</div></div></div>`;
      } else if (p === "system") {
        const tg = (k, t, d) => `<div class="st-row"><div class="grow">${t}<small>${d}</small></div><button class="toggle ${settings[k] ? "on" : ""}" data-tg="${k}" role="switch" aria-checked="${settings[k]}" aria-label="${t}"></button></div>`;
        main.innerHTML = `<h1>시스템</h1>
          ${tg("motion", "애니메이션 효과", "창 열기·최소화 등 움직임 효과")}
          ${tg("focus", "집중 모드", "알림 팝업과 바탕화면 아이콘을 숨깁니다")}
          ${tg("lock", "시작할 때 잠금 화면", "페이지를 열 때 잠금 화면을 보여줍니다")}
          <div class="st-row"><div class="grow">저장된 데이터 지우기<small>메모, 체크리스트, 탐색 기록, 설정을 이 브라우저에서 지웁니다</small></div><button class="btn" data-reset>지우기</button></div>`;
      } else {
        main.innerHTML = `<h1>정보</h1>
          <div class="st-row">${ico("wheel")}<div class="grow"><b>Code17</b> · SDGs Edition<small>탐색한 목표 ${visited.size}/17 · 열린 창 ${wins.size}개</small></div><button class="btn" data-openabout>자세히</button></div>`;
      }
    }
    body._sync = () => { const c = $(".st-nav .cur", body); if (c && c.dataset.p !== "info") page(c.dataset.p); };
    body.setAttribute("data-sync", "");
    body.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.p) return page(t.dataset.p);
      if (t.dataset.theme) settings.theme = t.dataset.theme;
      else if (t.dataset.accent !== undefined) settings.accent = t.dataset.accent || null;
      else if (t.dataset.wall) settings.wall = t.dataset.wall;
      else if (t.dataset.tg) settings[t.dataset.tg] = !settings[t.dataset.tg];
      else if (t.hasAttribute("data-reset")) {
        if (!confirm("저장된 데이터를 모두 지울까요?")) return;
        try { Object.keys(localStorage).filter(k => k.startsWith("code17:")).forEach(k => localStorage.removeItem(k)); } catch { /* 무시 */ }
        location.reload(); return;
      } else if (t.hasAttribute("data-openabout")) return openApp("about");
      else return;
      saveSettings(); applySettings();
    });
    page("personal");
  }

  /* ================= 앱: 정보 ================= */
  function mountAbout(body) {
    body.innerHTML = `<div class="about scroll" style="flex:1;user-select:text">
      <div class="logo">${ico("wheel")}<div><b>Code17</b><div style="color:var(--text-2)">코드로 여는 17개의 목표</div></div></div>
      <p>Code17은 <b>지속가능발전목표(SDGs) 17개</b> 각각에 대해, 개발자가 <b>서비스를 만들어서</b> 기여할 수 있는 방법을 모아 둔 웹입니다.
      Windows 11의 디자인 느낌을 참고해 데스크톱처럼 만들었습니다.</p>
      <hr>
      <b>사용 방법</b>
      <ul>
        <li>바탕화면 아이콘을 더블클릭하거나, 작업 표시줄의 시작 버튼에서 목표를 고르세요.</li>
        <li>창은 제목 표시줄을 끌어 옮기고, 화면 위/왼쪽/오른쪽 끝으로 끌면 스냅됩니다.</li>
        <li>최대화 버튼에 마우스를 올리면 스냅 레이아웃이 나옵니다.</li>
        <li>메모와 설정은 이 브라우저에만 저장됩니다.</li>
      </ul>
      <hr>
      <b>출처</b>
      <ul>
        <li>목표 명칭(한국어): <a href="https://ncsd.go.kr/unsdgs/goals" target="_blank" rel="noopener">지속가능발전포털 — 17개 목표와 현황</a></li>
        <li>목표 원문: <a href="https://sdgs.un.org/goals" target="_blank" rel="noopener">UN Department of Economic and Social Affairs — The 17 Goals</a></li>
        <li>목표 색상: <a href="https://www.un.org/sustainabledevelopment/news/communications-material/" target="_blank" rel="noopener">UN SDG 커뮤니케이션 자료 가이드라인</a></li>
      </ul>
      <p style="color:var(--text-2);font-size:12px">목표 설명은 원문을 바탕으로 쉽게 풀어 쓴 것입니다. 각 목표의 서비스 아이디어는 Code17이 제안하는 예시이며, 실제로 존재하는 특정 서비스를 가리키지 않습니다.
      이 페이지는 학습용으로 만든 것으로 Microsoft 및 UN과 관련이 없습니다.</p>
    </div>`;
  }

  /* ================= 잠금 / 종료 ================= */
  function lock() { closeFlyouts(); tick(); $("#lock").classList.remove("gone"); }
  function unlock() {
    const l = $("#lock"); if (l.classList.contains("gone")) return;
    l.classList.add("gone");
    if (!unlock.done) {
      unlock.done = true;
      setTimeout(() => toast("Code17에 오신 것을 환영합니다", "바탕화면의 'SDG 탐색기'를 열거나 시작 버튼에서 목표를 골라 보세요."), 600);
    }
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
      s.innerHTML = `<p>컴퓨터를 꺼도 좋습니다. (농담이에요)</p><button class="btn primary">다시 켜기</button>`;
      $("button", s).onclick = () => location.reload();
    }, 1800);
  }

  /* ================= 시작 ================= */
  applySettings();
  renderTaskbar();
  const params = new URLSearchParams(location.search);
  if (!settings.lock || params.has("nolock")) { $("#lock").classList.add("gone"); unlock.done = true; }
  const goalParam = +params.get("goal");
  if (goalParam >= 1 && goalParam <= 17) { $("#lock").classList.add("gone"); unlock.done = true; openApp("explorer", { goal: goalParam }); }
  window.addEventListener("resize", () => {
    const A = area();
    wins.forEach(w => { w.w = Math.min(w.w, A.w); w.h = Math.min(w.h, A.h); w.x = clamp(w.x, 0, Math.max(0, A.w - w.w)); w.y = clamp(w.y, 0, Math.max(0, A.h - w.h)); place(w); });
  });
})();
