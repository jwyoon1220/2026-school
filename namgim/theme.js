/* 남김없이 — 테마 동기화 (데스크톱과 앱 창이 같은 설정을 사용) */
(function () {
  const KEY = "namgim:settings";
  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function apply() {
    const s = Object.assign({ theme: "system", accent: null, wall: "bloom" }, read());
    const r = document.documentElement;
    const dark = s.theme === "dark" || (s.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (s.theme === "system" && !(dark && s.wall !== "bloom")) r.removeAttribute("data-theme"); else r.dataset.theme = dark ? "dark" : "light";
    if (s.wall && s.wall !== "bloom") r.dataset.wall = s.wall; else r.removeAttribute("data-wall");
    if (s.accent) {
      const c = s.accent.replace("#", ""), R = parseInt(c.slice(0, 2), 16), G = parseInt(c.slice(2, 4), 16), B = parseInt(c.slice(4, 6), 16);
      r.style.setProperty("--accent", s.accent);
      r.style.setProperty("--on-accent", (0.299 * R + 0.587 * G + 0.114 * B) > 165 ? "#000" : "#fff");
    } else { r.style.removeProperty("--accent"); r.style.removeProperty("--on-accent"); }
    document.body && document.body.classList.toggle("reduce-motion", s.motion === false);
    return { s, dark };
  }
  window.NamgimTheme = { apply, read, KEY };
  apply();
  addEventListener("storage", e => { if (e.key === KEY) apply(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", apply);
})();
