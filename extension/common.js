// Helpers shared by the popup and the background worker
async function rafSettings() {
  const d = self.RAF_DEFAULTS || {};
  const s = await chrome.storage.sync.get(["server", "token"]);
  return { server: (s.server || d.server || "").replace(/\/$/, ""), token: s.token || d.token || "" };
}

async function rafApi(path, opts = {}) {
  const { server, token } = await rafSettings();
  if (!server || !token) throw new Error(t("missingSettings"));
  const res = await fetch(server + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "HTTP " + res.status);
  return res.json();
}

// Runs in the tab: collects title, description, favicon, selection and readable text
function rafExtractPage() {
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content") || "";
  const icon = document.querySelector('link[rel~="icon"]')?.href || "";
  const main = document.querySelector("article, main, [role=main]") || document.body;
  return {
    url: location.href,
    title: meta('meta[property="og:title"]') || document.title || location.href,
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    favicon: icon.startsWith("http") ? icon : "",
    selection: String(window.getSelection() || "").trim().slice(0, 2000),
    text: (main?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 100000),
  };
}

async function rafExtract(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: rafExtractPage });
    return r?.result || null;
  } catch (e) {
    return null; // scripts can't run on chrome:// and similar pages
  }
}

// ---------- UUID ----------
function rafUuid({ upper = false, hyphens = true } = {}) {
  let u = crypto.randomUUID();
  if (!hyphens) u = u.replace(/-/g, "");
  return upper ? u.toUpperCase() : u;
}

// Runs in the tab: type into the focused editable field, otherwise copy to clipboard
function rafInsertOrCopy(text) {
  const el = document.activeElement;
  const editable = el && (el.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.readOnly && !el.disabled));
  if (editable && document.execCommand("insertText", false, text)) return "inserted";
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand("copy"); ta.remove();
  if (el && el.focus) el.focus();
  return ok ? "copied" : "failed";
}

// ---------- Video download ----------
// Export this site's cookies (your session) in Netscape format; the server uses them for this one download only and never stores them.
async function rafCookiesFor(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".").slice(-2).join(".");
    const all = await chrome.cookies.getAll({ domain: base });
    if (!all.length) return "";
    return "# Netscape HTTP Cookie File\n" + all.map((c) => [
      (c.hostOnly ? "" : ".") + c.domain.replace(/^\./, ""), c.hostOnly ? "FALSE" : "TRUE", c.path,
      c.secure ? "TRUE" : "FALSE", Math.floor(c.expirationDate || 0), c.name, c.value].join("\t")).join("\n") + "\n";
  } catch (e) { return ""; }
}

function rafMissingPermissions() {
  const miss = [];
  if (!chrome.alarms) miss.push("alarms");
  if (!chrome.downloads) miss.push("downloads");
  if (!chrome.cookies) miss.push("cookies");
  return miss;
}



async function rafStartDownload(url, kind = "video") {
  if (rafMissingPermissions().length) throw new Error(t("reloadNeeded"));
  const cookies = await rafCookiesFor(url);
  const d = await rafApi("/api/downloads", { method: "POST", body: JSON.stringify({ url, kind, cookies }) });
  const { pending = [], delivered = [] } = await chrome.storage.local.get(["pending", "delivered"]);
  // If the server reused an existing job that was already delivered, don't queue it again
  if (!pending.includes(d.id) && !(d.reused && delivered.includes(d.id))) pending.push(d.id);
  await chrome.storage.local.set({ pending });
  chrome.alarms.create("raf-dl", { periodInMinutes: 0.5 });
  return d;
}

// ---------- Screenshot ----------
async function rafCapture(windowId, format = "jpeg") {
  return chrome.tabs.captureVisibleTab(windowId, format === "png" ? { format: "png" } : { format: "jpeg", quality: 72 });
}
