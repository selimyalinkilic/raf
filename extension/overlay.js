// "Download with Raf" button on top of videos and images (content script on video / social sites).
// Hover a video → a small Raf pill appears in its corner → pick a quality → the server downloads it,
// the file lands in Downloads/Raf. Hover a big image (Instagram, X, Pinterest…) → one click saves it.
// Everything talks to the extension through the background worker. The pill wears the Raf skin.
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
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>'),
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
  // Colours of each Raf skin (same values as popup.css / skins.css). style: how edges and shadows are drawn.
  const SKIN = {
    pastel:        { ink: "#3d3a5c", muted: "#8b86a8", a: "#d9ccff", ad: "#ab97ec", ok: "#bdf0d6", okd: "#7fd0a8", busy: "#c6e3ff", busyd: "#86b9ec", bad: "#ffd0e2", badd: "#ee97b8", card: "#fffaf4", opt: "#fff", rim: "#fff", hover: "#efe9ff", err: "#c0392b" },
    "pastel-dark": { ink: "#eceaf8", muted: "#a39ec2", a: "#463d78", ad: "#7b69cc", ok: "#24584a", okd: "#4aa57f", busy: "#283f5e", busyd: "#5a8cc4", bad: "#5a2d43", badd: "#b0607f", card: "#1b1929", opt: "#26233a", rim: "#26233a", hover: "#2f2b47", err: "#ff8a7a" },
    minimal:       { ink: "#1f2328", muted: "#656d76", a: "#ffffff", ad: "#4a6fa5", ok: "#dcf2e4", okd: "#2f9e5b", busy: "#eaf2fb", busyd: "#3b82c4", bad: "#ffebe9", badd: "#e8a5a5", card: "#f6f8fa", opt: "#fff", rim: "#d8dee4", hover: "#f2f4f7", err: "#cf222e", style: "flat", r: "8px", font: 'system-ui,-apple-system,"Segoe UI",sans-serif' },
    "minimal-dark":{ ink: "#e6edf3", muted: "#8b949e", a: "#161b22", ad: "#58a6ff", ok: "#12301f", okd: "#3fb950", busy: "#132235", busyd: "#58a6ff", bad: "#3d1d20", badd: "#8e4447", card: "#0d1117", opt: "#161b22", rim: "#30363d", hover: "#1c2128", err: "#ff7b72", style: "flat", r: "8px", font: 'system-ui,-apple-system,"Segoe UI",sans-serif' },
    graphite:      { ink: "#2b2b2b", muted: "#707070", a: "#fbfbfa", ad: "#3a3a3a", ok: "#ececec", okd: "#3a3a3a", busy: "#f0f0f0", busyd: "#5a5a5a", bad: "#ececec", badd: "#5a5a5a", card: "#f4f4f2", opt: "#fbfbfa", rim: "#3a3a3a", hover: "#f0f0ee", err: "#a33", style: "hard", r: "6px" },
    cyberpunk:     { ink: "#e8f7ff", muted: "#8f8ac0", a: "#2a0f3d", ad: "#ff2bd6", ok: "#05302d", okd: "#00f5d4", busy: "#0c1d3a", busyd: "#3ab0ff", bad: "#3a0a22", badd: "#ff4d6d", card: "#07060f", opt: "#12101f", rim: "#2b2150", hover: "#1b1630", err: "#ff4d6d", style: "glow", r: "2px", font: 'ui-monospace,"Cascadia Code",Consolas,monospace', upper: true },
    neon:          { ink: "#fff0fb", muted: "#c79bd6", a: "#3a1250", ad: "#ff3fa4", ok: "#0f3a44", okd: "#2de2e6", busy: "#14304a", busyd: "#2de2e6", bad: "#4a0f33", badd: "#ff3fa4", card: "#1a0630", opt: "#1c0a30", rim: "#1c0a30", hover: "#2a1042", err: "#ff5f7a", style: "glow" },
    ocean:         { ink: "#e3f2ff", muted: "#7fa3c2", a: "#12385a", ad: "#3fc1ff", ok: "#0d3b3a", okd: "#2ee6c5", busy: "#12304f", busyd: "#5cb8ff", bad: "#3a1626", badd: "#ff7aa8", card: "#08121f", opt: "#10233a", rim: "rgba(255,255,255,.18)", hover: "#142a45", err: "#ff7a8a", style: "flat" },
    forest:        { ink: "#2f3b2c", muted: "#7a8572", a: "#dfe8d0", ad: "#6f8f4e", ok: "#d6ecd2", okd: "#4f9a5a", busy: "#dbe9e4", busyd: "#5f9a8a", bad: "#f2d9d0", badd: "#d08f7a", card: "#f7f4ea", opt: "#fffdf6", rim: "#fffdf6", hover: "#f1efe2", err: "#b0412e", r: "16px 4px 16px 4px", font: 'Georgia,"Iowan Old Style",serif' },
    sunset:        { ink: "#4a2b3f", muted: "#a07a8c", a: "#ffd3c2", ad: "#ff7a59", ok: "#ffe2b8", okd: "#f5a524", busy: "#e9d9ff", busyd: "#9b6bdf", bad: "#ffd6e0", badd: "#f08aa6", card: "#fff1e6", opt: "#fff", rim: "#fff", hover: "#fff3ef", err: "#c83a4a" },
    paper:         { ink: "#3b2f22", muted: "#8a7a63", a: "#fbf6e9", ad: "#8b5e34", ok: "#e3e5c8", okd: "#6b7d3a", busy: "#e1dccb", busyd: "#5d6f86", bad: "#f0d4c8", badd: "#c08a76", card: "#f4ecd8", opt: "#fbf6e9", rim: "#dccfb2", hover: "#f3ead6", err: "#9e2a1e", style: "flat", r: "4px", font: 'Georgia,"Iowan Old Style","Palatino Linotype",serif' },
    pop:           { ink: "#111", muted: "#555", a: "#ffd23f", ad: "#111", ok: "#7cf2c2", okd: "#111", busy: "#8fd3ff", busyd: "#111", bad: "#ff9fd0", badd: "#111", card: "#fff7d6", opt: "#fff", rim: "#111", hover: "#fff3b0", err: "#d0202a", style: "hard", r: "8px" },
  };
  const DUAL = ["pastel", "minimal"];  // the only skins with a light and a dark version
  root.innerHTML = `<style>
    :host{--font:Nunito,"Segoe UI",system-ui,-apple-system,sans-serif;--r:999px;--rm:16px;--ro:11px}
    *{box-sizing:border-box;font-family:var(--font)}
    .pill{position:fixed;display:none;align-items:center;gap:6px;padding:6px 11px 6px 9px;border-radius:var(--r);border:2px solid var(--rim);
      --bg:var(--a);--sd:var(--ad);background:var(--bg);color:var(--ink);font:800 13px var(--font);text-transform:var(--tt,none);letter-spacing:var(--ls,0);
      cursor:pointer;box-shadow:0 3px 0 var(--sd),0 6px 18px rgba(0,0,0,.35);transition:transform .12s, opacity .15s;opacity:.94;user-select:none}
    .pill:hover{transform:translateY(-1px);opacity:1}.pill.show{display:inline-flex}
    .pill.busy{--bg:var(--busy);--sd:var(--busyd)}.pill.ok{--bg:var(--ok);--sd:var(--okd)}.pill.err{--bg:var(--bad);--sd:var(--badd)}
    .spin svg{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
    .menu{position:fixed;display:none;width:250px;background:var(--card);color:var(--ink);border:3px solid var(--rim);outline:2px solid var(--ad);
      border-radius:var(--rm);box-shadow:0 5px 0 var(--ad),0 18px 40px rgba(0,0,0,.35);padding:10px}
    .menu.show{display:block}
    .t{font:700 13px var(--font);margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .o{display:flex;align-items:center;gap:8px;width:100%;border:2px solid var(--rim);border-radius:var(--ro);background:var(--opt);padding:7px 9px;margin:0 0 5px;
      cursor:pointer;font:800 13px var(--font);color:var(--ink);box-shadow:0 2px 0 var(--hover);text-align:left}
    .o:hover{background:var(--hover);box-shadow:0 2px 0 var(--ad)}
    .o .sz{margin-left:auto;font:700 11px var(--font);color:var(--muted)}
    .o .note{font:700 10px var(--font);color:var(--ink);background:var(--busy);border-radius:6px;padding:1px 5px}
    .o.audio{background:var(--ok)}
    .msg{font:700 12px var(--font);color:var(--muted);padding:6px 2px;display:flex;gap:6px;align-items:center}
    .msg.err{color:var(--err)}
    /* flat: thin border, soft shadow (Minimal, Paper, Ocean) */
    :host([data-style=flat]) .pill{border-width:1px;box-shadow:0 4px 14px rgba(0,0,0,.28)}
    :host([data-style=flat]) .pill:not(.busy):not(.ok):not(.err){border-color:var(--ad)}
    :host([data-style=flat]) .menu{border-width:1px;outline:0;box-shadow:0 14px 34px rgba(0,0,0,.3)}
    :host([data-style=flat]) .o{border-width:1px;box-shadow:none}
    /* hard: thick ink outline + offset shadow (Pop, Graphite) */
    :host([data-style=hard]) .pill,:host([data-style=hard]) .menu{border:2px solid var(--rim);outline:0;box-shadow:3px 3px 0 var(--rim)}
    :host([data-style=hard]) .o{border:2px solid var(--rim);box-shadow:2px 2px 0 var(--rim)}
    /* glow: neon edge (Cyberpunk, Neon Beach) */
    :host([data-style=glow]) .pill{border-color:transparent;box-shadow:0 0 0 1px var(--sd),0 0 16px -2px var(--sd),0 6px 18px rgba(0,0,0,.45)}
    :host([data-style=glow]) .menu{border:1px solid var(--ad);outline:0;box-shadow:0 0 22px -4px var(--ad),0 18px 40px rgba(0,0,0,.5)}
    :host([data-style=glow]) .o{border:1px solid var(--rim);box-shadow:none}
  </style><div class="pill"></div><div class="menu"></div>`;
  const pill = root.querySelector(".pill"), menu = root.querySelector(".menu");
  let current = null, hideTimer = null, menuOpen = false, enabled = false, job = null, local = false;
  let videosOn = false, imagesOn = false;

  // ---------- wear the skin picked in Settings ----------
  let look = { skin: "pastel", theme: "auto" };
  const darkMq = matchMedia("(prefers-color-scheme: dark)");
  function paint() {
    const dark = look.theme === "dark" || (look.theme !== "light" && darkMq.matches);
    const p = (DUAL.includes(look.skin) && dark && SKIN[look.skin + "-dark"]) || SKIN[look.skin] || SKIN.pastel;
    for (const k of ["ink", "muted", "a", "ad", "ok", "okd", "busy", "busyd", "bad", "badd", "card", "opt", "rim", "hover", "err"]) hostEl.style.setProperty("--" + k, p[k]);
    p.font ? hostEl.style.setProperty("--font", p.font) : hostEl.style.removeProperty("--font");
    p.r ? (hostEl.style.setProperty("--r", p.r), hostEl.style.setProperty("--rm", p.r), hostEl.style.setProperty("--ro", p.r)) : ["--r", "--rm", "--ro"].forEach((k) => hostEl.style.removeProperty(k));
    hostEl.style.setProperty("--tt", p.upper ? "uppercase" : "none"); hostEl.style.setProperty("--ls", p.upper ? ".04em" : "0");
    if (p.style) hostEl.dataset.style = p.style; else delete hostEl.dataset.style;
  }
  function loadLook() {
    try { chrome.storage.sync.get(["skin", "theme"]).then((v) => { look = { skin: v.skin || "pastel", theme: v.theme || "auto" }; paint(); }).catch(() => {}); } catch (e) {}
  }
  paint(); loadLook();
  on(darkMq, "change", paint);

  function mount() { const parent = document.fullscreenElement || document.documentElement; if (hostEl.parentNode !== parent) parent.appendChild(hostEl); }
  const isImg = (el) => el instanceof HTMLImageElement;
  function idle() { pill.className = "pill show"; pill.innerHTML = `${isImg(current) ? I.image : I.dl}<span>Raf</span>`; pill.title = M(isImg(current) ? "ovImgTitle" : "ovTitle"); }
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
        const v = lastX >= 0 ? mediaAt(lastX, lastY) : null;
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

  // Video sites show many thumbnails — the image button would just get in the way there
  const VIDEO_ONLY = /(^|\.)(youtube\.com|twitch\.tv|vimeo\.com|dailymotion\.com)$/.test(location.hostname);
  const bigImage = (el) => {
    if (!isImg(el) || !/^(https?|data):/.test(el.currentSrc || el.src || "")) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 180 && r.height >= 150 && Math.max(el.naturalWidth, el.naturalHeight) >= 300;
  };
  // What's under the cursor? Videos win over images (a video's poster is often an <img> under it).
  // elementsFromPoint also sees images that sites cover with an invisible layer (Instagram).
  function mediaAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    if (videosOn) for (const el of els) {
      if (el instanceof HTMLVideoElement) { const r = el.getBoundingClientRect(); if (r.width >= 160 && r.height >= 90) return el; }
    }
    if (imagesOn && !VIDEO_ONLY) for (const el of els) if (bigImage(el)) return el;
    return null;
  }
  // The largest version the page already offers: biggest srcset entry; X → the original size
  function bestImageSrc(img) {
    let best = img.currentSrc || img.src, w = 0;
    for (const part of (img.srcset || "").split(/,\s+(?=\S)/)) {
      const [u, d] = part.trim().split(/\s+/); const n = parseFloat(d) || 0;
      if (u && /w$/.test(d || "") && n > w) { w = n; best = new URL(u, location.href).href; }
    }
    try { const u = new URL(best); if (u.hostname === "pbs.twimg.com" && u.searchParams.has("name")) { u.searchParams.set("name", "orig"); best = u.href; } } catch (e) {}
    return best;
  }
  let raf = 0;
  on(document, "mousemove", (e) => {
    if (!alive()) return teardown();
    if (!enabled || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      lastX = e.clientX; lastY = e.clientY;
      if (e.composedPath().includes(hostEl)) { clearTimeout(hideTimer); return; }
      const v = mediaAt(e.clientX, e.clientY);
      if (v) show(v); else if (current) hideSoon();
    });
  }, { passive: true, capture: true });
  on(window, "scroll", () => {
    if (menuOpen) closeMenu();
    // the frame loop handles following/hiding; on scroll also pick up a new video under a resting cursor
    if (enabled && lastX >= 0 && !pill.classList.contains("show")) { const v = mediaAt(lastX, lastY); if (v) show(v); }
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

  // Images: one click, straight to Downloads/Raf (no server needed)
  async function imageDownload() {
    if (job) return;
    job = "image"; pill.className = "pill show busy spin"; pill.innerHTML = `${I.spin}<span>${esc(M("ovSaving"))}</span>`;
    const r = await send({ raf: "image", url: bestImageSrc(current), page: targetUrl(current) });
    job = null;
    if (r.error) return fail(r.error, true);
    pill.className = "pill show ok"; pill.innerHTML = `${I.check}<span>${esc(M("ovDone"))}</span>`; pill.title = r.filename || "";
    setTimeout(() => { idle(); hideSoon(); }, 2500);
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
  function fail(msg, explain = false) {
    pill.className = "pill show err"; pill.innerHTML = `${I.alert}<span>${esc(M("ovFailed"))}</span>`; pill.title = msg;
    if (local || explain) {  // say why right under the pill (e.g. "this site streams video — needs a Raf server")
      const r = pill.getBoundingClientRect();
      menu.style.left = Math.min(innerWidth - 262, r.left) + "px"; menu.style.top = Math.min(innerHeight - 60, r.bottom + 8) + "px";
      menu.innerHTML = `<div class="msg err">${I.alert} ${esc(msg.slice(0, 200))}</div>`; menu.classList.add("show"); menuOpen = true;
    }
    setTimeout(() => { idle(); hideSoon(); }, 5000);
  }
  pill.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); menuOpen ? closeMenu() : isImg(current) ? imageDownload() : local ? localDownload() : openMenu(); });
  pill.addEventListener("mousedown", (e) => e.stopPropagation());

  // ---------- follow the Settings toggle ----------
  async function sync() {
    if (!alive()) return teardown();
    const d = await send({ raf: "dict" }); DICT = d && !d.error ? d.dict : null;
    const f = await send({ raf: "features" });  // background knows about local mode / store build
    videosOn = !!(f && !f.error && f.videoOverlay); imagesOn = !!(f && !f.error && f.imageOverlay);
    enabled = videosOn || imagesOn; local = !!f?.local;
    if (!enabled) { pill.classList.remove("show"); closeMenu(); }
  }
  try { chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    if (ch.features || ch.lang || ch.server || ch.token) sync();
    if (ch.skin || ch.theme) loadLook();
  }); } catch (e) {}
  sync();
})();
