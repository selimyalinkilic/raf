const $ = (id) => document.getElementById(id);

// ---------- Connection ----------
(async () => { const s = await rafSettings(); $("server").value = s.server; $("token").value = s.token; })();
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
