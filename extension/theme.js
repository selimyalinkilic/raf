// Look & feel, applied in <head> from a local cache so there's no flash before first paint.
// - skin  (storage.sync "skin"):  pastel (default) | minimal | cyberpunk | terminal  → <html data-skin>
// - theme (storage.sync "theme"): auto (follows the OS) | light | dark              → <html data-theme>
//   Cyberpunk and Terminal are dark-only, so the light/dark choice only matters for Pastel and Minimal.
const RAF_SKINS = ["pastel", "minimal", "cyberpunk", "terminal"];
const RAF_DARK_ONLY = ["cyberpunk", "terminal"];
(() => {
  const root = document.documentElement;
  const theme = (v) => { if (v === "light" || v === "dark") root.dataset.theme = v; else delete root.dataset.theme; };
  const skin = (v) => { if (RAF_SKINS.includes(v) && v !== "pastel") root.dataset.skin = v; else delete root.dataset.skin; };
  const cache = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  try { theme(localStorage.getItem("rafTheme")); skin(localStorage.getItem("rafSkin")); } catch {}
  chrome.storage.sync.get(["theme", "skin"]).then(({ theme: t = "auto", skin: s = "pastel" }) => { theme(t); skin(s); cache("rafTheme", t); cache("rafSkin", s); });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "sync") return;
    if (c.theme) { theme(c.theme.newValue); cache("rafTheme", c.theme.newValue || "auto"); }
    if (c.skin) { skin(c.skin.newValue); cache("rafSkin", c.skin.newValue || "pastel"); }
  });
})();
