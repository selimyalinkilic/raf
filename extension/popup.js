const $ = (id) => document.getElementById(id);
let page = null;

const parseTags = (s) => s.split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim().toLowerCase()).filter(Boolean);

// Version / permission check: show a banner if outdated or needs a reload
async function checkVersion() {
  const mine = chrome.runtime.getManifest().version;
  if (rafMissingPermissions().length) {
    $("banner").innerHTML = `${ic("alert")}<div class="btxt"><small>${escHtml(t("reloadNeeded"))}</small></div>`; $("banner").hidden = false; return;
  }
  try {
    const { server } = await rafSettings();
    if (!server) return;  // local mode: no server to ask
    const r = await (await fetch(server + "/api/extension")).json();
    const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
    if (r.version && newer(r.version, mine)) {
      $("banner").innerHTML = `${ic("sparkle")}<div class="btxt"><b>${escHtml(t("nvTitle", r.version))}</b>
        <small>${escHtml(t("nvSteps", mine))} <a href="${escHtml(r.help)}" target="_blank">${escHtml(t("nvHow"))}</a></small></div>
        <a class="bbtn" href="${escHtml(r.download)}" target="_blank">${ic("download")} ${escHtml(t("nvDownload"))}</a>`;
      $("banner").hidden = false;
    }
  } catch (e) { /* server unreachable: stay quiet */ }
}

// ---------- Feature toggles (Settings page) ----------
let FEAT = {};
async function applyFeatures() {
  FEAT = await rafFeatures();
  const showMain = FEAT.save || FEAT.video || FEAT.sessions;
  const tools = ["picker", "testData", "phone", "uuid", "lorem", "b64", "jwt", "shot"].filter((k) => FEAT[k]);
  $("saveform").hidden = !FEAT.save;
  $("shotrow").hidden = !FEAT.withShot;
  if (!FEAT.withShot) $("withShot").checked = false;
  $("dlbox").hidden = !FEAT.video;
  $("sessbox").hidden = !FEAT.sessions;
  $("dlbox").classList.toggle("solo", !FEAT.save);
  document.querySelectorAll("details.tool").forEach((d) => (d.hidden = !FEAT[d.dataset.k]));
  document.querySelector('.tabs [data-tab="main"]').hidden = !showMain;
  document.querySelector('.tabs [data-tab="tools"]').hidden = !tools.length;
  document.querySelector(".tabs").hidden = !(showMain && tools.length);
  if (!showMain && tools.length) document.querySelector('.tabs [data-tab="tools"]').click();
  if (!showMain && !tools.length) { document.querySelectorAll(".pane").forEach((p) => (p.hidden = true)); $("alloff").hidden = false; }
  return showMain;
}

