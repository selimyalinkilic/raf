// Telegram without a server: the user's own bot (token from @BotFather) talks to api.telegram.org directly.
// Settings → Telegram sets it up; the token stays on this computer (chrome.storage.local, not synced).
// - send: popup "Send to Telegram", right-click, shelf items, optionally every save
// - listen (while Chrome is open): links sent to the bot are saved to the shelf; /son /bugun /ara answer from it
const RAF_TG_API = "https://api.telegram.org";
// Shared Raf bot (worker/ in this repo): one tap to connect, no @BotFather. Empty = only "your own bot" is offered.
const RAF_HUB = "";

async function rafTgGet() { const { tg = {} } = await chrome.storage.local.get("tg"); return tg; }
async function rafTgSet(patch) { const tg = { ...(await rafTgGet()), ...patch }; await chrome.storage.local.set({ tg }); return tg; }
async function rafTgReady() { const tg = await rafTgGet(); return !!((tg.token || tg.hub) && tg.chatId); }

async function rafTgCall(method, params = {}, token) {
  if (!token) { const tg = await rafTgGet(); if (tg.hub) return rafHubCall(method, params, tg.hub); token = tg.token; }
  if (!token) throw new Error(t("tgNotSetUp"));
  let r;
  try {
    r = await fetch(`${RAF_TG_API}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  } catch (e) { throw new Error(t("tgUnreachable")); }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(r.status === 401 || r.status === 404 ? t("tgBadToken") : j.description || "Telegram HTTP " + r.status);
  return j.result;
}

const rafTgEsc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const rafTgTag = (x) => "#" + String(x).trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]+/gu, "_");
function rafTgFormat({ url, title, tags = [], note = "" }) {
  const lines = [`🔖 <b>${rafTgEsc(title || url)}</b>`, rafTgEsc(url)];
  const tg = (tags || []).filter(Boolean);
  if (tg.length) lines.push(tg.map(rafTgTag).join(" "));
  if (note) lines.push("📝 " + rafTgEsc(note));
  return lines.join("\n");
}

// Send a page / saved item: own bot if set up, otherwise the Raf server's bot, otherwise explain how to set it up.
async function rafSendToTelegram(item) {
  const tg = await rafTgGet();
  if ((tg.token || tg.hub) && tg.chatId) {
    await rafTgCall("sendMessage", { chat_id: tg.chatId, text: rafTgFormat(item), parse_mode: "HTML", link_preview_options: { url: item.url } });
    return "bot";
  }
  if (!(await rafIsLocal())) {
    await rafApi("/api/send-to-phone", { method: "POST", body: JSON.stringify({ url: item.url, title: item.title || "", note: item.note || "", tags: item.tags || [] }) });
    return "server";
  }
  throw new Error(t("tgNotSetUp"));
}
async function rafTgAvailable() { return (await rafTgReady()) || !(await rafIsLocal()); }

// ---------- Shared bot (Raf hub): same calls, the hub holds the bot token and knows the user's chat ----------
async function rafHubFetch(path, body) {
  let r;
  try { r = await fetch(RAF_HUB + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(t("tgUnreachable")); }
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error === "not_linked" ? t("tgHubUnlinked") : j.error === "daily_limit" ? t("tgHubLimit") : j.error || "Raf hub HTTP " + r.status);
  return j;
}
async function rafHubCall(method, params, secret) {
  if (method === "sendMessage") return (await rafHubFetch("/send", { secret, text: params.text, parse_mode: params.parse_mode, link_preview_options: params.link_preview_options })).result;
  if (method === "getUpdates") return (await rafHubFetch("/inbox", { secret, offset: params.offset || 0 })).result;
  throw new Error("hub: " + method);
}
// 1) get a code + secret, open t.me/<bot>?start=<code>   2) wait until the user tapped Start
async function rafHubConnect() {
  const r = await rafHubFetch("/link", {});
  await chrome.storage.local.set({ tg: { hub: r.secret, bot: r.bot, offset: 0, listen: true, autoSend: false } });
  return r;
}
async function rafHubWait(onTick) {
  for (let i = 0; i < 90; i++) {
    const tg = await rafTgGet();
    if (!tg.hub) return null;
    const s = await rafHubFetch("/status", { secret: tg.hub }).catch(() => ({}));
    if (s.linked) { await rafTgSet({ chatId: s.chat_id, chatName: s.name }); return s; }
    onTick?.(i);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

// ---------- Setup (Settings page) ----------
// 1) check the token → bot username   2) wait for the user's /start → remember that chat
async function rafTgConnect(token) {
  token = token.trim().replace(/^bot/i, "");
  if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error(t("tgBadToken"));
  const me = await rafTgCall("getMe", {}, token);
  await rafTgCall("deleteWebhook", {}, token).catch(() => {});  // getUpdates doesn't work while a webhook is set
  // skip anything sent before this moment
  const old = await rafTgCall("getUpdates", { offset: -1, timeout: 0 }, token).catch(() => []);
  const offset = old.length ? old[old.length - 1].update_id + 1 : 0;
  await chrome.storage.local.set({ tg: { token, bot: me.username, botName: me.first_name, offset, listen: true, autoSend: false } });
  return me;
}
// Poll for the /start message (up to ~2 minutes). Returns the chat or null.
async function rafTgWaitForStart(onTick) {
  for (let i = 0; i < 60; i++) {
    const tg = await rafTgGet();
    if (!tg.token) return null;
    const ups = await rafTgCall("getUpdates", { offset: tg.offset || 0, timeout: 0, allowed_updates: ["message"] }).catch(() => []);
    let offset = tg.offset || 0, chat = null;
    for (const u of ups) { offset = u.update_id + 1; const m = u.message; if (m?.chat?.type === "private" && /^\/start\b/.test(m.text || "")) chat = m.chat; }
    await rafTgSet({ offset });
    if (chat) {
      await rafTgSet({ chatId: chat.id, chatName: chat.first_name || chat.username || "" });
      await rafTgCall("sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: t("tgWelcome") });
      return chat;
    }
    onTick?.(i);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
async function rafTgDisconnect() {
  const tg = await rafTgGet();
  if (tg.hub) await rafHubFetch("/unlink", { secret: tg.hub }).catch(() => {});
  await chrome.storage.local.remove("tg");
}

// ---------- Listening (background, while Chrome is open) ----------
const RAF_URL_RE = /https?:\/\/[^\s<>"']+/i;
async function rafTgReply(text) { const tg = await rafTgGet(); return rafTgCall("sendMessage", { chat_id: tg.chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }); }
function rafTgList(items) {
  if (!items.length) return t("tgNothing");
  return items.map((x, i) => `${i + 1}. <a href="${rafTgEsc(x.url)}">${rafTgEsc((x.title || x.url).slice(0, 90))}</a>${x.tags?.length ? " " + x.tags.map(rafTgTag).join(" ") : ""}`).join("\n");
}
async function rafTgHandle(m) {
  const text = (m.text || m.caption || "").trim();
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (cmd) {
    const [, c, arg] = cmd;
    if (c === "start" || c === "help" || c === "yardim") return rafTgReply(t("tgHelp"));
    if (c === "son" || c === "last") return rafTgReply(rafTgList((await rafApi("/api/items?limit=5")).items));
    if (c === "bugun" || c === "today") {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const items = (await rafApi("/api/items?limit=50")).items.filter((x) => x.created_at >= d.getTime() / 1000);
      return rafTgReply(rafTgList(items));
    }
    if (c === "ara" || c === "search") {
      if (!arg.trim()) return rafTgReply(t("tgSearchHow"));
      return rafTgReply(rafTgList((await rafApi("/api/items?limit=8&q=" + encodeURIComponent(arg.trim()))).items));
    }
    return rafTgReply(t("tgHelp"));
  }
  const url = (text.match(RAF_URL_RE) || [])[0];
  if (!url) return rafTgReply(t("tgSendALink"));
  const tags = [...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((x) => x[1]);
  const note = text.replace(url, "").replace(/#[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim();
  const r = await rafApi("/api/items", { method: "POST", body: JSON.stringify({ url, title: "", note, tags, source: "telegram" }) });
  return rafTgReply(`${r.queued ? "🕓 " + t("tgQueued") : "✅ " + (r.new ? t("tgSaved") : t("tgUpdated"))}\n${rafTgEsc(url)}${tags.length ? "\n" + tags.map(rafTgTag).join(" ") : ""}`);
}
let rafTgPolling = false;
async function rafTgPoll() {
  if (rafTgPolling) return; rafTgPolling = true;
  try {
    const tg = await rafTgGet();
    if (!(tg.token || tg.hub) || !tg.chatId || tg.listen === false) return;
    const ups = await rafTgCall("getUpdates", { offset: tg.offset || 0, timeout: 0, allowed_updates: ["message"] });
    let offset = tg.offset || 0;
    for (const u of ups) {
      offset = u.update_id + 1;
      await rafTgSet({ offset });  // never handle the same message twice, even if the next one fails
      const m = u.message;
      if (!m || String(m.chat?.id) !== String(tg.chatId)) continue;  // only the owner's chat
      try { await rafTgHandle(m); } catch (e) { rafTgReply("⚠️ " + rafTgEsc(e.message || e)).catch(() => {}); }
    }
  } catch (e) { /* offline / token revoked: try again on the next alarm */ }
  finally { rafTgPolling = false; }
}

// ---------- Email (no server: open a ready draft in the user's mail app / Gmail / Outlook) ----------
async function rafMailGet() { const { mail = {} } = await chrome.storage.sync.get("mail"); return { to: "", via: "default", ...mail }; }
function rafMailBody({ url, title, tags = [], note = "" }) {
  return [title && title !== url ? title : "", url, (tags || []).filter(Boolean).map((x) => "#" + String(x).replace(/^#+/, "")).join(" "), note ? "📝 " + note : ""]
    .filter(Boolean).join("\n\n") + "\n\n— " + "Raf";
}
function rafMailUrl(item, { to = "", via = "default" } = {}) {
  const su = (item.title || item.url).slice(0, 200), body = rafMailBody(item), e = encodeURIComponent;
  if (via === "gmail") return `https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(su)}&body=${e(body)}`;
  if (via === "outlook") return `https://outlook.live.com/mail/0/deeplink/compose?to=${e(to)}&subject=${e(su)}&body=${e(body)}`;
  return `mailto:${e(to).replace(/%40/g, "@")}?subject=${e(su)}&body=${e(body)}`;
}
async function rafSendByMail(item) {
  const m = await rafMailGet(), url = rafMailUrl(item, m);
  if (url.startsWith("mailto:")) {  // hand it to the system's mail app without leaving an empty tab behind
    const tab = await chrome.tabs.create({ url, active: false });
    setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 1500);
  } else await chrome.tabs.create({ url });
  return m;
}
