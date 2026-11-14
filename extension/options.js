const $ = (id) => document.getElementById(id);

// ---------- Connection ----------
(async () => { const s = await rafSettings(); $("server").value = s.server; $("token").value = s.token; })();
$("save").onclick = async () => {
  await chrome.storage.sync.set({ server: $("server").value.trim().replace(/\/$/, ""), token: $("token").value.trim() });
  try { const r = await rafApi("/api/tags"); $("msg").textContent = t("connected", r.tags.length); $("msg").className = ""; }
  catch (e) { $("msg").textContent = t("cantConnect", e.message || e); $("msg").className = "err"; }
};

// ---------- Language ----------
chrome.storage.sync.get("lang").then(({ lang = "auto" }) => {
  const r = document.querySelector(`#langs input[value="${lang}"]`); if (r) r.checked = true;
});
document.querySelectorAll('#langs input').forEach((r) => r.onchange = async () => {
  await rafLoadLang(r.value);                    // cache for the popup (sync, no flash)
  await chrome.storage.sync.set({ lang: r.value });  // background + content scripts follow via onChanged
  location.reload();
});

// ---------- Features ----------
let flashTimer;
function flash() { $("flash").textContent = t("optSavedFlash"); $("flash").classList.add("show"); clearTimeout(flashTimer); flashTimer = setTimeout(() => $("flash").classList.remove("show"), 1200); }

async function setFeatures(changes) {
  const { features = {} } = await chrome.storage.sync.get("features");
  await chrome.storage.sync.set({ features: { ...features, ...changes } });
  flash(); render();
}

async function render() {
  const on = await rafFeatures();
  const groups = [...new Set(RAF_FEATURES.map((f) => f.group))];
  $("features").innerHTML = groups.map((g) => `<div class="fgroup"><h3>${t(g)}</h3>` +
    RAF_FEATURES.filter((f) => f.group === g).map((f) => `
      <label class="frow ${on[f.id] ? "" : "off"}">
        <span class="fic">${ic(f.icon)}</span>
        <span class="ft"><b>${t("f_" + f.id)}</b><small>${t("fd_" + f.id)}</small></span>
        <span class="sw"><input type="checkbox" data-f="${f.id}" ${on[f.id] ? "checked" : ""}><span></span></span>
      </label>`).join("") + "</div>").join("");
  document.querySelectorAll("[data-f]").forEach((cb) => cb.onchange = () => setFeatures({ [cb.dataset.f]: cb.checked }));
}
$("all-on").onclick = () => setFeatures(Object.fromEntries(RAF_FEATURES.map((f) => [f.id, true])));
$("all-off").onclick = () => setFeatures(Object.fromEntries(RAF_FEATURES.map((f) => [f.id, false])));
render();
