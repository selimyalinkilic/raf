const $ = (id) => document.getElementById(id);
(async () => { const s = await rafSettings(); $("server").value = s.server; $("token").value = s.token; })();
$("save").onclick = async () => {
  await chrome.storage.sync.set({ server: $("server").value.trim().replace(/\/$/, ""), token: $("token").value.trim() });
  try { const r = await rafApi("/api/tags"); $("msg").textContent = t("connected", r.tags.length); $("msg").className = ""; }
  catch (e) { $("msg").textContent = t("cantConnect", e.message || e); $("msg").className = "err"; }
};