async function init() {
  checkVersion();
  if (!(await applyFeatures())) return;
  const { server } = await rafSettings();
  const local = await rafIsLocal();
  $("open").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: local ? chrome.runtime.getURL("shelf.html") : server }); };
  $("ph-tg").hidden = local;  // Telegram needs a server; the QR code works everywhere
  // ?tab=<id> lets docs/screenshots open the popup as a page for a specific tab
  const forced = +new URLSearchParams(location.search).get("tab");
  const [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  page = (await rafExtract(tab.id)) || { url: tab.url, title: tab.title, favicon: tab.favIconUrl };
  if (!page.favicon && tab.favIconUrl) page.favicon = tab.favIconUrl;
  page.windowId = tab.windowId;
  const { withShot } = await chrome.storage.sync.get("withShot");
  $("withShot").checked = FEAT.withShot && withShot !== false;
  $("title").value = page.title || "";
  $("url").textContent = page.url;
  if (page.selection) $("note").value = page.selection;
  if (rafStoreBlocked(page.url)) {  // Chrome Web Store build: YouTube downloads are off — explain how to get them
    $("dl-quality").hidden = true; $("dl-video").parentElement.hidden = true;
    $("dl-store").innerHTML = `${ic("alert")} ${escHtml(t("ytStoreBlocked"))} <a href="${RAF_YT_INFO}" target="_blank">${escHtml(t("ytStoreHow"))}</a>`;
    $("dl-store").hidden = false;
  } else loadQualities();
  loadSessions();
  renderQr();
  if (!FEAT.save) return;
  if (!/^https?:/.test(page.url)) { ["save", "dl-video", "dl-audio"].forEach((id) => $(id).disabled = true); msg(t("cantSave"), true); return; }
  try {
    const [{ item }, { tags }] = await Promise.all([
      rafApi("/api/lookup?url=" + encodeURIComponent(page.url)),
      rafApi("/api/tags"),
    ]);
    if (item) {
      $("status").textContent = t("alreadySaved");
      $("tags").value = item.tags.join(", ");
      $("save").textContent = t("btnUpdate");
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
    if ($("withShot").checked) { try { screenshot = await rafCapture(page.windowId); } catch (e) { /* not allowed on some pages */ } }
    if (FEAT.withShot) chrome.storage.sync.set({ withShot: $("withShot").checked });
    const r = await rafApi("/api/items", {
      method: "POST",
      body: JSON.stringify({ url: page.url, title: $("title").value.trim(), description: page.description || "", favicon: page.favicon || "", text: page.text || "", note: $("note").value.trim(), tags: parseTags($("tags").value), screenshot }),
    });
    $("save").innerHTML = ic("check") + " " + t(r.new ? "saved" : "updated");
    $("save").classList.add("done");
    msg(t("savedToday", r.today));
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    $("save").disabled = false;
    msg(String(e.message || e), true);
  }
}

$("save").onclick = save;

// ---------- Video download ----------
let dlTimer = null;
async function startDl(kind) {
  ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = true);
  try {
    const d = await rafStartDownload(page.url, kind, kind === "video" ? +$("dl-quality").value : 0);
    $("dl-status").innerHTML = ic("clock") + " " + t("queued");
    const tick = async () => {
      const x = await rafApi("/api/downloads/" + d.id).catch(() => null);
      if (!x) return;
      if (x.status === "running") $("dl-status").innerHTML = `${ic("spinner", "spin")} ` + t("serverDownloading", Math.round(x.progress));
      else if (x.status === "done") { $("dl-status").innerHTML = `${ic("check", "ok")} ` + t("savingToComputer", escHtml(x.title)); chrome.runtime.sendMessage("check-downloads"); clearInterval(dlTimer); }
      else if (x.status === "error") { $("dl-status").innerHTML = ic("alert", "err") + " " + escHtml(x.error.slice(0, 160)); clearInterval(dlTimer); ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = false); }
    };
    dlTimer = setInterval(tick, 1500); tick();
  } catch (e) {
    $("dl-status").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e);
    ["dl-video", "dl-audio"].forEach((id) => $(id).disabled = false);
  }
}
// Fill the quality list for this page (asks the server; silently keeps "Best" if it can't)
async function loadQualities() {
  if (!FEAT.video || !page || !/^https?:/.test(page.url)) return;
  const sel = $("dl-quality"); sel.disabled = true;
  sel.options[0].textContent = t("qBest") + " · " + t("qLoading");
  try {
    const f = await rafFormats(page.url);
    const mb = (b) => (!b ? "" : b > 1073741824 ? ` · ${(b / 1073741824).toFixed(1)} GB` : ` · ${Math.max(1, Math.round(b / 1048576))} MB`);
    sel.innerHTML = `<option value="0">${escHtml(t("qBest"))}</option>` + f.options.filter((o) => o.kind === "video" && o.quality)
      .map((o) => `<option value="${o.quality}"${o.quality > 1080 ? ` title="${escHtml(t("q4kNote"))}"` : ""}>${escHtml(o.label)}${mb(o.size)}</option>`).join("");
  } catch (e) { sel.options[0].textContent = t("qBest"); }
  sel.disabled = false;
}
$("dl-video").onclick = () => startDl("video");
$("dl-audio").onclick = () => startDl("audio");
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); });
// ---------- Tabs ----------
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
  const prev = b.innerHTML; b.innerHTML = ic("check") + " " + t("copied"); setTimeout(() => (b.innerHTML = prev), 1200);
});
// Remember which tool sections are open
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

