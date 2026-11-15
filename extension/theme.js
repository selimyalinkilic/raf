// Theme: "auto" follows the OS (prefers-color-scheme in CSS); "light"/"dark" force it via <html data-theme>.
// Loaded in <head> so the cached choice applies before first paint (no white flash in dark mode).
(() => {
  const apply = (v) => { if (v === "light" || v === "dark") document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; };
  try { apply(localStorage.getItem("rafTheme")); } catch {}
  chrome.storage.sync.get("theme").then(({ theme = "auto" }) => { apply(theme); try { localStorage.setItem("rafTheme", theme); } catch {} });
  chrome.storage.onChanged.addListener((c) => { if (c.theme) { apply(c.theme.newValue); try { localStorage.setItem("rafTheme", c.theme.newValue || "auto"); } catch {} } });
})();
