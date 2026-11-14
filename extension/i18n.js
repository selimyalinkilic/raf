// chrome.i18n helpers — language follows the browser UI (which follows the OS by default). en = default, tr = Turkish.
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
if (typeof document !== "undefined") {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  document.querySelectorAll("[data-t-html]").forEach((el) => (el.innerHTML = t(el.dataset.tHtml)));
  document.querySelectorAll("[data-t-ph]").forEach((el) => (el.placeholder = t(el.dataset.tPh)));
  document.querySelectorAll("[data-t-title]").forEach((el) => (document.title = t(el.dataset.tTitle)));
}
