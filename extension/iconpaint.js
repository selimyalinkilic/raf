// The Raf icon (a little bookshelf) in each skin's colours: toolbar icon (background) and page headers.
const RAF_ICON_PAL = {
  pastel:    { bg: "#d9ccff", base: "#ab97ec", b: ["#ffd6bf", "#bdf0d6", "#c6e3ff"], line: "#3d3a5c", bar: "#3d3a5c" },
  minimal:   { bg: "#e8edf4", base: "#4a6fa5", b: ["#ffffff", "#dcf2e4", "#eaf2fb"], line: "#1f2328", bar: "#1f2328" },
  cyberpunk: { bg: "#12101f", base: "#2b2150", b: ["#ff2bd6", "#00f5d4", "#3ab0ff"], line: "#07060f", bar: "#ff2bd6" },
  ocean:     { bg: "#12385a", base: "#0b1626", b: ["#ff9d5c", "#2ee6c5", "#5cb8ff"], line: "#08121f", bar: "#3fc1ff" },
  forest:    { bg: "#dfe8d0", base: "#6f8f4e", b: ["#f4e0c8", "#d6ecd2", "#dbe9e4"], line: "#2f3b2c", bar: "#2f3b2c" },
  sunset:    { bg: "#ffd3c2", base: "#ff7a59", b: ["#ffefc2", "#ffd6e0", "#e9d9ff"], line: "#4a2b3f", bar: "#4a2b3f" },
  paper:     { bg: "#eadfc6", base: "#8b5e34", b: ["#fbf6e9", "#e3e5c8", "#f0d9bf"], line: "#3b2f22", bar: "#3b2f22" },
  graphite:  { bg: "#e6e6e6", base: "#5a5a5a", b: ["#ffffff", "#d0d0d0", "#a8a8a8"], line: "#2b2b2b", bar: "#2b2b2b" },
  pop:       { bg: "#ffd23f", base: "#111111", b: ["#ff9fd0", "#7cf2c2", "#8fd3ff"], line: "#111111", bar: "#111111" },
};
const rafIconPal = (skin) => RAF_ICON_PAL[skin] || RAF_ICON_PAL.pastel;

function rafIconSvg(skin) {
  const p = rafIconPal(skin);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="16" fill="${p.bg}"/><rect x="4" y="44" width="56" height="16" rx="8" fill="${p.base}"/>`
    + `<rect x="13" y="16" width="9" height="26" rx="3" fill="${p.b[0]}" stroke="${p.line}" stroke-width="2.5"/><rect x="24" y="12" width="9" height="30" rx="3" fill="${p.b[1]}" stroke="${p.line}" stroke-width="2.5"/>`
    + `<rect x="36" y="19" width="9" height="23" rx="3" fill="${p.b[2]}" stroke="${p.line}" stroke-width="2.5" transform="rotate(12 40 30)"/><rect x="10" y="41" width="44" height="5" rx="2.5" fill="${p.bar}"/></svg>`;
}
const rafIconUrl = (skin) => "data:image/svg+xml," + encodeURIComponent(rafIconSvg(skin));

// Same drawing on a canvas, for chrome.action.setIcon in the service worker (no SVG decoding there)
function rafIconImageData(skin, size) {
  const p = rafIconPal(skin), c = new OffscreenCanvas(size, size).getContext("2d");
  c.scale(size / 64, size / 64);
  const rr = (x, y, w, h, r, fill, stroke) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.lineWidth = 2.5; c.strokeStyle = stroke; c.stroke(); } };
  rr(4, 4, 56, 56, 16, p.bg); rr(4, 44, 56, 16, 8, p.base);
  rr(13, 16, 9, 26, 3, p.b[0], p.line); rr(24, 12, 9, 30, 3, p.b[1], p.line);
  c.save(); c.translate(40, 30); c.rotate(12 * Math.PI / 180); c.translate(-40, -30); rr(36, 19, 9, 23, 3, p.b[2], p.line); c.restore();
  rr(10, 41, 44, 5, 2.5, p.bar);
  return c.getImageData(0, 0, size, size);
}
async function rafApplyActionIcon() {
  const { skin = "pastel" } = await chrome.storage.sync.get("skin");
  try { await chrome.action.setIcon({ imageData: { 16: rafIconImageData(skin, 16), 32: rafIconImageData(skin, 32) } }); } catch (e) {}
}
