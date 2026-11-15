const $ = (id) => document.getElementById(id);

// ---------- Connection ----------
(async () => { const s = await rafSettings(); $("server").value = s.server; $("token").value = s.token; $("srv").open = !!(s.server || s.token); })();
$("save").onclick = async () => {
  const server = $("server").value.trim().replace(/\/$/, ""), token = $("token").value.trim();
  if (server) {
    // Ask for access to this server (and, in the store build, cookies for logged-in video sites) — needs this click
    let origin; try { origin = new URL(server).origin + "/*"; } catch (e) { $("msg").textContent = t("cantConnect", e.message); $("msg").className = "err"; return; }
    const perms = { origins: [origin], ...(RAF_BUILD === "store" ? { permissions: ["cookies"] } : {}) };
    await chrome.permissions.request(perms).catch(() => false);
  }
  await chrome.storage.sync.set({ server, token });
  render();
  if (!server || !token) { $("msg").textContent = t("localModeOn"); $("msg").className = ""; return; }
  try { const r = await rafApi("/api/tags"); $("msg").textContent = t("connected", r.tags.length); $("msg").className = ""; }
  catch (e) { $("msg").textContent = t("cantConnect", e.message || e); $("msg").className = "err"; }
};
$("open-shelf").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("shelf.html") });

// ---------- Language ----------
chrome.storage.sync.get("lang").then(({ lang = "auto" }) => {
  const r = document.querySelector(`#langs input[value="${lang}"]`); if (r) r.checked = true;
});
document.querySelectorAll('#langs input').forEach((r) => r.onchange = async () => {
  await rafLoadLang(r.value);                    // cache for the popup (sync, no flash)
  await chrome.storage.sync.set({ lang: r.value });  // background + content scripts follow via onChanged
  location.reload();
});

// ---------- Theme ----------
chrome.storage.sync.get("theme").then(({ theme = "auto" }) => {
  const r = document.querySelector(`#themes input[value="${theme}"]`); if (r) r.checked = true;
});
document.querySelectorAll("#themes input").forEach((r) => r.onchange = () => chrome.storage.sync.set({ theme: r.value }));  // theme.js applies it live

// ---------- Telegram (own bot, no server needed) ----------
async function tgRender() {
  const tg = await rafTgGet();
  const on = !!(tg.token && tg.chatId);
  $("tg-on").hidden = !on; $("tg-off").hidden = on;
  if (on) {
    $("tg-status").innerHTML = `${ic("check", "ok")} ${escHtml(t("tgConnected", "@" + tg.bot, tg.chatName || ""))}`;
    $("tg-auto").checked = !!tg.autoSend; $("tg-listen").checked = tg.listen !== false;
  } else if (tg.token && tg.bot) {  // token OK, waiting for /start
    $("tg-open").hidden = false; $("tg-open").href = `https://t.me/${tg.bot}?start=raf`; $("tg-open").textContent = `@${tg.bot} ↗`;
  }
}
$("tg-connect").onclick = async () => {
  const token = $("tg-token").value;
  $("tg-msg").textContent = t("tgChecking"); $("tg-msg").className = "hint";
  const granted = await chrome.permissions.request({ origins: ["https://api.telegram.org/*"] }).catch(() => false);
  if (!granted) { $("tg-msg").textContent = t("tgNeedPermission"); $("tg-msg").className = "hint err"; return; }
  try {
    const me = await rafTgConnect(token);
    $("tg-token").value = "";
    $("tg-open").hidden = false; $("tg-open").href = `https://t.me/${me.username}?start=raf`; $("tg-open").textContent = `@${me.username} ↗`;
    $("tg-msg").innerHTML = `${ic("spinner", "spin")} ${escHtml(t("tgWaiting", "@" + me.username))}`;
    const chat = await rafTgWaitForStart();
    $("tg-msg").textContent = chat ? "" : t("tgTimeout");
    tgRender();
  } catch (e) { $("tg-msg").textContent = String(e.message || e); $("tg-msg").className = "hint err"; }
};
$("tg-auto").onchange = () => rafTgSet({ autoSend: $("tg-auto").checked });
$("tg-listen").onchange = () => rafTgSet({ listen: $("tg-listen").checked });
$("tg-test").onclick = async () => {
  try { await rafSendToTelegram({ url: "https://github.com/selimyalinkilic/raf", title: t("tgTestTitle"), tags: ["raf"] }); $("tg-msg2").textContent = t("sentTelegram"); }
  catch (e) { $("tg-msg2").textContent = String(e.message || e); }
};
$("tg-disconnect").onclick = async () => { if (!confirm(t("tgConfirmDisconnect"))) return; await rafTgDisconnect(); location.reload(); };
tgRender();

