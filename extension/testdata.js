// Turkish test data generators — every value passes the official checksum algorithms
// (TCKN, VKN, IBAN mod-97, Luhn). For testing only: these are random, not real people / accounts.
(() => {
  const r = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[r(a.length)];
  const digits = (n) => Array.from({ length: n }, () => r(10)).join("");

  const FIRST = ["Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "Emre", "Burak", "Can", "Deniz", "Kerem", "Murat", "Okan", "Selim", "Tolga", "Yusuf",
    "Ayşe", "Fatma", "Zeynep", "Elif", "Merve", "Büşra", "Ece", "Selin", "Defne", "Gizem", "İrem", "Melis", "Nazlı", "Pınar", "Şeyma"];
  const LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan",
    "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek", "Polat", "Korkmaz", "Erdoğan", "Güneş", "Aksoy", "Tekin", "Bulut", "Avcı", "Ünal", "Taş"];
  const CITIES = { 34: ["İstanbul", ["Kadıköy", "Beşiktaş", "Üsküdar", "Şişli", "Bakırköy", "Ataşehir"]], 6: ["Ankara", ["Çankaya", "Keçiören", "Yenimahalle", "Etimesgut"]],
    35: ["İzmir", ["Karşıyaka", "Bornova", "Konak", "Buca"]], 16: ["Bursa", ["Nilüfer", "Osmangazi", "Yıldırım"]], 7: ["Antalya", ["Muratpaşa", "Konyaaltı", "Kepez"]],
    1: ["Adana", ["Seyhan", "Çukurova"]], 26: ["Eskişehir", ["Tepebaşı", "Odunpazarı"]], 61: ["Trabzon", ["Ortahisar", "Akçaabat"]] };
  const STREETS = ["Atatürk", "Cumhuriyet", "İstiklal", "Gül", "Lale", "Menekşe", "Çınar", "Papatya", "Bahar", "Barış", "Zafer", "Yıldız"];
  const BANKS = ["00010", "00012", "00015", "00046", "00062", "00064", "00067", "00111", "00134", "00206"];
  const COMPANY = ["Teknoloji", "Yazılım", "Danışmanlık", "Lojistik", "Gıda", "Tekstil", "İnşaat", "Medya"];
  const ASCII = (s) => s.toLowerCase().replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");

  function tckn() {
    const d = [1 + r(9), ...Array.from({ length: 8 }, () => r(10))];
    const odd = d[0] + d[2] + d[4] + d[6] + d[8], even = d[1] + d[3] + d[5] + d[7];
    d.push((((odd * 7 - even) % 10) + 10) % 10);
    d.push(d.reduce((a, b) => a + b, 0) % 10);
    return d.join("");
  }
  function vkn() {
    const d = Array.from({ length: 9 }, () => r(10));
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      const t = (d[i] + (9 - i)) % 10;
      let v = (t * 2 ** (9 - i)) % 9;
      if (t !== 0 && v === 0) v = 9;
      sum += v;
    }
    return d.join("") + ((10 - (sum % 10)) % 10);
  }
  function iban() {
    const bban = pick(BANKS) + "0" + digits(16);
    const num = BigInt(bban + "2927" + "00"); // T=29 R=27
    const check = String(98n - (num % 97n)).padStart(2, "0");
    return ("TR" + check + bban).replace(/(.{4})/g, "$1 ").trim();
  }
  function luhn(prefix, len = 16) {
    const d = (prefix + digits(len - prefix.length - 1)).split("").map(Number);
    let sum = 0;
    for (let i = d.length - 1, alt = true; i >= 0; i--, alt = !alt) { let x = d[i]; if (alt) { x *= 2; if (x > 9) x -= 9; } sum += x; }
    return d.join("") + ((10 - (sum % 10)) % 10);
  }
  const first = () => pick(FIRST), last = () => pick(LAST);
  const phone = () => `+90 5${pick(["0", "3", "4", "5"])}${r(10)} ${digits(3)} ${digits(2)} ${digits(2)}`;
  function birth(iso = false) {
    const d = new Date(Date.now() - (18 + r(50)) * 365.25 * 864e5 - r(365) * 864e5);
    const p = (n) => String(n).padStart(2, "0");
    return iso ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` : `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  function place() { const code = +pick(Object.keys(CITIES)); const [city, dists] = CITIES[code]; return { code, city, district: pick(dists) }; }
  function address() {
    const p = place();
    return `${pick(STREETS)} Mah. ${pick(STREETS)} Sk. No: ${1 + r(120)} Daire: ${1 + r(20)}, ${String(p.code).padStart(2, "0")}${digits(3)} ${p.district}/${p.city}`;
  }
  function plate() {
    const L = "ABCDEFGHJKLMNPRSTUVYZ";
    const letters = Array.from({ length: 1 + r(3) }, () => L[r(L.length)]).join("");
    const n = { 1: 4, 2: 3 + r(2), 3: 2 + r(2) }[letters.length];  // official letter/digit combinations
    return `${String(+pick(Object.keys(CITIES))).padStart(2, "0")} ${letters} ${digits(n)}`;
  }
  function card() {
    const n = luhn(pick(["4", "5" + (1 + r(5))]));
    return n.replace(/(.{4})/g, "$1 ").trim();
  }
  const exp = () => `${String(1 + r(12)).padStart(2, "0")}/${String((new Date().getFullYear() + 1 + r(5)) % 100).padStart(2, "0")}`;

  const GEN = {
    fullName: () => `${first()} ${last()}`,
    firstName: first, lastName: last,
    email: () => `${ASCII(first())}.${ASCII(last())}${r(100)}@example.com`,
    phone, tckn, vkn, iban,
    address, city: () => place().city, district: () => place().district,
    zip: () => String(+pick(Object.keys(CITIES))).padStart(2, "0") + digits(3),
    birthdate: () => birth(), company: () => `${last()} ${pick(COMPANY)} A.Ş.`,
    plate, card, cardExp: exp, cvv: () => digits(3),
    password: () => `Test${digits(4)}!`,
    username: () => `${ASCII(first())}.${ASCII(last())}${r(100)}`,
  };
  const ORDER = ["fullName", "firstName", "lastName", "email", "phone", "tckn", "vkn", "iban", "address", "city", "district", "zip", "birthdate", "company", "plate", "card", "cardExp", "cvv", "username", "password"];

  // Guess which generator fits a form field from its name / id / label / placeholder / autocomplete / type.
  // Text is folded to lowercase ASCII first (Turkish-aware: "İl" → "il", "Soyadı" → "soyadi").
  const fold = (x) => String(x || "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[̀-ͯ]/g, "");
  const W = (re) => new RegExp(`(^|[^a-z])(${re})($|[^a-z])`);  // whole-word match
  const RULES = [
    [/tckn|kimlik|identity|national.?id/, "tckn"], [W("t\\.?c\\.?( ?no)?"), "tckn"], [/vkn|vergi|tax.?(no|number|id)/, "vkn"], [/iban/, "iban"],
    [/e-?posta|e-?mail|mail/, "email"], [/cvv|cvc|guvenlik kodu|security code|csc/, "cvv"],
    [/son kullanma|expir|cc-exp|W?exp(iry|date)?$/, "cardExp"], [/kart ?(no|num)|card ?(number|no)|cc-number|kredi kart/, "card"],
    [/tel|phone|gsm|cep|mobile/, "phone"], [/dogum|birth|dob|bday/, "birthdate"],
    [/posta kodu|zip|postal|postcode/, "zip"], [/ilce|district|county/, "district"], [W("il|sehir|city|town"), "city"],
    [/adres|address|street|sokak|mahalle/, "address"], [/sirket|firma|company|organi[sz]ation|kurum/, "company"],
    [/plaka|plate/, "plate"], [/ad ?soyad|ad-soyad|full.?name|isim soyisim|adiniz soyadiniz/, "fullName"],
    [/kullanici adi|username|user.?name|login|nick/, "username"],
    [/soyad|surname|last.?name|family.?name/, "lastName"], [W("ad|adi|adiniz|isim|isminiz") , "firstName"], [/first.?name|given.?name/, "firstName"],
    [/password|parola|sifre/, "password"], [W("name"), "fullName"],
  ];
  function guess(desc, type) {
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "password") return "password";
    const d = fold(desc);
    for (const [re, k] of RULES) if (re.test(d)) return k;
    return null;
  }

  self.RAF_TESTDATA = { GEN, ORDER, guess, fold, birthIso: () => birth(true) };
})();
