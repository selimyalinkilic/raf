// Raf landing page: language (EN in the HTML, TR below), light/dark, theme gallery, click-to-load video, latest version.
const $ = (s) => document.querySelector(s);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

const TR = {
  navFeatures: "Özellikler", navPhone: "Telefon", navThemes: "Temalar", navInstall: "Kurulum",
  eyebrow: "Ücretsiz · açık kaynak · hesap yok",
  heroTitle: "İnterneti <mark>rafına kaldır.</mark>",
  heroLead: "Raf, açık olan sayfayı tek tıkla kaydeder: başlık, etiketler, not, okunabilir metin ve ekran görüntüsü. Site kapansa bile sonra yine bulursun. Telefonuna gönderirsin. Geliştiricilerin ve test uzmanlarının her gün aradığı küçük araçlar da bir tık uzağında.",
  ctaDownload: "Chrome için indir", ctaWatch: "Tanıtımı izle",
  ctaNote: "Chrome, Edge, Brave ve diğer Chromium tarayıcılar.",
  floatTg: "Rafına kaydedildi ✓",
  s1: "Hesap yok, takip yok", s2: "Sunucusuz çalışır", s3: "Türkçe ve İngilizce", s4: "MIT lisanslı",
  featTitle: "Hepsi tek bir küçük eklentide",
  featSub: "Kullandığını aç, gerisini gizle. Her özelliğin, menü öğesinin ve aracın kendi anahtarı var.",
  f1t: "Tek tıkla kaydet", f1d: "Sayfayı, bir linki ya da seçili metni; popup'tan, sağ tık menüsünden ya da kısayolla. Etiket, not ve ekran görüntüsü de gelir.",
  f2t: "Kolayca bul", f2d: "Başlıklarda, notlarda ve sayfanın metninde ara. Türkçe karakterleri bilir: bakim yazsan bakım'ı bulur.",
  f3t: "Oturumlar", f3d: "Açık sekmelerin hepsini tek seferde kaydet, sonra yeni pencerede geri aç.",
  f4t: "Video indirme", f4d: "Instagram, TikTok ve düz video dosyaları doğrudan sayfadan. Kendi Raf sunucunla: YouTube, X, Reddit ve 1000'den fazla site, 4K'ya kadar.",
  f5t: "Hiçbir kayıt kaybolmaz", f5d: "Sunucuya ulaşılamıyor mu? Kayıtlar tarayıcında bekler, bağlantı gelince kendiliğinden gider.",
  f6t: "10 tema", f6d: "Her birinin kendi görünümü var, sadece renkler değil. Araç çubuğundaki ikon bile temaya uyar.",
  vnote: "Oynat'a bastığında YouTube'dan (gizlilik modunda) oynatılır.",
  phTitle: "Telefonuna, kurulumsuz",
  phSub: "Bilgisayarda bir şey buldun, otobüste okumak mı istiyorsun? Hangisi kolayına gelirse.",
  w1t: "Telegram, tek dokunuş", w1d: "Ayarlar → Telegram'a bağlan → Başlat. Sayfaları sohbetine gönder; bota link at, rafına düşsün. /son /bugun /ara raftan cevap verir.",
  w2t: "Chrome yer imleri", w2d: "Kaydettiklerin Yer imleri › Raf klasörüne de gider, Chrome senkronu telefonuna getirir. Hiçbir şey kurman gerekmez.",
  w3t: "QR kod", w3d: "Telefonun kamerasını popup'a tut, sayfa açılsın.",
  w4t: "E-posta", w4d: "Posta uygulamanda, Gmail'de ya da Outlook'ta hazır bir taslak. Sadece Gönder'e bas.",
  chatSaved: "Rafına kaydedildi", chatToday: "Bugün kaydedilenler",
  devTitle: "Bir test uzmanından, geliştiricilere ve test uzmanlarına",
  devSub: "On sekme açtığın küçük işler, popup'ın içinde.",
  d1t: "Locator seçici", d1d: "Üzerine gel, tıkla, Playwright locator'ını al: <code>getByRole</code>, <code>getByTestId</code>… kaç öğeyle eşleştiğiyle birlikte. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>",
  d2t: "Formu doldur", d2d: "Tek bir sahte kişi bütün formu doldurur: ad, e-posta, telefon, adres, geçerli TCKN, VKN ve IBAN. Senin yazdıkların kalır. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>",
  chipShot: "Ekran görüntüsü", chipTd: "Test verisi",
  thTitle: "Kendine göre yap",
  thSub: "On tema, her birinin kendi şekilleri ve yazısı: buzlu cam, kareli kâğıtta kurşun kalem, 80'ler gün batımı… Ayarlar'dan seç.",
  twTitle: "Raf'ı kullanmanın iki yolu",
  tw1: "Sadece eklenti", tw1a: "Kur ve kullan, ayar gerekmez", tw1b: "Rafın tarayıcında durur (istediğin an dışa / içe aktar)",
  tw1c: "Telefona Telegram, yer imleri, QR ve e-posta ile", tw1d: "Instagram, TikTok ve düz video dosyalarından video",
  tw2: "Kendi Raf sunucunla", tw2a: "Her cihazda aynı raf, telefon için web uygulaması", tw2b: "YouTube, X, Reddit ve 1000'den fazla site; kalite seçimi, sadece ses",
  tw2c: "Her zaman açık Telegram botu ve günlük özet", tw2d: "Tek <code>docker compose up</code>, verin kendi makinende kalır",
  inTitle: "Bir dakikada kur",
  in1t: "İndir ve aç", in1d: "Son sürümden raf-extension.zip'i indir ve saklayacağın bir klasöre çıkar.",
  in2t: "Geliştirici modu", in2d: "<code>chrome://extensions</code> sayfasını aç ve sağ üstten <b>Geliştirici modu</b>'nu aç.",
  in3t: "Paketlenmemiş öğe yükle", in3d: "\"Paketlenmemiş öğe yükle\"ye tıkla, klasörü seç, sonra yapboz simgesinden Raf'ı sabitle.",
  ctaDownload2: "raf-extension.zip'i indir", ctaServer: "Kendi sunucunu kur",
  inNote: "Güncellemek için: yeni sürümü aynı klasörün üstüne çıkar ve Raf kartındaki ↻'ye bas. Chrome Web Mağazası sürümü yakında.",
  prTitle: "Rafın senin",
  prText: "Hesap yok, analiz yok, reklam yok. Sunucusuz kullanırsan her şey tarayıcında kalır; sunucunla kullanırsan sunucunda. İsteğe bağlı Telegram botu mesajları sadece iletir ve tarayıcın alır almaz siler.",
  prLink: "Gizlilik politikasını oku →",
  ftMade: "Yapan",
};