// ---------- Skins ----------
// Each tile is a tiny preview painted with that skin's own colours.
const SKIN_PREVIEW = {
  pastel:    { bg: "linear-gradient(160deg,#fffaf4,#fbf6ff 60%,#f4fbff)", card: "#fff", ink: "#3d3a5c", a: "#d9ccff", ad: "#ab97ec", b: "#bdf0d6", bd: "#7fd0a8", r: 9, font: "Fredoka,Nunito,sans-serif", shadow: "0 3px 0" },
  minimal:   { bg: "#f6f8fa", card: "#fff", ink: "#1f2328", a: "#e8edf4", ad: "#4a6fa5", b: "#dcf2e4", bd: "#2f9e5b", r: 5, font: "system-ui,sans-serif", shadow: "" },
  cyberpunk: { bg: "linear-gradient(160deg,#07060f,#0d0a1c 60%,#050d1a)", card: "#12101f", ink: "#e8f7ff", a: "#2a0f3d", ad: "#ff2bd6", b: "#05302d", bd: "#00f5d4", r: 1, font: "ui-monospace,monospace", glow: true },
  terminal:  { bg: "#030503", card: "#0a100a", ink: "#b9f5b9", a: "#0f2a12", ad: "#39ff14", b: "#0f2a12", bd: "#39ff14", r: 0, font: "ui-monospace,monospace", shadow: "" },
};
function skinTile(id, on) {
  const p = SKIN_PREVIEW[id];
  const sh = (c) => (p.glow ? `0 0 0 1px ${c},0 0 10px -2px ${c}` : p.shadow ? `${p.shadow} ${c}` : "none");
  return `<button class="skin${on ? " on" : ""}" data-skin="${id}" title="${escHtml(t("skin_" + id))}">
    <span class="pv" style="background:${p.bg};font-family:${p.font}">
      <span class="pc" style="background:${p.card};color:${p.ink};border-radius:${p.r}px;${p.shadow || p.glow ? `box-shadow:${sh(p.ad)}` : `border:1px solid ${p.a}`}">
        <b style="color:${p.glow || id === "terminal" ? p.ad : p.ink}">${id === "terminal" ? "&gt; Raf_" : "Raf"}</b>
        <i style="background:${p.a};border-radius:${p.r}px"></i><i style="background:${p.a};border-radius:${p.r}px;width:60%"></i>
        <em style="background:${p.b};border-radius:${p.r}px;box-shadow:${sh(p.bd)}"></em>
      </span>
    </span>
    <span class="nm">${escHtml(t("skin_" + id))}</span><small>${escHtml(t("skind_" + id))}</small></button>`;
}
async function skinsRender() {
  const { skin = "pastel" } = await chrome.storage.sync.get("skin");
  $("skins").innerHTML = RAF_SKINS.map((id) => skinTile(id, id === skin)).join("");
  const darkOnly = RAF_DARK_ONLY.includes(skin);
  document.querySelectorAll("#themes input").forEach((r) => (r.disabled = darkOnly));
  $("themes").classList.toggle("locked", darkOnly);
  $("mode-hint").textContent = darkOnly ? t("optThemeDarkOnly") : t("optThemeHint");
}
$("skins").onclick = async (e) => {
  const b = e.target.closest("[data-skin]"); if (!b) return;
  await chrome.storage.sync.set({ skin: b.dataset.skin });  // theme.js repaints this page right away
  skinsRender();
};
skinsRender();

// ---------- Email ----------
rafMailGet().then((m) => { $("mail-to").value = m.to; const r = document.querySelector(`#mail-via input[value="${m.via}"]`); if (r) r.checked = true; });
async function mailSave() {
  const to = $("mail-to").value.trim(), via = document.querySelector("#mail-via input:checked")?.value || "default";
  if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { $("mail-msg").textContent = t("mailBad"); return; }
  await chrome.storage.sync.set({ mail: { to, via } }); $("mail-msg").textContent = t("optSavedFlash");
}
$("mail-to").onchange = mailSave;
document.querySelectorAll("#mail-via input").forEach((r) => (r.onchange = mailSave));

// ---------- Features ----------
let flashTimer;
function flash() { $("flash").textContent = t("optSavedFlash"); $("flash").classList.add("show"); clearTimeout(flashTimer); flashTimer = setTimeout(() => $("flash").classList.remove("show"), 1200); }

async function setFeatures(changes) {
  const { features = {} } = await chrome.storage.sync.get("features");
  await chrome.storage.sync.set({ features: { ...features, ...changes } });
  flash(); render();
}

async function render() {
  const on = await rafFeatures(), local = await rafIsLocal();
  $("mode").innerHTML = local ? `${ic("inbox")} ${escHtml(t("modeLocal"))}` : `${ic("link")} ${escHtml(t("modeServer"))}`;
  const groups = [...new Set(RAF_FEATURES.map((f) => f.group))];
  $("features").innerHTML = groups.map((g) => `<div class="fgroup"><h3>${t(g)}</h3>` +
    RAF_FEATURES.filter((f) => f.group === g).map((f) => `
      <label class="frow ${on[f.id] ? "" : "off"}${local && f.server ? " locked" : ""}">
        <span class="fic">${ic(f.icon)}</span>
        <span class="ft"><b>${t("f_" + f.id)}</b><small>${local && f.server ? t("needsServer") : t("fd_" + f.id)}</small></span>
        <span class="sw"><input type="checkbox" data-f="${f.id}" ${on[f.id] ? "checked" : ""}${local && f.server ? " disabled" : ""}><span></span></span>
      </label>`).join("") + "</div>").join("");
  document.querySelectorAll("[data-f]").forEach((cb) => cb.onchange = () => setFeatures({ [cb.dataset.f]: cb.checked }));
}
$("all-on").onclick = () => setFeatures(Object.fromEntries(RAF_FEATURES.map((f) => [f.id, true])));
$("all-off").onclick = () => setFeatures(Object.fromEntries(RAF_FEATURES.map((f) => [f.id, false])));
render();
