importScripts("config.js", "i18n.js", "common.js", "features.js", "testdata.js");

// Right-click menus follow the feature toggles on the Settings page
async function buildMenus() {
  await rafI18nReady;
  const f = await rafFeatures();
  await chrome.contextMenus.removeAll();
  if (f.menuSave) {
    chrome.contextMenus.create({ id: "save-page", title: t("ctxSavePage"), contexts: ["page"] });
    chrome.contextMenus.create({ id: "save-link", title: t("ctxSaveLink"), contexts: ["link"] });
    chrome.contextMenus.create({ id: "save-selection", title: t("ctxSaveSelection"), contexts: ["selection"] });
  }
  if (f.phone) chrome.contextMenus.create({ id: "phone", title: t("ctxSendPhone"), contexts: ["page", "link"] });
  if (f.menuUuid) chrome.contextMenus.create({ id: "uuid", title: t("ctxInsertUuid"), contexts: ["editable"] });
  if (f.testData) chrome.contextMenus.create({ id: "fill", title: t("ctxFill"), contexts: ["page", "editable"] });
  if (f.menuTestData) {
    chrome.contextMenus.create({ id: "td", title: t("ctxTestData"), contexts: ["editable"] });
    for (const k of RAF_TESTDATA.ORDER) chrome.contextMenus.create({ id: "td:" + k, parentId: "td", title: t("td_" + k), contexts: ["editable"] });
  }
  if (f.menuVideo) {
    chrome.contextMenus.create({ id: "dl-video", title: t("ctxDlVideo"), contexts: ["page", "link", "video"] });
    chrome.contextMenus.create({ id: "dl-audio", title: t("ctxDlAudio"), contexts: ["page", "link", "video"] });
  }
}
chrome.runtime.onInstalled.addListener(buildMenus);
// After install/update, put the video button into tabs that are already open (no page reload needed)
async function reinjectOverlays() {
  const cs = chrome.runtime.getManifest().content_scripts?.[0];
  if (!cs) return 0;
  const tabs = await chrome.tabs.query({ url: cs.matches });
  await Promise.all(tabs.map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs.js }).catch(() => {})));
  return tabs.length;
}
chrome.runtime.onInstalled.addListener(() => { reinjectOverlays(); });
chrome.runtime.onStartup.addListener(buildMenus);
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== "sync") return;
  if (ch.lang) await rafLoadLang(ch.lang.newValue || "auto");
  if (ch.features || ch.lang) buildMenus();
});

function flash(tabId, ok, msg) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#7fd0a8" : "#ee97b8", tabId });
  chrome.action.setBadgeText({ text: ok ? "✓" : "!", tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 2500);
  chrome.notifications.create({ type: "basic", iconUrl: "icons/128.png", title: ok ? t("notifSaved") : t("notifSaveFailed"), message: msg });
}

async function savePage(tab, extra = {}) {
  const page = (await rafExtract(tab.id)) || { url: tab.url, title: tab.title };
  const body = { url: page.url, title: page.title, description: page.description || "", favicon: page.favicon || tab.favIconUrl || "", text: page.text || "", tags: [], note: "", ...extra };
  return rafApi("/api/items", { method: "POST", body: JSON.stringify(body) });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "uuid") return putUuid(tab, info.frameId);
  if (info.menuItemId === "fill") return fillAndReport(tab);
  if (info.menuItemId === "phone") {
    try {
      await rafApi("/api/send-to-phone", { method: "POST", body: JSON.stringify({ url: info.linkUrl || tab.url, title: info.linkUrl ? info.selectionText || info.linkUrl : tab.title }) });
      chrome.notifications.create({ type: "basic", iconUrl: "icons/128.png", title: t("notifSent"), message: info.linkUrl || tab.title || tab.url });
    } catch (e) { flash(tab.id, false, String(e.message || e)); }
    return;
  }
  if (info.menuItemId.startsWith("td:")) return putText(tab, info.frameId, RAF_TESTDATA.GEN[info.menuItemId.slice(3)]());
  if (info.menuItemId.startsWith("dl-")) {
    const target = info.linkUrl || (info.srcUrl && info.srcUrl.startsWith("http") && !info.srcUrl.startsWith("blob:") ? info.srcUrl : null) || tab.url;
    try {
      await rafStartDownload(target, info.menuItemId === "dl-audio" ? "audio" : "video");
      flash(tab.id, true, t("dlQueuedNotif"));
    } catch (e) { flash(tab.id, false, String(e.message || e)); }
    return;
  }
  try {
    let r;
    if (info.menuItemId === "save-link") {
      r = await rafApi("/api/items", { method: "POST", body: JSON.stringify({ url: info.linkUrl, title: info.selectionText || info.linkUrl, note: `Kaynak: ${tab.url}` }) });
    } else if (info.menuItemId === "save-selection") {
      r = await savePage(tab, { note: info.selectionText });
    } else {
      r = await savePage(tab);
    }
    flash(tab.id, true, `${r.item.title || r.item.url}\n` + t("todayCount", r.today));
  } catch (e) {
    flash(tab.id, false, String(e.message || e));
  }
});

