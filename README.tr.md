<p align="center">
  <img src="server/app/static/icon-192.png" width="88" alt="Raf">
</p>

<h1 align="center">Raf</h1>

<p align="center">
  <b>Kendi sunucunda çalışan "sonra oku" rafın: Chrome eklentisi, video indirme ve Telegram botuyla.</b>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Türkçe</b>
</p>

<p align="center">
  <img src="docs/demo.gif" width="760" alt="Raf demo: sayfayı kaydet, rafta bul, formu test verisiyle doldur">
</p>

Raf, baktığın sayfayı tek tıkla **kendi sunucuna** kaydeder: başlık, etiketler, not, sayfanın okunabilir metni ve ekran görüntüsü. Böylece site kapansa bile içeriği bulursun. Ayrıca neredeyse her yerden video indirir; geliştiricilerin ve test uzmanlarının her gün kullandığı küçük araçları da bir arada sunar.

## Ekran görüntüleri

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/screenshots/extension-tr.png" alt="Chrome eklentisi"><br><sub>Chrome eklentisi: kaydet ve araçlar</sub></td>
    <td align="center" width="50%"><img src="docs/screenshots/web-shelf.png" alt="Web uygulaması"><br><sub>Web uygulaması: tam metin aramalı rafın</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/web-downloads.png" alt="İndirilenler"><br><sub>İndirilenler: arama, filtreler, tarayıcıda izleme</sub></td>
    <td align="center"><img src="docs/screenshots/mobile.png" alt="Mobil PWA"><br><sub>Telefona kurulabilen PWA</sub></td>
  </tr>
</table>

## Özellikler

### Chrome eklentisi
- **Kaydet:** sayfayı, bir linki ya da seçili metni kaydet (popup, sağ tık menüsü veya <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>). Etiket önerileri, not ve isteğe bağlı ekran görüntüsü.
- **Oturumlar:** açık sekmelerin hepsini tek seferde kaydet, sonra yeni bir pencerede geri aç.
- **Video ve ses indirme:** YouTube, X/Twitter, Instagram, TikTok, Reddit, Vimeo ve [1000'den fazla site](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).
  - videoların üstünde **Raf butonu** ve kalite seçimi (4K'ya kadar)
  - dosyalar otomatik olarak *İndirilenler/Raf* klasörüne iner
  - giriş isteyen siteler (Instagram…) tarayıcı oturumunla çalışır; çerezler sadece o indirme için gönderilir, saklanmaz
- **Telefona gönder:** sayfanın QR kodu ya da Telegram'a gönderme.
- **Geliştiriciler ve test uzmanları için:**
  - **Locator seçici:** bir öğeye tıkla, Playwright locator'ını al (`getByRole`, `getByTestId`…), <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>
  - **Test verisi (TR):** ad, e-posta, telefon, adres; doğrulamadan geçen TCKN / VKN / IBAN
  - **Formu doldur:** tüm formu tek bir sahte kişiyle doldur, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>. Senin yazdığın alanlara dokunmaz.
  - UUID v4 (sağ tık → *UUID ekle* veya <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>), Lorem ipsum, Base64 (UTF-8 uyumlu), JWT çözücü, ekran görüntüsünü PNG/panoya alma
- **Ayarlar:** her özelliği, menü öğesini ve aracı tek tek açıp kapat. Arayüz Türkçe veya İngilizce.
- Sunucuda yeni sürüm varsa haber verir.

### Sunucu ve web uygulaması
- FastAPI + SQLite; Türkçe karakter duyarsız tam metin arama (*bakim* yazınca *bakım* bulunur)
- Web arayüzü ve telefona kurulabilen **PWA** (iPhone ana ekranına eklenebilir), Türkçe ve İngilizce
- yt-dlp + ffmpeg ile indirme kuyruğu; videolar gerekirse H.264'e çevrilir, iPhone'da oynar ve Fotoğraflar'a kaydedilir
- İndirilenler sayfasında arama, filtreler (durum, tür, platform, kaynak, tarih) ve sıralama

### Telegram botu
- Link gönder, kaydedilsin. Aynı mesaja `#etiket` ve not ekleyebilirsin.
- `/indir <link>` video, `/ses <link>` sadece ses indirir (50 MB altı dosyalar sohbete gelir)
- `/bugun`, `/son`, `/ara <kelime>` ve her akşam 21:00'de günlük özet

## Kurulum

```yaml
# docker-compose.yml
services:
  raf:
    build: ./server
    env_file: [raf.env]            # RAF_API_TOKEN=…, isteğe bağlı RAF_TELEGRAM_TOKEN / RAF_TELEGRAM_CHAT_ID
    environment:
      RAF_PUBLIC_URL: https://sunucun:8454
      RAF_DIGEST_HOUR: "21"
    volumes:
      - ./data:/data               # veritabanı + ekran görüntüleri
      - ./extension:/ext:ro        # /extension.zip olarak sunulur, adres ve anahtar hazır gelir
      - ./videos:/videos           # indirilen videolar
    ports: ["127.0.0.1:8098:8000"]
```

HTTPS arkasına koy (ör. Tailscale Serve, Caddy). Raf özel bir ağ için tasarlandı: web arayüzünün kendi girişi yok, API `RAF_API_TOKEN` ile korunuyor.

**Eklentiyi kur:**
1. `https://sunucun/extension.zip` dosyasını indirip bir klasöre çıkar.
2. `chrome://extensions` sayfasını aç, *Geliştirici modu*'nu aç.
3. *Paketlenmemiş öğe yükle* ile çıkardığın klasörü seç.

Sunucu adresi ve anahtar hazır gelir.

**Güncelleme:** Yeni zip'i aynı klasörün üzerine çıkar, Raf kartında ↻'ye bas.

## Proje yapısı

```
server/      FastAPI uygulaması (app/main.py, db.py, downloads.py, telegram.py, web.py) + Dockerfile
extension/   Chrome MV3 eklentisi (_locales/en, _locales/tr)
docs/        ekran görüntüleri ve demo
```

## Lisans

[MIT](LICENSE) © Selim Yalınkılıç

<p align="center"><sub>İkonlar: <a href="https://lucide.dev">Lucide</a> (ISC) · QR kod: <a href="https://github.com/kazuhikoarase/qrcode-generator">qrcode-generator</a> (MIT) · Video motoru: <a href="https://github.com/yt-dlp/yt-dlp">yt-dlp</a></sub></p>
