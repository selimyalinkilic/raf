// "Download with Raf" button on top of videos (content script on video sites).
// Hover a video → a small Raf pill appears in its corner → pick a quality → the server downloads it,
// the file lands in Downloads/Raf. Everything talks to the server through the background worker.
(() => {
  if (window.top !== window) return;
  // Re-injected after an update: retire the previous (orphaned) instance first — its teardown needs no chrome.* APIs
  try { window.__rafOverlayTeardown?.(); } catch (e) {}
  // After the extension is reloaded/updated, this script keeps running in already-open tabs but loses
  // access to chrome.* ("Extension context invalidated"). Detect that and quietly remove ourselves.
  const alive = () => { try { return !!chrome.runtime?.id; } catch (e) { return false; } };
  let DICT = null;  // language picked in Settings (null = browser language)
  const M = (k, ...s) => {
    const m = DICT?.[k]?.message; if (m != null) return m.replace(/\$(\d)/g, (_, n) => (s[n - 1] ?? "") + "");
    try { return chrome.i18n.getMessage(k, s.map(String)) || k; } catch (e) { return k; }
  };
  const send = (msg) => new Promise((res) => {
    if (!alive()) { teardown(); return res({ error: "Raf was updated — reload this page" }); }
    try { chrome.runtime.sendMessage(msg, (r) => res(r || { error: chrome.runtime.lastError?.message || "?" })); }
    catch (e) { teardown(); res({ error: "Raf was updated — reload this page" }); }
  });
  const cleanups = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };
  function teardown() { cleanups.splice(0).forEach((f) => f()); hostEl?.remove(); if (window.__rafOverlayTeardown === teardown) window.__rafOverlayTeardown = null; }
  window.__rafOverlayTeardown = teardown;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const mb = (b) => (!b ? "" : b > 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1048576)) + " MB");
  const svg = (d, s = 15) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    dl: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
    music: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', 14),
    video: svg('<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>', 14),
    check: svg('<path d="M20 6 9 17l-5-5"/>'), spin: svg('<path d="M21 12a9 9 0 1 1-6.22-8.56"/>'), alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>'),
  };

  // ---------- which URL does this video belong to? ----------
  function targetUrl(video) {
    const host = location.hostname;
    const pick = (sel) => { const a = video.closest(sel)?.querySelector?.("a[href]") || null; return a?.href; };
    if (/youtube\.com$/.test(host)) {
      if (video.closest("#movie_player, ytd-player, #shorts-player, ytd-reel-video-renderer")) return location.href;
      const a = video.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-rich-grid-media")?.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
      return a?.href || location.href;
    }
    if (/(^|\.)(x|twitter)\.com$/.test(host)) {
      const art = video.closest("article"); const a = art && [...art.querySelectorAll('a[href*="/status/"]')].find((x) => /\/status\/\d+$/.test(x.pathname));
      return a?.href || location.href;
    }
    if (/instagram\.com$/.test(host)) {
      if (/\/(p|reel|reels|tv)\//.test(location.pathname)) return location.href;
      const art = video.closest("article"); const a = art?.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      return a?.href || location.href;
    }
    if (/tiktok\.com$/.test(host)) {
      const a = video.closest('[data-e2e="recommend-list-item-container"], article, div[class*="DivItemContainer"]')?.querySelector('a[href*="/video/"]');
      return a?.href || location.href;
    }
    if (/reddit\.com$/.test(host)) {
      const post = video.closest("shreddit-post"); const p = post?.getAttribute("permalink");
      return p ? new URL(p, location.origin).href : location.href;
    }
    return pick("article") || location.href;
  }

  // ---------- UI ----------
  const hostEl = document.createElement("div");
  hostEl.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647";
  const root = hostEl.attachShadow({ mode: "open" });
  hostEl.id = "__raf_video_btn";
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:Nunito,"Segoe UI",system-ui,-apple-system,sans-serif}
    .pill{position:fixed;display:none;align-items:center;gap:6px;padding:6px 11px 6px 9px;border-radius:999px;border:2px solid #fff;
      background:#d9ccff;color:#3d3a5c;font:800 13px sans-serif;cursor:pointer;box-shadow:0 3px 0 #ab97ec,0 6px 18px rgba(0,0,0,.35);
      transition:transform .12s, opacity .15s;opacity:.92;user-select:none}
    .pill:hover{transform:translateY(-1px);opacity:1}.pill.show{display:inline-flex}
    .pill.busy{background:#c6e3ff;box-shadow:0 3px 0 #86b9ec,0 6px 18px rgba(0,0,0,.35)}
    .pill.ok{background:#bdf0d6;box-shadow:0 3px 0 #7fd0a8,0 6px 18px rgba(0,0,0,.35)}
    .pill.err{background:#ffd0e2;box-shadow:0 3px 0 #ee97b8,0 6px 18px rgba(0,0,0,.35)}
    .spin svg{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
    .menu{position:fixed;display:none;width:250px;background:#fffaf4;color:#3d3a5c;border:3px solid #fff;outline:2px solid #ab97ec;
      border-radius:16px;box-shadow:0 5px 0 #ab97ec,0 18px 40px rgba(0,0,0,.35);padding:10px}
    .menu.show{display:block}
    .t{font:700 13px sans-serif;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .o{display:flex;align-items:center;gap:8px;width:100%;border:2px solid #fff;border-radius:11px;background:#fff;padding:7px 9px;margin:0 0 5px;
      cursor:pointer;font:800 13px sans-serif;color:#3d3a5c;box-shadow:0 2px 0 #e6e1f5;text-align:left}
    .o:hover{background:#efe9ff;box-shadow:0 2px 0 #ab97ec}
    .o .sz{margin-left:auto;font:700 11px sans-serif;color:#8b86a8}
    .o .note{font:700 10px sans-serif;color:#b07a50;background:#fff0e8;border-radius:6px;padding:1px 5px}
    .o.audio{background:#f3fcf7}
    .msg{font:700 12px sans-serif;color:#8b86a8;padding:6px 2px;display:flex;gap:6px;align-items:center}
    .msg.err{color:#c0392b}
  </style><div class="pill"></div><div class="menu"></div>`;
  const pill = root.querySelector(".pill"), menu = root.querySelector(".menu");
  let current = null, hideTimer = null, menuOpen = false, enabled = false, job = null, local = false;

  function mount() { const parent = document.fullscreenElement || document.documentElement; if (hostEl.parentNode !== parent) parent.appendChild(hostEl); }
  function idle() { pill.className = "pill show"; pill.innerHTML = `${I.dl}<span>Raf</span>`; pill.title = M("ovTitle"); }
  // A video is usable only while it's still in the page and at least partly on screen
  // (Instagram/X remove off-screen videos while you scroll → their rect becomes 0,0).
  function onScreen(video) {
    if (!video || !video.isConnected) return null;
    const r = video.getBoundingClientRect();
    if (r.width < 160 || r.height < 90) return null;
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (bottom - top < 48 || r.right < 40 || r.left > innerWidth - 40) return null;
    return { left: r.left, top };  // pin to the visible part of the video
  }
  function place(video) {
    const v = onScreen(video);
    if (!v) return false;
    pill.style.left = Math.max(6, v.left + 10) + "px"; pill.style.top = Math.max(6, v.top + 10) + "px";
    return true;
  }
  function hideNow() { clearTimeout(hideTimer); pill.classList.remove("show"); current = null; if (menuOpen) { menu.classList.remove("show"); menuOpen = false; } }
  function show(video) {
    if (!enabled) return;
    current = video; mount();
    if (!place(video)) return hideNow();
    if (!job) idle(); else pill.classList.add("show");
    clearTimeout(hideTimer);
    follow();
  }
  // While the pill is visible, re-check every frame: follow the video, switch to the video now under the
  // cursor (wheel scrolling moves content without a mousemove), or hide when the video is gone.
  let following = false, lastX = -1, lastY = -1;
  function follow() {
    if (following) return; following = true;
    const tick = () => {
      if (!pill.classList.contains("show") || !alive()) { following = false; return; }
      if (!place(current)) {
        const v = lastX >= 0 ? videoAt(lastX, lastY) : null;
        if (v && v !== current) { current = v; place(v); if (menuOpen) closeMenu(); }
        else if (!job) { hideNow(); following = false; return; }
        else pill.classList.remove("show");  // download keeps running; pill comes back on the next hover
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function hideSoon() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!menuOpen && !job) { pill.classList.remove("show"); current = null; } }, 1600); }
  function closeMenu() { menu.classList.remove("show"); menuOpen = false; hideSoon(); }

  function videoAt(x, y) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el instanceof HTMLVideoElement) { const r = el.getBoundingClientRect(); if (r.width >= 160 && r.height >= 90) return el; }
    }
    return null;
  }
  let raf = 0;
  on(document, "mousemove", (e) => {
    if (!alive()) return teardown();
    if (!enabled || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      lastX = e.clientX; lastY = e.clientY;
      if (e.composedPath().includes(hostEl)) { clearTimeout(hideTimer); return; }
      const v = videoAt(e.clientX, e.clientY);
      if (v) show(v); else if (current) hideSoon();
    });
  }, { passive: true, capture: true });
  on(window, "scroll", () => {
    if (menuOpen) closeMenu();
    // the frame loop handles following/hiding; on scroll also pick up a new video under a resting cursor
    if (enabled && lastX >= 0 && !pill.classList.contains("show")) { const v = videoAt(lastX, lastY); if (v) show(v); }
  }, { passive: true, capture: true });
  on(document, "fullscreenchange", () => { mount(); if (current) place(current); });
  on(document, "keydown", (e) => { if (e.key === "Escape" && menuOpen) closeMenu(); }, true);
  on(document, "click", (e) => { if (menuOpen && !e.composedPath().includes(hostEl)) closeMenu(); }, true);

  // No server: one click saves the video straight from the page (Instagram, plain MP4 sites)
  async function localDownload() {
    if (job) return;
    job = "local"; pill.className = "pill show busy spin"; pill.innerHTML = `${I.spin}<span>${esc(M("ovSaving"))}</span>`;
    const r = await send({ raf: "local", url: targetUrl(current), src: current?.currentSrc || "" });
    job = null;
    if (r.error) return fail(r.error);
    pill.className = "pill show ok"; pill.innerHTML = `${I.check}<span>${esc(M("ovDone"))}</span>`; pill.title = r.filename || "";
    setTimeout(() => { idle(); hideSoon(); }, 3500);
  }

  async function openMenu() {
    if (job) return;
    const url = targetUrl(current);
    const r = pill.getBoundingClientRect();
    menu.style.left = Math.min(innerWidth - 262, r.left) + "px"; menu.style.top = Math.min(innerHeight - 60, r.bottom + 8) + "px";
    menu.innerHTML = `<div class="msg spin">${I.spin} ${esc(M("ovLoading"))}</div>`;
    menu.classList.add("show"); menuOpen = true;
    const f = await send({ raf: "formats", url });
    if (!menuOpen) return;
    if (f.error) { menu.innerHTML = `<div class="msg err">${I.alert} ${esc(f.error.slice(0, 160))}</div>`; return; }
    menu.innerHTML = `<p class="t">${esc(f.title || url)}</p>` + f.options.map((o, i) => `
      <button class="o ${o.kind}" data-i="${i}">${o.kind === "audio" ? I.music : I.video}<span>${esc(o.kind === "audio" ? M("ovAudio") : o.label)}</span>
        ${o.quality > 1080 ? `<span class="note">${esc(M("ovPcOnly"))}</span>` : ""}<span class="sz">${mb(o.size)}</span></button>`).join("");
    menu.querySelectorAll(".o").forEach((b) => (b.onclick = () => start(url, f.options[+b.dataset.i])));
  }

  async function start(url, opt) {
    closeMenu();
    pill.className = "pill show busy spin"; pill.innerHTML = `${I.spin}<span>${esc(M("ovQueued"))}</span>`;
    const d = await send({ raf: "download", url, kind: opt.kind, quality: opt.quality });
    if (d.error) return fail(d.error);
    job = d.id;
    const tick = async () => {
      const x = await send({ raf: "status", id: job });
      if (x.error) return;
      if (x.status === "running") pill.innerHTML = `${I.spin}<span>${Math.round(x.progress)}%</span>`;
      else if (x.status === "done") { clearInterval(timer); job = null; pill.className = "pill show ok"; pill.innerHTML = `${I.check}<span>${esc(M("ovDone"))}</span>`; send({ raf: "deliver" }); if (onScreen(current)) { place(current); follow(); } setTimeout(() => { idle(); hideSoon(); }, 3500); }
      else if (x.status === "error") { clearInterval(timer); job = null; fail(x.error); }
    };
    const timer = setInterval(tick, 1500); tick();
  }
  function fail(msg) {
    pill.className = "pill show err"; pill.innerHTML = `${I.alert}<span>${esc(M("ovFailed"))}</span>`; pill.title = msg;
    if (local) {  // say why right under the pill (e.g. "this site streams video — needs a Raf server")
      const r = pill.getBoundingClientRect();
      menu.style.left = Math.min(innerWidth - 262, r.left) + "px"; menu.style.top = Math.min(innerHeight - 60, r.bottom + 8) + "px";
      menu.innerHTML = `<div class="msg err">${I.alert} ${esc(msg.slice(0, 200))}</div>`; menu.classList.add("show"); menuOpen = true;
    }
    setTimeout(() => { idle(); hideSoon(); }, 5000);
  }
  pill.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); menuOpen ? closeMenu() : local ? localDownload() : openMenu(); });
  pill.addEventListener("mousedown", (e) => e.stopPropagation());

  // ---------- follow the Settings toggle ----------
  async function sync() {
    if (!alive()) return teardown();
    const d = await send({ raf: "dict" }); DICT = d && !d.error ? d.dict : null;
    const f = await send({ raf: "features" });  // background knows about local mode / store build
    enabled = !!(f && !f.error && f.videoOverlay); local = !!f?.local;
    if (!enabled) { pill.classList.remove("show"); closeMenu(); }
  }
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === "sync" && (ch.features || ch.lang || ch.server || ch.token)) sync(); }); } catch (e) {}
  sync();
})();
