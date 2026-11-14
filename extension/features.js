// Feature registry — every toggleable feature lives here. New features: add an entry (+ i18n keys f_<id> / fd_<id>).
const RAF_FEATURES = [
  { id: "save",       group: "gSave",  icon: "bookmark", def: true },  // Save tab in the popup
  { id: "withShot",   group: "gSave",  icon: "camera",   def: true },  // "Include a screenshot" option
  { id: "menuSave",   group: "gSave",  icon: "plus",     def: true },  // right-click: save page / link / selection
  { id: "video",      group: "gVideo", icon: "video",    def: true },  // popup download box
  { id: "menuVideo",  group: "gVideo", icon: "download", def: true },  // right-click: download video / audio
  { id: "uuid",       group: "gTools", icon: "key",      def: true },
  { id: "menuUuid",   group: "gTools", icon: "plus",     def: true },  // right-click "Insert UUID" + Alt+Shift+U
  { id: "lorem",      group: "gTools", icon: "text",     def: true },
  { id: "b64",        group: "gTools", icon: "binary",   def: true },
  { id: "jwt",        group: "gTools", icon: "id",       def: true },
  { id: "shot",       group: "gTools", icon: "image",    def: true },
];

async function rafFeatures() {
  const { features = {} } = await chrome.storage.sync.get("features");
  return Object.fromEntries(RAF_FEATURES.map((f) => [f.id, features[f.id] ?? f.def]));
}
