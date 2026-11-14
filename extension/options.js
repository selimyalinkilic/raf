const $ = (id) => document.getElementById(id);
(async () => { const s = await rafSettings(); $("server").value = s.server; $("token").value = s.token; })();
$("save").onclick = async () => {
  await chrome.storage.sync.set({ server: $("server").value.trim().replace(/\/$/, ""), token: $("token").value.trim() });
  try { const r = await rafApi("/api/tags"); $("msg").textContent = `Bağlantı tamam ✓ (${r.tags.length} etiket)`; $("msg").className = ""; }
  catch (e) { $("msg").textContent = "Bağlanamadı: " + (e.message || e); $("msg").className = "err"; }
};
