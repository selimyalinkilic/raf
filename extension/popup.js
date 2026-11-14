const $ = (id) => document.getElementById(id);
let page = null;

const parseTags = (s) => s.split(/[,\s]+/).map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean);

// Eklenti sürüm / izin kontrolü: eskiyse ya da yeniden yüklenmesi gerekiyorsa üstte uyarı göster
async function checkVersion() {
  const mine = chrome.runtime.getManifest().version;
  if (rafMissingPermissions().length) {
    $("banner").innerHTML = ic("alert") + " " + RAF_RELOAD_MSG; $("banner").hidden = false; return;
  }
  try {
    const { server } = await rafSettings();
    const r = await (await fetch(server + "/api/extension")).json();
    const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
    if (r.version && newer(r.version, mine)) {
      $("banner").innerHTML = `${ic("sparkle")} Yeni sürüm var: <b>v${r.version}</b> (sende v${mine}). <a href="${r.download}" target="_blank">İndir</a> → klasöre çıkar → chrome://extensions'ta ↻ · <a href="${r.help}" target="_blank">nasıl?</a>`;
      $("banner").hidden = false;
    }
  } catch (e) { /* sunucuya ulaşılamazsa sessiz geç */ }
}

async function init() {
  checkVersion();
  const { server } = await rafSettings();
  $("open").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: server || "options.html" }); };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  page = (await rafExtract(tab.id)) || { url: tab.url, title: tab.title, favicon: tab.favIconUrl };
  if (!page.favicon && tab.favIconUrl) page.favicon = tab.favIconUrl;
  page.windowId = tab.windowId;
  const { withShot } = await chrome.storage.sync.get("withShot");
  $("withShot").checked = withShot !== false;
  $("title").value = page.title || "";
  $("url").textContent = page.url;
  if (page.selection) $("note").value = page.selection;
  if (!/^https?:/.test(page.url)) { ["save", "dl-video", "dl-audio"].forEach((id) => $(id).disabled = true); msg("Bu sayfa kaydedilemez.", true); return; }
  try {
    const [{ item }, { tags }] = await Promise.all([
      rafApi("/api/lookup?url=" + encodeURIComponent(page.url)),
      rafApi("/api/tags"),
    ]);
    if (item) {
      $("status").textContent = "Zaten rafta";
      $("tags").value = item.tags.join(", ");
      $("save").textContent = "Güncelle";
    }
    tags.slice(0, 10).forEach(({ tag }) => {
      const b = document.createElement("button");
      b.textContent = "#" + tag;
      b.onclick = () => { const cur = parseTags($("tags").value); if (!cur.includes(tag)) $("tags").value = [...cur, tag].join(", "); };
      $("suggest").appendChild(b);
    });
  } catch (e) {
    msg(String(e.message || e), true);
  }
  $("tags").focus();
}

function msg(t, err = false) { $("msg").textContent = t; $("msg").className = err ? "err" : ""; }

async function save() {
  $("save").disabled = true;
  try {
    let screenshot = "";
    if ($("withShot").checked) { try { screenshot = await rafCapture(page.windowId); } catch (e) { /* bazı sayfalarda izin yok */ } }
    chrome.storage.sync.set({ withShot: $("withShot").checked });
    const r = await rafApi("/api/items", {
      method: "POST",
      body: JSON.stringify({ url: page.url, title: $("title").value.trim(), description: page.description || "", favicon: page.favicon || "", text: page.text || "", note: $("note").value.trim(), tags: parseTags($("tags").value), screenshot }),
    });
    $("save").innerHTML = ic("check") + (r.new ? " Rafa kaldırıldı" : " Güncellendi");
    $("save").classList.add("done");
    msg(`Bugün ${r.today} sayfa kaydettin.`);
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    $("save").disabled = false;
    msg(String(e.message || e), true);
  }
}

$("save").onclick = save;

// ---------- Video indirme ----------
let dlTimer = null;
async function startDl(kind) {
  ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = true);
  try {
    const d = await rafStartDownload(page.url, kind);
    $("dl-status").innerHTML = ic("clock") + " Sıraya alındı…";
    const tick = async () => {
      const x = await rafApi("/api/downloads/" + d.id).catch(() => null);
      if (!x) return;
      if (x.status === "running") $("dl-status").innerHTML = `${ic("spinner", "spin")} Sunucu indiriyor… %${Math.round(x.progress)}`;
      else if (x.status === "done") { $("dl-status").innerHTML = `${ic("check", "ok")} ${escHtml(x.title)} — bilgisayarına iniyor`; chrome.runtime.sendMessage("check-downloads"); clearInterval(dlTimer); }
      else if (x.status === "error") { $("dl-status").innerHTML = ic("alert", "err") + " " + escHtml(x.error.slice(0, 160)); clearInterval(dlTimer); ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = false); }
    };
    dlTimer = setInterval(tick, 1500); tick();
  } catch (e) {
    $("dl-status").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e);
    ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = false);
  }
}
$("dl-video").onclick = () => startDl("video");
$("dl-audio").onclick = () => startDl("audio");
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); });
// ---------- Sekmeler ----------
document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach((p) => p.hidden = p.id !== b.dataset.tab);
  chrome.storage.local.set({ lastTab: b.dataset.tab });
  if (b.dataset.tab === "tools") genUuids();
});

