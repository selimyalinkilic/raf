importScripts("config.js", "common.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "save-page", title: "Bu sayfayı rafa kaldır", contexts: ["page"] });
    chrome.contextMenus.create({ id: "save-link", title: "Linki rafa kaldır", contexts: ["link"] });
    chrome.contextMenus.create({ id: "save-selection", title: "Seçili metni not olarak rafa kaldır", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "uuid", title: "UUID ekle", contexts: ["editable"] });
    chrome.contextMenus.create({ id: "dl-video", title: "Videoyu indir", contexts: ["page", "link", "video"] });
    chrome.contextMenus.create({ id: "dl-audio", title: "Sadece sesi indir (mp3)", contexts: ["page", "link", "video"] });
  });
});

function flash(tabId, ok, msg) {
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#7fd0a8" : "#ee97b8", tabId });
  chrome.action.setBadgeText({ text: ok ? "✓" : "!", tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 2500);
  chrome.notifications.create({ type: "basic", iconUrl: "icons/128.png", title: ok ? "Rafa kaldırıldı" : "Kaydedilemedi", message: msg });
}

async function savePage(tab, extra = {}) {
  const page = (await rafExtract(tab.id)) || { url: tab.url, title: tab.title };
  const body = { url: page.url, title: page.title, description: page.description || "", favicon: page.favicon || tab.favIconUrl || "", text: page.text || "", tags: [], note: "", ...extra };
  return rafApi("/api/items", { method: "POST", body: JSON.stringify(body) });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "uuid") return putUuid(tab, info.frameId);
  if (info.menuItemId.startsWith("dl-")) {
    const target = info.linkUrl || (info.srcUrl && info.srcUrl.startsWith("http") && !info.srcUrl.startsWith("blob:") ? info.srcUrl : null) || tab.url;
    try {
      await rafStartDownload(target, info.menuItemId === "dl-audio" ? "audio" : "video");
      flash(tab.id, true, "İndirme sıraya alındı. Hazır olunca İndirilenler klasörüne iner.");
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
    flash(tab.id, true, `${r.item.title || r.item.url}\nBugün: ${r.today}`);
  } catch (e) {
    flash(tab.id, false, String(e.message || e));
  }
});

async function putUuid(tab, frameId) {
  const { uuidUpper = false, uuidHyphens = true } = await chrome.storage.sync.get(["uuidUpper", "uuidHyphens"]);
  const id = rafUuid({ upper: uuidUpper, hyphens: uuidHyphens });
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, ...(frameId ? { frameIds: [frameId] } : {}) }, func: rafInsertOrCopy, args: [id] });
    const how = r?.result;
    chrome.action.setBadgeBackgroundColor({ color: "#86b9ec", tabId: tab.id });
    chrome.action.setBadgeText({ text: how === "inserted" ? "ID" : how === "copied" ? "⧉" : "!", tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: "", tabId: tab.id }), 1500);
  } catch (e) {
    flash(tab.id, false, "Bu sayfaya yazılamıyor (chrome:// vb.). Popup'taki Araçlar sekmesini kullan.");
  }
}

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (cmd === "insert-uuid") return putUuid(tab);
  if (cmd !== "quick-save") return;
  try {
    const r = await savePage(tab);
    flash(tab.id, true, `${r.item.title || r.item.url}\nBugün: ${r.today}`);
  } catch (e) {
    flash(tab.id, false, String(e.message || e));
  }
});

// ---------- İndirme takibi: bitenleri bilgisayara indir ----------
// Aynı anda iki kontrol çalışmasın (popup + alarm aynı anda tetiklenince dosya iki kez iniyordu)
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
  // Önce listeden düş, SONRA indir: başka bir kontrol aynı işi tekrar göremez
  const done = new Set([...delivered, ...ready.map((d) => d.id)]);
  await chrome.storage.local.set({ pending: left, delivered: [...done].slice(-200) });
  for (const d of ready) {
    if (delivered.includes(d.id)) continue;
    if (d.status === "done") {
      chrome.downloads.download({ url: d.file_url, filename: "Raf/" + d.file.replace(/[\\/:*?"<>|]/g, "_"), conflictAction: "uniquify" });
      chrome.notifications.create("dl-" + d.id, { type: "basic", iconUrl: "icons/128.png", title: "İndirildi ✓", message: d.title || d.file });
    } else {
      chrome.notifications.create("dl-" + d.id, { type: "basic", iconUrl: "icons/128.png", title: "İndirilemedi", message: (d.error || "").slice(0, 200) });
    }
  }
  if (!left.length) chrome.alarms.clear("raf-dl");
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "raf-dl") checkDownloads(); });
chrome.runtime.onMessage.addListener((m) => { if (m === "check-downloads") checkDownloads(); });
