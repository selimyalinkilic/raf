// Feature registry — every toggleable feature lives here. New features: add an entry (+ i18n keys f_<id> / fd_<id>).
const RAF_FEATURES = [
  { id: "save",       group: "gSave",  icon: "bookmark", def: true },  // Save tab in the popup
  { id: "withShot",   group: "gSave",  icon: "camera",   def: true },  // "Include a screenshot" option
  { id: "menuSave",   group: "gSave",  icon: "plus",     def: true },  // right-click: save page / link / selection
  { id: "sessions",   group: "gSave",  icon: "layers",   def: true },  // save all tabs as a session, reopen later
  { id: "bookmarkSync", group: "gSave", icon: "phone",   def: false, perm: "bookmarks" },  // also add to Chrome bookmarks › Raf (Chrome sync → phone)
  { id: "video",      group: "gVideo", icon: "video",    def: true },  // popup download box
  { id: "videoOverlay", group: "gVideo", icon: "download", def: true },  // "Raf" button on top of videos (video sites)
  { id: "menuVideo",  group: "gVideo", icon: "download", def: true },  // right-click: download video / audio
  { id: "uuid",       group: "gTools", icon: "key",      def: true },
  { id: "menuUuid",   group: "gTools", icon: "plus",     def: true },  // right-click "Insert UUID" + Alt+Shift+U
  { id: "lorem",      group: "gTools", icon: "text",     def: true },
  { id: "b64",        group: "gTools", icon: "binary",   def: true },
  { id: "jwt",        group: "gTools", icon: "id",       def: true },
  { id: "shot",       group: "gTools", icon: "image",    def: true },
  { id: "phone",      group: "gTools", icon: "phone",    def: true },  // QR code + send to Telegram
  { id: "picker",     group: "gDev",   icon: "crosshair", def: true },  // Playwright locator picker + Alt+Shift+L
  { id: "testData",   group: "gDev",   icon: "user",     def: true },  // TR test data generator + "Fill form"
  { id: "menuTestData", group: "gDev", icon: "plus",     def: true },  // right-click "Insert test data ▸"
];

async function rafFeatures() {
  const { features = {} } = await chrome.storage.sync.get("features");
  const local = typeof rafIsLocal === "function" && await rafIsLocal();
  // video download runs on a Raf server (yt-dlp) — off in local mode
  return Object.fromEntries(RAF_FEATURES.map((f) => [f.id, !(local && f.server) && (features[f.id] ?? f.def)]));
}
