// Raf locator picker — injected on demand (activeTab). Hover to highlight, click to get Playwright locators,
// CSS and XPath for the element, each with its match count on the page. Esc closes.
(() => {
  if (window.__rafPicker) { window.__rafPicker.start(); return; }
  const T = Object.assign({ title: "Pick an element", hint: "Click an element · Esc to close", again: "Pick another", close: "Close",
    copy: "Copy", copied: "Copied", unique: "unique", matches: "$1 matches", none: "no match", recommended: "recommended" }, window.__RAF_PICKER_I18N || {});

  // ---------- accessible role & name (Playwright-compatible subset) ----------
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const INPUT_ROLES = { button: "button", submit: "button", reset: "button", image: "button", checkbox: "checkbox", radio: "radio",
    range: "slider", number: "spinbutton", search: "searchbox", email: "textbox", tel: "textbox", text: "textbox", url: "textbox", "": "textbox" };
  function roleOf(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit.trim().split(/\s+/)[0];
    const tag = el.localName;
    if (tag === "a" || tag === "area") return el.hasAttribute("href") ? "link" : null;
    if (tag === "button") return "button";
    if (tag === "input") { const t = (el.getAttribute("type") || "").toLowerCase(); return t === "hidden" || t === "password" ? null : INPUT_ROLES[t] ?? "textbox"; }
    if (tag === "textarea") return "textbox";
    if (tag === "select") return el.multiple || el.size > 1 ? "listbox" : "combobox";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "img") return el.getAttribute("alt") === "" ? "presentation" : "img";
    return { ul: "list", ol: "list", li: "listitem", nav: "navigation", main: "main", dialog: "dialog", option: "option", table: "table",
      tr: "row", td: "cell", th: "columnheader", article: "article", form: el.hasAttribute("aria-label") || el.hasAttribute("name") ? "form" : null,
      aside: "complementary", progress: "progressbar", summary: "button", details: "group", fieldset: "group" }[tag] || null;
  }
  function labelText(el) {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return norm(l.innerText); }
    const wrap = el.closest("label");
    if (wrap) { const c = wrap.cloneNode(true); c.querySelectorAll("input,select,textarea").forEach((x) => x.remove()); return norm(c.innerText || c.textContent); }
    return "";
  }
  function nameOf(el) {
    const by = el.getAttribute("aria-labelledby");
    if (by) { const s = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((x) => norm(x.innerText || x.textContent)).join(" "); if (s) return s; }
    const al = el.getAttribute("aria-label"); if (al && norm(al)) return norm(al);
    const tag = el.localName;
    if (/^(input|select|textarea)$/.test(tag)) {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (tag === "input" && /^(button|submit|reset)$/.test(t)) return norm(el.value || ({ submit: "Submit", reset: "Reset" })[t] || "");
      if (tag === "input" && t === "image") return norm(el.alt || el.value);
      return labelText(el) || norm(el.title) || norm(el.placeholder);
    }
    if (tag === "img") return norm(el.alt) || norm(el.title);
    return norm(el.innerText || el.textContent) || norm(el.title);
  }
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, opacityProperty: false }) : el.getClientRects().length > 0);
  const lc = (s) => s.toLowerCase();

  // ---------- candidates ----------
  const q = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  const all = () => [...document.querySelectorAll("body *")].filter((e) => !e.closest("#__raf_picker_host"));
  function countRole(role, name, exact) {
    return all().filter((e) => visible(e) && roleOf(e) === role && (!name || (exact ? nameOf(e) === name : lc(nameOf(e)).includes(lc(name))))).length;
  }
  function countText(text, exact) {
    // Playwright text matching picks the smallest element containing the text
    return all().filter((e) => {
      if (!visible(e) || /^(script|style|noscript)$/.test(e.localName)) return false;
      const own = norm(e.innerText); const ok = exact ? own === text : lc(own).includes(lc(text));
      return ok && ![...e.children].some((c) => { const t = norm(c.innerText); return exact ? t === text : lc(t).includes(lc(text)); });
    }).length;
  }
  const av = (v) => String(v).replace(/["\\]/g, "\\$&");  // escape a value inside [attr="…"] (only quotes and backslashes)
  const countCss = (sel) => { try { return document.querySelectorAll(sel).length; } catch (e) { return 0; } };
  const countXpath = (xp) => { try { return document.evaluate(`count(${xp})`, document, null, XPathResult.NUMBER_TYPE, null).numberValue; } catch (e) { return 0; } };
  const looksGenerated = (s) => /\d{3,}|[:]|^(css|sc|jsx|emotion|svelte)-|__[a-z0-9]{4,}|^[a-z]{1,3}[A-Z0-9][a-zA-Z0-9]{4,}$/.test(s);

  function cssPath(el) {
    if (el.id && !looksGenerated(el.id) && countCss("#" + CSS.escape(el.id)) === 1) return "#" + CSS.escape(el.id);
    for (const a of ["data-testid", "data-test", "data-qa", "data-cy", "name", "aria-label"]) {
      const v = el.getAttribute(a); if (v) { const s = `${el.localName}[${a}="${av(v)}"]`; if (countCss(s) === 1) return s; }
    }
    const parts = []; let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.localName;
      if (cur.id && !looksGenerated(cur.id)) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      const cls = [...cur.classList].filter((c) => !looksGenerated(c)).slice(0, 2);
      if (cls.length) part += "." + cls.map(CSS.escape).join(".");
      const sib = cur.parentElement ? [...cur.parentElement.children].filter((x) => x.localName === cur.localName) : [];
      if (sib.length > 1) part += `:nth-of-type(${sib.indexOf(cur) + 1})`;
      parts.unshift(part);
      if (countCss(parts.join(" > ")) === 1) break;
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  function xpath(el) {
    if (el.id && !looksGenerated(el.id)) return `//*[@id="${el.id}"]`;
    const t = norm(el.innerText);
    if (t && t.length <= 40 && !el.children.length && !t.includes('"')) { const x = `//${el.localName}[normalize-space()="${t}"]`; if (countXpath(x) === 1) return x; }
    const segs = []; let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.id && !looksGenerated(cur.id)) { segs.unshift(`//*[@id="${cur.id}"]`); break; }
      const sib = cur.parentElement ? [...cur.parentElement.children].filter((x) => x.localName === cur.localName) : [];
      segs.unshift(`/${cur.localName}${sib.length > 1 ? `[${sib.indexOf(cur) + 1}]` : ""}`);
      cur = cur.parentElement;
    }
    return segs.join("");
  }

  function candidates(el) {
    const out = [];
    const add = (kind, code, count) => out.push({ kind, code, count });
    const tid = el.getAttribute("data-testid");
    if (tid) add("testid", `page.getByTestId(${q(tid)})`, countCss(`[data-testid="${av(tid)}"]`));
    for (const a of ["data-test", "data-test-id", "data-qa", "data-cy"]) {
      const v = el.getAttribute(a); if (v) add("testid", `page.locator(${q(`[${a}="${av(v)}"]`)})`, countCss(`[${a}="${av(v)}"]`));
    }
    const role = roleOf(el), name = nameOf(el);
    if (role && !/^(presentation|none|generic)$/.test(role)) {
      if (name && name.length <= 80) {
        const n = countRole(role, name, false);
        add("role", `page.getByRole(${q(role)}, { name: ${q(name)} })`, n);
        if (n > 1) {
          const e = countRole(role, name, true);
          const base = `page.getByRole(${q(role)}, { name: ${q(name)}${e < n ? ", exact: true" : ""} })`;
          if (e < n) add("role", base, e);
          if (Math.min(e, n) > 1) {  // still ambiguous → Playwright's .nth(i) in document order
            const same = all().filter((x) => visible(x) && roleOf(x) === role && (e < n ? nameOf(x) === name : lc(nameOf(x)).includes(lc(name))));
            const i = same.indexOf(el); if (i >= 0) add("role", `${base}.nth(${i})`, 1);
          }
        }
      } else add("role", `page.getByRole(${q(role)})`, countRole(role, "", false));
    }
    if (/^(input|select|textarea)$/.test(el.localName)) {
      const lab = labelText(el); if (lab) add("label", `page.getByLabel(${q(lab)})`, all().filter((e) => /^(input|select|textarea)$/.test(e.localName) && lc(labelText(e)).includes(lc(lab))).length);
      if (el.placeholder) add("placeholder", `page.getByPlaceholder(${q(el.placeholder)})`, countCss(`[placeholder="${av(el.placeholder)}"]`));
    }
    if (el.localName === "img" && el.alt) add("alt", `page.getByAltText(${q(el.alt)})`, countCss(`[alt="${av(el.alt)}"]`));
    if (el.title) add("title", `page.getByTitle(${q(el.title)})`, countCss(`[title="${av(el.title)}"]`));
    const txt = norm(el.innerText);
    if (txt && txt.length <= 60 && !/^(input|select|textarea)$/.test(el.localName)) {
      const n = countText(txt, false); add("text", `page.getByText(${q(txt)})`, n);
      if (n > 1) add("text", `page.getByText(${q(txt)}, { exact: true })`, countText(txt, true));
    }
    const css = cssPath(el); add("css", `page.locator(${q(css)})`, countCss(css));
    const xp = xpath(el); add("xpath", `page.locator(${q("xpath=" + xp)})`, countXpath(xp));
    const rank = { testid: 0, role: 1, label: 2, placeholder: 3, alt: 4, title: 5, text: 6, css: 7, xpath: 8 };
    out.sort((a, b) => rank[a.kind] - rank[b.kind]);
    const firstUnique = out.find((c) => c.count === 1); if (firstUnique) firstUnique.best = true;
    return out;
  }

  // ---------- UI (shadow DOM so page styles can't leak in) ----------
  const host = document.createElement("div"); host.id = "__raf_picker_host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:Nunito,"Segoe UI",system-ui,sans-serif}
    .hl{position:fixed;border:2px solid #ab97ec;background:rgba(217,204,255,.28);border-radius:6px;pointer-events:none;transition:all .05s}
    .tag{position:fixed;background:#3d3a5c;color:#fff;font:700 11px ui-monospace,Consolas,monospace;padding:2px 7px;border-radius:6px;pointer-events:none;white-space:nowrap}
    .bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#fff;color:#3d3a5c;border:3px solid #fff;outline:2px solid #ab97ec;box-shadow:0 5px 0 #ab97ec;border-radius:14px;padding:7px 14px;font:800 13px sans-serif;pointer-events:auto}
    .panel{position:fixed;right:16px;bottom:16px;width:min(560px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#fffaf4;color:#3d3a5c;border:3px solid #fff;outline:2px solid #ab97ec;box-shadow:0 6px 0 #ab97ec,0 20px 40px -10px rgba(60,40,120,.35);border-radius:18px;padding:12px;pointer-events:auto}
    .ph{display:flex;align-items:center;gap:8px;margin-bottom:8px}.ph b{font:700 15px sans-serif;flex:1}
    .el{font:600 11px ui-monospace,Consolas,monospace;background:#fff;border:2px solid #e6e1f5;border-radius:10px;padding:6px 8px;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .row{display:flex;align-items:center;gap:8px;background:#fff;border-radius:12px;padding:7px 8px;margin-bottom:6px;border:2px solid #f0ecfa}
    .row.best{border-color:#7fd0a8;background:#f3fcf7}
    .kind{font:800 10px sans-serif;text-transform:uppercase;color:#8b86a8;width:66px;flex:none}
    code{flex:1;font:600 12px ui-monospace,Consolas,monospace;word-break:break-all}
    .cnt{font:800 10px sans-serif;padding:2px 7px;border-radius:7px;white-space:nowrap;flex:none}
    .cnt.ok{background:#bdf0d6}.cnt.many{background:#ffd6bf}.cnt.zero{background:#ffd0e2}
    .best-tag{font:800 9px sans-serif;background:#7fd0a8;color:#fff;border-radius:6px;padding:1px 6px;margin-left:4px}
    button{border:2px solid #fff;border-radius:9px;padding:4px 10px;background:#c6e3ff;box-shadow:0 2px 0 #86b9ec;font:800 11px sans-serif;color:#3d3a5c;cursor:pointer;flex:none}
    button.ghost{background:#eee9fb;box-shadow:0 2px 0 #d9ccff}
  </style><div class="hl" hidden></div><div class="tag" hidden></div><div class="bar"></div><div class="panel" hidden></div>`;
  const $ = (s) => root.querySelector(s);
  let active = false, current = null;

  function frame(el) {
    const r = el.getBoundingClientRect();
    Object.assign($(".hl").style, { left: r.left - 2 + "px", top: r.top - 2 + "px", width: r.width + 4 + "px", height: r.height + 4 + "px" }); $(".hl").hidden = false;
    const role = roleOf(el); $(".tag").textContent = el.localName + (el.id ? "#" + el.id : "") + (role ? `  [${role}]` : "");
    Object.assign($(".tag").style, { left: Math.max(4, r.left) + "px", top: (r.top > 24 ? r.top - 22 : r.bottom + 4) + "px" }); $(".tag").hidden = false;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    btn.textContent = T.copied; setTimeout(() => (btn.textContent = T.copy), 1200);
  }
  function show(el) {
    const list = candidates(el);
    const snippet = el.outerHTML.replace(/\s+/g, " ").slice(0, 160);
    $(".panel").innerHTML = `<div class="ph"><b><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/></svg> ${esc(T.title)}</b><button class="ghost" data-a="again">${esc(T.again)}</button><button class="ghost" data-a="close" aria-label="close"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>
      <div class="el">${esc(snippet)}</div>` + list.map((c, i) => `<div class="row ${c.best ? "best" : ""}"><span class="kind">${c.kind}${c.best ? `<br><span class="best-tag">${esc(T.recommended)}</span>` : ""}</span>
        <code>${esc(c.code)}</code><span class="cnt ${c.count === 1 ? "ok" : c.count ? "many" : "zero"}">${c.count === 1 ? "1 · " + esc(T.unique) : c.count ? esc(T.matches.replace("$1", c.count)) : esc(T.none)}</span>
        <button data-i="${i}">${esc(T.copy)}</button></div>`).join("");
    $(".panel").hidden = false;
    $(".panel").querySelectorAll("button[data-i]").forEach((b) => (b.onclick = () => copy(list[+b.dataset.i].code, b)));
    $(".panel").querySelector('[data-a="again"]').onclick = () => start();
    $(".panel").querySelector('[data-a="close"]').onclick = () => stop();
  }
  const onMove = (e) => { if (!active) return; const el = e.composedPath()[0]; if (!(el instanceof Element) || host.contains(el) || el === host) return; current = el; frame(el); };
  const onClick = (e) => {
    if (!active) return;
    if (e.composedPath().includes(host)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    active = false; $(".bar").hidden = true; if (current) show(current);
  };
  const onKey = (e) => { if (e.key === "Escape") stop(); };
  // Block the page's own press handlers while picking (menus that open on mousedown etc.)
  const block = (e) => { if (active && !e.composedPath().includes(host)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } };
  const PRESS = ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart"];
  function start() {
    if (!host.isConnected) document.documentElement.appendChild(host);
    active = true; $(".panel").hidden = true; $(".bar").hidden = false; $(".bar").innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/></svg> ${esc(T.hint)}`;
    document.addEventListener("mousemove", onMove, true); document.addEventListener("click", onClick, true); document.addEventListener("keydown", onKey, true);
    PRESS.forEach((ev) => document.addEventListener(ev, block, true));
  }
  function stop() {
    active = false; host.remove();
    document.removeEventListener("mousemove", onMove, true); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true);
    PRESS.forEach((ev) => document.removeEventListener(ev, block, true));
  }
  window.__rafPicker = { start, stop, candidates };
  start();
})();
