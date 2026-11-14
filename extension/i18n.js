// i18n — "auto" follows the browser language (chrome.i18n, en default / tr);
// a language picked on the Settings page overrides it. chrome.i18n can't switch at runtime, so for an
// explicit choice we load _locales/<lang>/messages.json ourselves.
//   Pages (popup/options) read a cached copy from localStorage synchronously → no flash of the wrong language.
//   The service worker has no localStorage → awaits rafI18nReady before building menus.
const RAF_LOCALES = ["en", "tr"];
let RAF_LANG = null;   // null = auto
let RAF_DICT = null;

try {
  const cached = JSON.parse(localStorage.getItem("rafI18n") || "null");
  if (cached && RAF_LOCALES.includes(cached.lang)) { RAF_LANG = cached.lang; RAF_DICT = cached.dict; }
} catch (e) { /* no localStorage (service worker) */ }

const t = (key, ...subs) => {
  const m = RAF_DICT?.[key]?.message;
  if (m != null) return m.replace(/\$(\d)/g, (_, n) => (subs[n - 1] ?? "") + "");
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
};
const rafLocale = () => RAF_LANG || chrome.i18n.getUILanguage();

async function rafLoadLang(lang) {
  if (!RAF_LOCALES.includes(lang)) { RAF_LANG = null; RAF_DICT = null; }
  else {
    RAF_DICT = await (await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`))).json();
    RAF_LANG = lang;
  }
  try {
    if (RAF_LANG) localStorage.setItem("rafI18n", JSON.stringify({ lang: RAF_LANG, dict: RAF_DICT }));
    else localStorage.removeItem("rafI18n");
  } catch (e) {}
}

function rafApplyDom(root = document) {
  document.documentElement.lang = rafLocale();
  root.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  root.querySelectorAll("[data-t-html]").forEach((el) => (el.innerHTML = t(el.dataset.tHtml)));
  root.querySelectorAll("[data-t-ph]").forEach((el) => (el.placeholder = t(el.dataset.tPh)));
  root.querySelectorAll("[data-t-title]").forEach((el) => (document.title = t(el.dataset.tTitle)));
}

// Make sure the cached choice still matches what's stored (another device may have changed it via sync)
const rafI18nReady = chrome.storage.sync.get("lang").then(async ({ lang = "auto" }) => {
  if ((lang === "auto" ? null : lang) !== RAF_LANG) {
    await rafLoadLang(lang);
    if (typeof document !== "undefined") rafApplyDom();
  }
}).catch(() => {});

if (typeof document !== "undefined") rafApplyDom();
