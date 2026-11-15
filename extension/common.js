// Helpers shared by the popup and the background worker
// "full" = GitHub / served by your Raf server. "store" = Chrome Web Store build (scripts/build-store.sh):
// no YouTube downloads, cookies permission is optional.
const RAF_BUILD = self.RAF_BUILD || "full";
const RAF_YT_INFO = "https://github.com/selimyalinkilic/raf#youtube-downloads";
function rafStoreBlocked(url) {
  if (RAF_BUILD !== "store") return false;
  try { return /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(new URL(url).hostname); } catch (e) { return false; }
}
async function rafIsLocal() { const { server, token } = await rafSettings(); return !server || !token; }

async function rafSettings() {
  const d = self.RAF_DEFAULTS || {};
  const s = await chrome.storage.sync.get(["server", "token"]);
  return { server: (s.server || d.server || "").replace(/\/$/, ""), token: s.token || d.token || "" };
}

async function rafApi(path, opts = {}) {
  const { server, token } = await rafSettings();
  if (!server || !token) return rafLocal(path, opts);  // local mode (local.js)
  const res = await fetch(server + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = txt; try { detail = JSON.parse(txt).detail || txt; } catch (e) {}
    throw new Error(String(detail || "HTTP " + res.status));
  }
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
  if (!chrome.cookies && RAF_BUILD !== "store") miss.push("cookies");  // optional in the store build
  return miss;
}



async function rafFormats(url) {
  if (rafStoreBlocked(url)) throw new Error(t("ytStoreBlocked"));
  const cookies = await rafCookiesFor(url);
  return rafApi("/api/formats", { method: "POST", body: JSON.stringify({ url, cookies }) });
}

