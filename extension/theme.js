// Look & feel, applied in <head> from a local cache so there's no flash before first paint.
// - skin  (storage.sync "skin"):  one of RAF_SKINS, pastel is the default             → <html data-skin>
// - theme (storage.sync "theme"): auto (follows the OS) | light | dark              → <html data-theme>
//   Some skins have a single mode, so the light/dark choice only matters for Pastel and Minimal.
// The header logo is repainted in the skin's colours (iconpaint.js).
const RAF_SKINS = ["pastel", "minimal", "cyberpunk", "ocean", "forest", "sunset", "paper", "pop"];
const RAF_DARK_ONLY = ["cyberpunk", "ocean"];
const RAF_LIGHT_ONLY = ["forest", "sunset", "paper", "pop"];
(() => {
  const root = document.documentElement;
  const theme = (v) => { if (v === "light" || v === "dark") root.dataset.theme = v; else delete root.dataset.theme; };
  const logo = (v) => { if (typeof rafIconUrl === "function") document.querySelectorAll("header img").forEach((i) => (i.src = rafIconUrl(v))); };
  const skin = (v) => {
    if (RAF_SKINS.includes(v) && v !== "pastel") root.dataset.skin = v; else delete root.dataset.skin;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => logo(v), { once: true }); else logo(v);
  };
  const cache = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  try { theme(localStorage.getItem("rafTheme")); skin(localStorage.getItem("rafSkin")); } catch {}
  chrome.storage.sync.get(["theme", "skin"]).then(({ theme: t = "auto", skin: s = "pastel" }) => { theme(t); skin(s); cache("rafTheme", t); cache("rafSkin", s); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "sync") return;
    if (c.theme) { theme(c.theme.newValue); cache("rafTheme", c.theme.newValue || "auto"); }
    if (c.skin) { skin(c.skin.newValue); cache("rafSkin", c.skin.newValue || "pastel"); }
  });
})();