// ---------- UUID ----------
async function genUuids() {
  const upper = $("u-upper").checked, hyphens = $("u-hyph").checked;
  chrome.storage.sync.set({ uuidUpper: upper, uuidHyphens: hyphens });
  $("u-out").value = Array.from({ length: +$("u-count").value }, () => rafUuid({ upper, hyphens })).join("\n");
  $("u-out").rows = Math.min(+$("u-count").value, 6);
}
$("u-new").onclick = genUuids;
["u-count", "u-upper", "u-hyph"].forEach((id) => $(id).onchange = genUuids);
document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => {
  await navigator.clipboard.writeText($(b.dataset.copy).value || $(b.dataset.copy).textContent);
  const t = b.innerHTML; b.innerHTML = ic("check") + " Kopyalandı"; setTimeout(() => (b.innerHTML = t), 1200);
});
// Açık/kapalı araç bölümlerini hatırla
chrome.storage.local.get("openTools").then(({ openTools }) => {
  if (openTools) document.querySelectorAll("details.tool").forEach((d) => d.open = openTools.includes(d.dataset.k));
  document.querySelectorAll("details.tool").forEach((d) => d.ontoggle = () =>
    chrome.storage.local.set({ openTools: [...document.querySelectorAll("details.tool[open]")].map((x) => x.dataset.k) }));
});

// ---------- Lorem ipsum ----------
const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum".split(" ");
const rnd = (n) => Math.floor(Math.random() * n);
const words = (n) => Array.from({ length: n }, () => LOREM[rnd(LOREM.length)]);
const sentence = () => { const w = words(8 + rnd(10)); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(" ") + "."; };
const paragraph = (first) => { const s = Array.from({ length: 4 + rnd(3) }, sentence); if (first) s[0] = "Lorem ipsum dolor sit amet, consectetur adipiscing elit."; return s.join(" "); };
function genLorem() {
  const n = +$("l-count").value, u = $("l-unit").value;
  $("l-out").value = u === "p" ? Array.from({ length: n }, (_, i) => paragraph(i === 0)).join("\n\n")
    : u === "s" ? Array.from({ length: n }, sentence).join(" ")
    : (() => { const w = words(n); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(" "); })();
}
["l-count", "l-unit"].forEach((id) => $(id).onchange = genLorem);
$("l-new").onclick = genLorem; genLorem();

// ---------- Base64 (UTF-8 güvenli) ----------
const b64enc = (s, url) => { let r = btoa(String.fromCharCode(...new TextEncoder().encode(s))); return url ? r.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : r; };
const b64dec = (s) => { s = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""); s += "=".repeat((4 - s.length % 4) % 4); return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };
$("b-enc").onclick = () => { $("b-out").value = b64enc($("b-in").value, $("b-url").checked); };
$("b-dec").onclick = () => { try { $("b-out").value = b64dec($("b-in").value); } catch (e) { $("b-out").value = "Hata: geçerli bir Base64 değil"; } };

// ---------- JWT ----------
function fmtDate(sec) { return new Date(sec * 1000).toLocaleString("tr-TR"); }
function decodeJwt() {
  const t = $("j-in").value.trim().replace(/^Bearer\s+/i, "");
  $("j-meta").innerHTML = ""; $("j-out").textContent = "";
  if (!t) return;
  const parts = t.split(".");
  try {
    if (parts.length < 2) throw new Error("JWT üç parçadan oluşmalı (header.payload.signature)");
    const header = JSON.parse(b64dec(parts[0])), payload = JSON.parse(b64dec(parts[1]));
    const now = Date.now() / 1000, chips = [];
    chips.push(`<span>alg: ${header.alg || "?"}</span>`);
    if (payload.exp) chips.push(`<span class="${payload.exp < now ? "bad" : ""}">${payload.exp < now ? ic("x") + " süresi doldu" : ic("check") + " geçerli"} · exp ${fmtDate(payload.exp)}</span>`);
    if (payload.iat) chips.push(`<span>iat ${fmtDate(payload.iat)}</span>`);
    if (payload.nbf) chips.push(`<span class="${payload.nbf > now ? "bad" : ""}">nbf ${fmtDate(payload.nbf)}</span>`);
    $("j-meta").innerHTML = chips.join("");
    $("j-out").textContent = "// HEADER\n" + JSON.stringify(header, null, 2) + "\n\n// PAYLOAD\n" + JSON.stringify(payload, null, 2);
  } catch (e) { $("j-meta").innerHTML = `<span class="bad">${ic("alert")} ${escHtml(e.message.includes("JSON") ? "Çözülemedi: geçerli bir JWT değil" : e.message)}</span>`; }
}
$("j-in").oninput = decodeJwt;

// ---------- Ekran görüntüsü aracı ----------
$("s-png").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = await rafCapture(tab.windowId, "png");
    const name = "Raf/ekran-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    await chrome.downloads.download({ url, filename: name });
    $("s-msg").innerHTML = ic("check", "ok") + " İndirildi (İndirilenler/Raf)";
  } catch (e) { $("s-msg").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e); }
};
$("s-copy").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const blob = await (await fetch(await rafCapture(tab.windowId, "png"))).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    $("s-msg").innerHTML = ic("check", "ok") + " Panoya kopyalandı (Ctrl+V)";
  } catch (e) { $("s-msg").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e); }
};
(async () => {
  const s = await chrome.storage.sync.get(["uuidUpper", "uuidHyphens"]);
  $("u-upper").checked = !!s.uuidUpper; $("u-hyph").checked = s.uuidHyphens !== false;
  const { lastTab } = await chrome.storage.local.get("lastTab");
  if (lastTab === "tools") document.querySelector('.tabs [data-tab="tools"]').click();
})();

init();