// ---------- Base64 (UTF-8 safe) ----------
const b64enc = (s, url) => { let r = btoa(String.fromCharCode(...new TextEncoder().encode(s))); return url ? r.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : r; };
const b64dec = (s) => { s = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""); s += "=".repeat((4 - s.length % 4) % 4); return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };
$("b-enc").onclick = () => { $("b-out").value = b64enc($("b-in").value, $("b-url").checked); };
$("b-dec").onclick = () => { try { $("b-out").value = b64dec($("b-in").value); } catch (e) { $("b-out").value = t("b64Error"); } };

// ---------- JWT ----------
function fmtDate(sec) { return new Date(sec * 1000).toLocaleString(rafLocale()); }
function decodeJwt() {
  const tok = $("j-in").value.trim().replace(/^Bearer\s+/i, "");
  $("j-meta").innerHTML = ""; $("j-out").textContent = "";
  if (!tok) return;
  const parts = tok.split(".");
  try {
    if (parts.length < 2) throw new Error(t("jwtParts"));
    const header = JSON.parse(b64dec(parts[0])), payload = JSON.parse(b64dec(parts[1]));
    const now = Date.now() / 1000, chips = [];
    chips.push(`<span>alg: ${header.alg || "?"}</span>`);
    if (payload.exp) chips.push(`<span class="${payload.exp < now ? "bad" : ""}">${payload.exp < now ? ic("x") + " " + t("jwtExpired") : ic("check") + " " + t("jwtValid")} · exp ${fmtDate(payload.exp)}</span>`);
    if (payload.iat) chips.push(`<span>iat ${fmtDate(payload.iat)}</span>`);
    if (payload.nbf) chips.push(`<span class="${payload.nbf > now ? "bad" : ""}">nbf ${fmtDate(payload.nbf)}</span>`);
    $("j-meta").innerHTML = chips.join("");
    $("j-out").textContent = "// HEADER\n" + JSON.stringify(header, null, 2) + "\n\n// PAYLOAD\n" + JSON.stringify(payload, null, 2);
  } catch (e) { $("j-meta").innerHTML = `<span class="bad">${ic("alert")} ${escHtml(e.message.includes("JSON") ? t("jwtInvalid") : e.message)}</span>`; }
}
$("j-in").oninput = decodeJwt;

// ---------- Screenshot tool ----------
$("s-png").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = await rafCapture(tab.windowId, "png");
    const name = "Raf/screenshot-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    await chrome.downloads.download({ url, filename: name });
    $("s-msg").innerHTML = ic("check", "ok") + " " + t("shotSaved");
  } catch (e) { $("s-msg").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e); }
};
$("s-copy").onclick = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const blob = await (await fetch(await rafCapture(tab.windowId, "png"))).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    $("s-msg").innerHTML = ic("check", "ok") + " " + t("shotCopied");
  } catch (e) { $("s-msg").innerHTML = ic("alert", "err") + " " + escHtml(e.message || e); }
};
(async () => {
  const s = await chrome.storage.sync.get(["uuidUpper", "uuidHyphens"]);
  $("u-upper").checked = !!s.uuidUpper; $("u-hyph").checked = s.uuidHyphens !== false;
  const { lastTab } = await chrome.storage.local.get("lastTab");
  const toolsTab = document.querySelector('.tabs [data-tab="tools"]');
  if (lastTab === "tools" && !toolsTab.hidden) toolsTab.click();
})();

// ---------- Locator picker ----------
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }
$("pk-start").onclick = async () => {
  try { await rafStartPicker((await activeTab()).id); window.close(); }
  catch (e) { $("pk-start").insertAdjacentHTML("afterend", `<p class="hint err">${ic("alert", "err")} ${escHtml(t("cantRunHere"))}</p>`); }
};

// ---------- Test data (TR) ----------
$("td-type").innerHTML = RAF_TESTDATA.ORDER.map((k) => `<option value="${k}">${escHtml(t("td_" + k))}</option>`).join("");
function genTd() {
  const k = $("td-type").value, n = +$("td-count").value;
  $("td-out").value = Array.from({ length: n }, () => RAF_TESTDATA.GEN[k]()).join("\n");
  $("td-out").rows = Math.min(n, 6);
  chrome.storage.local.set({ tdType: k });
}
["td-type", "td-count"].forEach((id) => $(id).onchange = genTd);
$("td-new").onclick = genTd;
chrome.storage.local.get("tdType").then(({ tdType }) => { if (tdType && RAF_TESTDATA.GEN[tdType]) $("td-type").value = tdType; genTd(); });
$("td-fill").onclick = async () => {
  try {
    const n = await rafFillForm((await activeTab()).id);
    $("td-msg").innerHTML = n ? `${ic("check", "ok")} ${escHtml(t("tdFilled", n))}` : `${ic("alert")} ${escHtml(t("tdNone"))}`;
  } catch (e) { $("td-msg").innerHTML = `${ic("alert", "err")} ${escHtml(t("cantRunHere"))}`; }
};