async function putUuid(tab, frameId) {
  const { uuidUpper = false, uuidHyphens = true } = await chrome.storage.sync.get(["uuidUpper", "uuidHyphens"]);
  return putText(tab, frameId, rafUuid({ upper: uuidUpper, hyphens: uuidHyphens }));
}

async function putText(tab, frameId, id) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, ...(frameId ? { frameIds: [frameId] } : {}) }, func: rafInsertOrCopy, args: [id] });
    const how = r?.result;
    chrome.action.setBadgeBackgroundColor({ color: "#86b9ec", tabId: tab.id });
    chrome.action.setBadgeText({ text: how === "inserted" ? "✓" : how === "copied" ? "⧉" : "!", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 1500);
  } catch (e) {
    flash(tab.id, false, t("cantType"));
  }
}

async function fillAndReport(tab) {
  try {
    const n = await rafFillForm(tab.id);
    chrome.action.setBadgeBackgroundColor({ color: n ? "#7fd0a8" : "#ffd6bf", tabId: tab.id });
    chrome.action.setBadgeText({ text: n ? String(n) : "0", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 2000);
  } catch (e) { flash(tab.id, false, t("cantRunHere")); }
}

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const f = await rafFeatures();
  if (cmd === "insert-uuid") return f.menuUuid ? putUuid(tab) : undefined;
  if (cmd === "fill-form") { if (f.testData) fillAndReport(tab); return; }
  if (cmd === "pick-locator") { if (f.picker) rafStartPicker(tab.id).catch(() => flash(tab.id, false, t("cantRunHere"))); return; }
  if (cmd !== "quick-save" || !f.menuSave) return;
  try {
    const r = await savePage(tab);
    flash(tab.id, true, `${r.item.title || r.item.url}\n` + t("todayCount", r.today));
  } catch (e) {
    flash(tab.id, false, String(e.message || e));
  }
});

// ---------- Download tracking: save finished jobs to this computer ----------
// Never run two checks at once (popup + alarm firing together used to download a file twice)
let checking = null;
function checkDownloads() {
  if (!checking) checking = doCheck().finally(() => { checking = null; });
  return checking;
}
async function doCheck() {
  const { pending = [], delivered = [] } = await chrome.storage.local.get(["pending", "delivered"]);
  if (!pending.length) { chrome.alarms.clear("raf-dl"); return; }
  const left = [], ready = [];
  for (const id of new Set(pending)) {
    let d;
    try { d = await rafApi("/api/downloads/" + id); } catch (e) { left.push(id); continue; }
    if (d.status === "done" || d.status === "error") ready.push(d); else left.push(id);
  }
  // Remove from the list FIRST, then download: no other check can pick up the same job
  const done = new Set([...delivered, ...ready.map((d) => d.id)]);
  await chrome.storage.local.set({ pending: left, delivered: [...done].slice(-200) });
  for (const d of ready) {
    if (delivered.includes(d.id)) continue;
    if (d.status === "done") {
      chrome.downloads.download({ url: d.file_url, filename: "Raf/" + d.file.replace(/[\\/:*?"<>|]/g, "_"), conflictAction: "uniquify" });
      chrome.notifications.create("dl-" + d.id, { type: "basic", iconUrl: "icons/128.png", title: t("notifDownloaded"), message: d.title || d.file });
    } else {
      chrome.notifications.create("dl-" + d.id, { type: "basic", iconUrl: "icons/128.png", title: t("notifDlFailed"), message: (d.error || "").slice(0, 200) });
    }
  }
  if (!left.length) chrome.alarms.clear("raf-dl");
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "raf-dl") checkDownloads(); });
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m === "check-downloads") { checkDownloads(); return; }
  if (!m || !m.raf) return;
  // Requests from the in-page video button (content script can't call the server directly)
  const run = {
    formats: () => rafFormats(m.url),
    download: () => rafStartDownload(m.url, m.kind, m.quality),
    status: () => rafApi("/api/downloads/" + m.id),
    deliver: () => checkDownloads(),
    dict: async () => { await rafI18nReady; return { dict: RAF_DICT }; },
  }[m.raf];
  if (!run) return;
  run().then((r) => reply(r ?? {})).catch((e) => reply({ error: String(e.message || e) }));
  return true;  // async reply
});
