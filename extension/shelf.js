// Local shelf (no server): browse, search, delete, export / import — everything stays in this browser.
const $ = (id) => document.getElementById(id);
let tag = "", timer, tgOn = false;

function fmtDate(sec) {
  return new Date(sec * 1000).toLocaleDateString(rafLocale(), { day: "numeric", month: "short", year: "numeric" });
}
function card(it) {
  let host = ""; try { host = new URL(it.url).hostname.replace(/^www\./, ""); } catch (e) {}
  const fav = it.favicon && /^(https?:|data:image\/)/.test(it.favicon) ? `<img src="${escHtml(it.favicon)}" alt="">` : ic("bookmark");
  return `<article class="it">
    <span class="fav">${fav}</span>
    <div><a class="t" href="${escHtml(it.url)}" target="_blank" rel="noopener">${escHtml(it.title || it.url)}</a>
      <div class="m">${escHtml(host)} · ${escHtml(fmtDate(it.created_at))}</div>
      ${it.description ? `<p class="d">${escHtml(it.description.slice(0, 220))}</p>` : ""}
      ${it.note ? `<p class="n">${escHtml(it.note)}</p>` : ""}
      ${it.tags.length ? `<div class="tg">${it.tags.map((x) => `<span>#${escHtml(x)}</span>`).join("")}</div>` : ""}
      ${it.screenshot ? `<a class="shot" href="${escHtml(it.url)}" target="_blank" rel="noopener"><img src="${escHtml(it.screenshot)}" alt=""></a>` : ""}
    </div>
    <div class="acts"><button class="mail" data-id="${it.id}" title="${escHtml(t("sendMail"))}">${ic("mail")}</button>${tgOn ? `<button class="send" data-id="${it.id}" title="${escHtml(t("sendTelegram"))}">${ic("send")}</button>` : ""}
    <button class="del" data-id="${it.id}" title="${escHtml(t("shelfDelete"))}">${ic("trash")}</button></div>
  </article>`;
}

async function render() {
  const q = $("q").value.trim();
  const [items, tags, total] = await Promise.all([rafLocalSearch({ q, tag, limit: 500 }), rafLocalTags(), rafLocalCount(0)]);
  $("tags").innerHTML = tags.map((x) => `<button data-tag="${escHtml(x.tag)}" class="${x.tag === tag ? "on" : ""}">#${escHtml(x.tag)} ${x.n}</button>`).join("");
  $("summary").textContent = q || tag ? t("shelfResults", items.length) : total ? t("shelfTotal", total) : "";
  $("list").innerHTML = items.map(card).join("") || `<div class="empty">${escHtml(total ? t("shelfNoMatch") : t("shelfEmpty"))}</div>`;
}

$("q").oninput = () => { clearTimeout(timer); timer = setTimeout(render, 150); };
$("tags").onclick = (e) => { const b = e.target.closest("[data-tag]"); if (!b) return; tag = tag === b.dataset.tag ? "" : b.dataset.tag; render(); };
$("list").onclick = async (e) => {
  const ml = e.target.closest(".mail");
  if (ml) { await rafSendByMail((await rafLocalAll()).find((x) => x.id === +ml.dataset.id)); return; }
  const s = e.target.closest(".send");
  if (s) {
    const it = (await rafLocalAll()).find((x) => x.id === +s.dataset.id);
    s.disabled = true;
    try { await rafSendToTelegram(it); s.innerHTML = ic("check", "ok"); $("note").textContent = t("sentTelegram"); }
    catch (err) { $("note").textContent = String(err.message || err); s.disabled = false; }
    return;
  }
  const b = e.target.closest(".del"); if (!b) return;
  if (!confirm(t("shelfConfirmDelete"))) return;
  await rafLocalDelete(b.dataset.id); render();
};
$("export").onclick = async () => {
  const blob = new Blob([JSON.stringify(await rafLocalExport(), null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `raf-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$("import").onchange = async () => {
  const f = $("import").files[0]; if (!f) return;
  try { const n = await rafLocalImport(JSON.parse(await f.text())); $("note").textContent = t("shelfImported", n); }
  catch (e) { $("note").textContent = String(e.message || e); }
  $("import").value = ""; render();
};

(async () => {
  await rafI18nReady; rafApplyDom();
  tgOn = await rafTgReady();
  if (!(await rafIsLocal())) $("note").textContent = t("shelfServerNote");
  render();
})();