async function rafStartDownload(url, kind = "video", quality = 0) {
  if (rafStoreBlocked(url)) throw new Error(t("ytStoreBlocked"));
  if (rafMissingPermissions().length) throw new Error(t("reloadNeeded"));
  const cookies = await rafCookiesFor(url);
  const d = await rafApi("/api/downloads", { method: "POST", body: JSON.stringify({ url, kind, cookies, quality }) });
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

// ---------- Locator picker ----------
async function rafStartPicker(tabId) {
  const i18n = { title: t("pkTitle"), hint: t("pkHint"), again: t("pkAgain"), copy: t("copy"), copied: t("copied"),
    unique: t("pkUnique"), matches: t("pkMatches"), none: t("pkNone"), recommended: t("pkRecommended") };
  await chrome.scripting.executeScript({ target: { tabId }, func: (x) => { window.__RAF_PICKER_I18N = x; }, args: [i18n] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
}

// ---------- Fill form with one consistent fake person ----------
function rafFillPage(overwrite = false) {
  const TD = self.RAF_TESTDATA, G = TD.GEN;
  const first = G.firstName(), last = G.lastName(), fold = (x) => TD.fold(x).replace(/[^a-z]/g, "");
  const person = { firstName: first, lastName: last, fullName: `${first} ${last}`,
    email: `${fold(first)}.${fold(last)}${Math.floor(Math.random() * 100)}@example.com`, username: `${fold(first)}.${fold(last)}` };
  const value = (k) => person[k] ?? G[k]();
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0);
  const labelOf = (el) => { const l = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`); return (l || el.closest("label"))?.innerText || ""; };
  const setVal = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    ["input", "change", "blur"].forEach((ev) => el.dispatchEvent(new Event(ev, { bubbles: true })));
    el.style.outline = "2px solid #7fd0a8"; el.style.outlineOffset = "1px"; setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 1800);
  };
  let filled = 0;
  // Second run on the same page = start over with a new person (overwrite what the previous run filled)
  if (!overwrite && document.documentElement.dataset.rafFilled) overwrite = true;
  const check = (el, on) => { if (el.checked !== on) { el.click(); if (el.checked !== on) { el.checked = on; el.dispatchEvent(new Event("change", { bubbles: true })); } } };
  const radioGroups = new Set();
  for (const el of document.querySelectorAll("input, textarea, select")) {
    const type = (el.getAttribute("type") || el.localName).toLowerCase();
    if (!visible(el) || el.disabled || el.readOnly) continue;
    if (type === "checkbox") {
      if (el.required) { check(el, true); filled++; }          // e.g. "I accept the terms"
      else if (!el.checked || overwrite) { check(el, Math.random() < 0.5); filled++; }
      continue;
    }
    if (type === "radio") {
      const key = (el.form ? "f" : "d") + ":" + el.name;
      if (!el.name || radioGroups.has(key)) continue;
      radioGroups.add(key);
      const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)].filter((r) => r.form === el.form && !r.disabled && visible(r));
      if (group.length && (overwrite || !group.some((r) => r.checked))) { check(group[Math.floor(Math.random() * group.length)], true); filled++; }
      continue;
    }
    if (/^(hidden|submit|button|reset|image|file|range|color)$/.test(type)) continue;
    if (el.value && el.value.trim() && !(overwrite && el.dataset.rafFilled)) continue;  // never touch values the user typed
    if (el.localName === "select") { const opts = [...el.options].filter((o) => o.value && !o.disabled); if (opts.length) { setVal(el, opts[Math.floor(Math.random() * opts.length)].value); el.dataset.rafFilled = "1"; filled++; } continue; }
    const desc = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.autocomplete, labelOf(el)].join(" ");
    let k = TD.guess(desc, type);
    if (!k && type === "date") k = "birthdate";
    if (!k) continue;
    let v = k === "birthdate" && type === "date" ? TD.birthIso() : String(value(k));
    const max = el.maxLength > 0 ? el.maxLength : 0;
    if (/^(phone|iban|card|tckn|vkn)$/.test(k) && (max && v.length > max || el.inputMode === "numeric" || type === "number")) {
      v = v.replace(/\s/g, "");
      if (k === "phone" && max && v.length > max) v = v.replace(/^\+90/, "").replace(/^0/, "");
    }
    if (max && v.length > max) v = v.slice(0, max);
    setVal(el, v); el.dataset.rafFilled = "1"; filled++;
  }
  if (filled) document.documentElement.dataset.rafFilled = "1";
  return filled;
}
async function rafFillForm(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["testdata.js"] });
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: rafFillPage });
  return r?.result || 0;
}

// ---------- Video download without a server ----------
// Some sites hand the browser a complete MP4 (Instagram posts and reels, TikTok, plain <video src="…mp4">).
// Those can be saved straight to Downloads/Raf. Streamed sites (YouTube, Reddit, Vimeo, Twitch, X) send
// video and audio in separate pieces that need ffmpeg → they still need a Raf server.
const RAF_BLOCKED = {  // keep in sync with server/app/policy.py
  "netflix.com": "Netflix", "disneyplus.com": "Disney+", "primevideo.com": "Prime Video", "hbomax.com": "HBO Max", "max.com": "Max",
  "hulu.com": "Hulu", "tv.apple.com": "Apple TV+", "paramountplus.com": "Paramount+", "peacocktv.com": "Peacock", "crunchyroll.com": "Crunchyroll",
  "mubi.com": "MUBI", "dazn.com": "DAZN", "skyshowtime.com": "SkyShowtime", "blutv.com": "BluTV", "exxen.com": "Exxen", "gain.tv": "Gain",
  "tabii.com": "tabii", "todtv.com.tr": "TOD", "beinconnect.com.tr": "beIN CONNECT", "digiturkplay.com": "Digiturk Play", "ssportplus.com": "S Sport Plus",
  "tivibu.com.tr": "Tivibu", "tvplus.com.tr": "TV+", "spotify.com": "Spotify", "music.apple.com": "Apple Music", "deezer.com": "Deezer",
  "tidal.com": "TIDAL", "music.amazon.com": "Amazon Music", "music.youtube.com": "YouTube Music",
};
function rafBlockedService(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  const h = u.hostname.toLowerCase();
  for (const [d, name] of Object.entries(RAF_BLOCKED)) if (h === d || h.endsWith("." + d)) return name;
  if (/(^|\.)amazon\./.test(h) && /^\/(gp\/video|video)\//.test(u.pathname)) return "Prime Video";
  return null;
}

// Injected into the page (chrome.scripting) — must be self-contained.
// target: the post / page the video belongs to; src: the <video>'s currentSrc if known.
async function rafFindVideoInPage(target, src) {
  const clean = (s) => String(s || "video").replace(/[\\/:*?"<>|#\n\r\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "video";
  const samePath = (a, b) => { try { return new URL(a).pathname === new URL(b).pathname; } catch (e) { return false; } };
  if (/(^|\.)instagram\.com$/.test(location.hostname)) {
    // Only what this page already loaded — no extra requests to Instagram.
    const codeOf = (u) => (String(u || "").match(/instagram\.com\/(?:[^/?#]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/) || [])[1];
    const code = codeOf(target) || codeOf(location.href) || "video";
    // 1) the video you're pointing at plays a real MP4 file
    if (/^https?:\/\//.test(src || "") && !/\.(m3u8|mpd)(\?|$)/i.test(src)) return { url: src, name: `instagram-${code}` };
    // 2) a post / reel page carries its video addresses in the page data
    if (codeOf(location.href) && codeOf(location.href) === codeOf(target || location.href)) {
      const urls = [], re = /"video_versions":(\[[^\]]*\])/g;
      for (const sc of document.scripts) {
        if (!sc.textContent.includes("video_versions")) continue;
        let x; re.lastIndex = 0;
        while ((x = re.exec(sc.textContent))) { try { const a = JSON.parse(x[1]); if (a[0]?.url && !urls.includes(a[0].url)) urls.push(a[0].url); } catch (e) {} }
      }
      if (urls.length) {
        const url = (src && urls.find((u) => samePath(u, src))) || urls[0];  // carousel: the clip that is playing
        return { url, name: `instagram-${code}${urls.length > 1 ? "-" + (urls.indexOf(url) + 1) : ""}` };
      }
      return { error: "igNoVideo" };
    }
    return { error: "igNoPost" };  // in the feed with a streamed player: open the post first
  }
  // Any site whose <video> plays a real file (not a blob: stream or an HLS/DASH playlist)
  const vids = [...document.querySelectorAll("video")];
  const cands = [src, ...vids.map((v) => v.currentSrc || v.src), ...vids.flatMap((v) => [...v.querySelectorAll("source")].map((s) => s.src))];
  const direct = cands.find((u) => /^https?:\/\//.test(u || "") && !/\.(m3u8|mpd)(\?|$)/i.test(u));
  if (direct) return { url: direct, name: clean(document.title) };
  return { error: "streamed" };
}

// Find the video on this tab and save it to Downloads/Raf. Returns { filename } or throws.
async function rafLocalVideo(tabId, target, src = "") {
  const svc = rafBlockedService(target);
  if (svc) throw new Error(t("blockedService", svc));
  if (rafStoreBlocked(target)) throw new Error(t("ytStoreBlocked"));
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: rafFindVideoInPage, args: [target, src] });
  const v = r?.result;
  if (!v || v.error) throw new Error(t(v?.error === "streamed" ? "localStreamed" : v?.error === "igNoPost" ? "localIgNoPost" : v?.error === "igNoVideo" ? "localIgNoVideo" : "localStreamed"));
  if (rafBlockedService(v.url)) throw new Error(t("blockedService", rafBlockedService(v.url)));
  const ext = (v.url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) || [, "mp4"])[1].toLowerCase();
  const filename = `Raf/${v.name}.${ext}`;
  await chrome.downloads.download({ url: v.url, filename, conflictAction: "uniquify" });
  return { filename };
}