// ---------- Sessions: save all tabs, reopen later ----------
const SESSION_PREFIX = "oturum-";
async function loadSessions() {
  if (!FEAT.sessions) return;
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((x) => /^https?:/.test(x.url));
  $("sess-label").textContent = t("saveAllTabs", tabs.length);
  $("sess-save").disabled = !tabs.length;
  try {
    const { tags } = await rafApi("/api/tags");
    const ss = tags.filter((x) => x.tag.startsWith(SESSION_PREFIX)).sort((a, b) => b.tag.localeCompare(a.tag)).slice(0, 4);
    $("sess-list").innerHTML = ss.length ? `<div class="hint">${escHtml(t("sessionsTitle"))}</div>` + ss.map((x) => {
      const d = x.tag.slice(SESSION_PREFIX.length).split("-");  // yyyy-mm-dd-hhmm
      const when = d.length >= 4 ? new Date(+d[0], +d[1] - 1, +d[2], +d[3].slice(0, 2), +d[3].slice(2)).toLocaleString(rafLocale(), { dateStyle: "medium", timeStyle: "short" }) : x.tag;
      return `<div class="sess"><b>${escHtml(when)}</b><small>${escHtml(t("sessionTabs", x.n))}</small><button data-s="${escHtml(x.tag)}">${escHtml(t("openSession"))}</button></div>`;
    }).join("") : "";
    $("sess-list").querySelectorAll("[data-s]").forEach((b) => b.onclick = async () => {
      const { items } = await rafApi("/api/items?limit=100&tag=" + encodeURIComponent(b.dataset.s));
      if (items.length) chrome.windows.create({ url: items.reverse().map((x) => x.url) });
    });
  } catch (e) { /* server unreachable */ }
}
$("sess-save").onclick = async () => {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((x) => /^https?:/.test(x.url));
  const now = new Date(), p = (n) => String(n).padStart(2, "0");
  const tag = `${SESSION_PREFIX}${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  $("sess-save").disabled = true;
  let n = 0;
  for (const x of tabs) {
    $("sess-msg").innerHTML = `${ic("spinner", "spin")} ${escHtml(t("savingTabs", n, tabs.length))}`;
    try { await rafApi("/api/items", { method: "POST", body: JSON.stringify({ url: x.url, title: x.title || x.url, favicon: x.favIconUrl || "", tags: ["oturum", tag] }) }); n++; } catch (e) {}
  }
  $("sess-msg").innerHTML = `${ic("check", "ok")} ${escHtml(t("savedTabs", n, tag))}`;
  $("sess-save").disabled = false;
  loadSessions();
};

// ---------- Send to phone: QR + Telegram ----------
function renderQr() {
  if (!FEAT.phone || !page || !/^https?:/.test(page.url)) return;
  try {
    const qr = qrcode(0, "M"); qr.addData(page.url); qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { $("qr").textContent = "QR: " + e.message; }
}
$("ph-copy").onclick = async () => { await navigator.clipboard.writeText(page.url); $("ph-msg").innerHTML = `${ic("check", "ok")} ${escHtml(t("copied"))}`; };
$("ph-tg").onclick = async () => {
  try {
    await rafApi("/api/send-to-phone", { method: "POST", body: JSON.stringify({ url: page.url, title: $("title").value || page.title }) });
    $("ph-msg").innerHTML = `${ic("check", "ok")} ${escHtml(t("sentTelegram"))}`;
  } catch (e) {
    const m = String(e.message || e);
    $("ph-msg").innerHTML = `${ic("alert", "err")} ${escHtml(/not configured/i.test(m) ? t("tgNotConfigured") : m)}`;
  }
};

init();