const THEMES = [
  ["pastel", "#d9ccff", "#bdf0d6", "Pastel", "Soft colours, chunky buttons", "Yumuşak renkler, tombul düğmeler"],
  ["minimal", "#e8edf4", "#4a6fa5", "Minimal", "Flat and quiet, light or dark", "Düz ve sade, açık ya da koyu"],
  ["graphite", "#e6e6e6", "#3a3a3a", "Graphite|Grafit", "Pencil sketch on grid paper", "Kareli kâğıtta kurşun kalem eskiz"],
  ["cyberpunk", "#12101f", "#ff2bd6", "Cyberpunk", "Neon on black", "Siyah üstüne neon"],
  ["neon", "#ff7a3d", "#ff3fa4", "Neon Beach|Neon Sahil", "80s sunset, palm trees, neon", "80'ler gün batımı, palmiyeler, neon"],
  ["ocean", "#12385a", "#2ee6c5", "Ocean|Okyanus", "Frosted glass over deep blue", "Koyu mavi üstünde buzlu cam"],
  ["forest", "#dfe8d0", "#6f8f4e", "Forest|Orman", "Sage, moss and leaf-shaped corners", "Adaçayı, yosun, yaprak köşeler"],
  ["sunset", "#ffd3c2", "#b48cff", "Sunset|Gün batımı", "Coral, peach and lilac gradients", "Mercan, şeftali ve leylak gradyanlar"],
  ["paper", "#eadfc6", "#8b5e34", "Paper|Kâğıt", "Sepia and serif, like a book", "Sepya ve tırnaklı yazı, kitap gibi"],
  ["pop", "#ffd23f", "#111111", "Pop", "Bold outlines, bright colours", "Kalın çizgiler, canlı renkler"],
];

// ----- language -----
const EN = {};
document.querySelectorAll("[data-t]").forEach((el) => (EN[el.dataset.t] = el.textContent));
document.querySelectorAll("[data-th]").forEach((el) => (EN[el.dataset.th] = el.innerHTML));
let lang = document.documentElement.lang === "tr" ? "tr" : "en";
function applyLang() {
  const d = lang === "tr" ? TR : EN;
  document.querySelectorAll("[data-t]").forEach((el) => { const v = d[el.dataset.t] ?? EN[el.dataset.t]; if (v != null) el.textContent = v; });
  document.querySelectorAll("[data-th]").forEach((el) => { const v = d[el.dataset.th] ?? EN[el.dataset.th]; if (v != null) el.innerHTML = v; });
  document.documentElement.lang = lang;
  $("#langlbl").textContent = lang === "tr" ? "EN" : "TR";
  document.title = lang === "tr" ? "Raf · kendine ait okuma rafın" : "Raf · your private read-later shelf";
  renderThemes();
}
$("#lang").onclick = () => { lang = lang === "tr" ? "en" : "tr"; store.set("rafSiteLang", lang); applyLang(); };

// ----- light / dark -----
$("#theme").onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark"; store.set("rafSiteTheme", root.dataset.theme);
};

// ----- theme gallery -----
let cur = "pastel";
function renderThemes() {
  const name = (n) => (n.includes("|") ? n.split("|")[lang === "tr" ? 1 : 0] : n);
  $("#tgrid").innerHTML = THEMES.map(([id, a, b, n]) =>
    `<button class="tbtn${id === cur ? " on" : ""}" data-id="${id}"><span class="sw" style="background:linear-gradient(135deg,${a} 50%,${b} 50%)"></span>${name(n)}</button>`).join("");
  const t = THEMES.find((x) => x[0] === cur);
  $("#tdesc").textContent = name(t[3]) + " · " + (lang === "tr" ? t[5] : t[4]);
}
$("#tgrid").onclick = (e) => {
  const b = e.target.closest("[data-id]"); if (!b || b.dataset.id === cur) return;
  cur = b.dataset.id; const img = $("#tpimg"); img.style.opacity = 0;
  setTimeout(() => { img.src = `img/themes/${cur}.webp`; img.onload = () => (img.style.opacity = 1); }, 150);
  renderThemes();
};
THEMES.forEach(([id]) => { const i = new Image(); i.src = `img/themes/${id}.webp`; });  // preload, they're tiny

// ----- video: nothing loads from YouTube until you press play -----
$("#player .playbtn").onclick = () => {
  $("#player").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/_U53kZwrMeg?autoplay=1&rel=0" title="Raf demo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
};

// ----- latest version from GitHub (optional) -----
fetch("https://api.github.com/repos/selimyalinkilic/raf/releases/latest").then((r) => (r.ok ? r.json() : null)).then((r) => {
  if (r?.tag_name) $("#ver").textContent = (lang === "tr" ? "Son sürüm " : "Latest ") + r.tag_name;
}).catch(() => {});

applyLang();
