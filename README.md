# Raf

Kişisel "sonra bak" rafı: açık sayfayı tek tıkla kendi sunucuna kaydet, her yerden video indir, günlük özeti Telegram'dan al.

- **Chrome eklentisi** (`extension/`, MV3): sayfa/link/seçili metin kaydetme, ekran görüntüsü, video & ses indirme (yt-dlp, tarayıcı oturumunla), araçlar (UUID, Lorem ipsum, Base64, JWT çözücü, ekran görüntüsü).
- **Sunucu** (`server/`, FastAPI + SQLite FTS5): API, web arayüzü / PWA (iOS ana ekrana eklenebilir), indirme kuyruğu (yt-dlp + ffmpeg, iPhone uyumlu H.264), Türkçe karakter duyarsız arama.
- **Telegram botu**: link gönder → kaydet; `/indir`, `/ses`, `/bugun`, `/son`, `/ara`; her akşam 21:00 günlük özet.

## Çalıştırma

```yaml
services:
  raf:
    build: ./server
    env_file: [raf.env]          # RAF_API_TOKEN, RAF_TELEGRAM_TOKEN, RAF_TELEGRAM_CHAT_ID
    environment:
      RAF_PUBLIC_URL: https://sunucu-adresin:8454
    volumes:
      - ./data:/data             # veritabanı + ekran görüntüleri
      - ./extension:/ext:ro      # /extension.zip bu klasörden, sunucu adresi + anahtarla paketlenir
      - ./videolar:/videos       # indirilen videolar
    ports: ["127.0.0.1:8098:8000"]
```

Eklenti kurulumu: sunucuda `/extension.zip` → klasöre çıkar → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle.
Eklentide her değişiklikte `manifest.json` sürümünü artır; popup eski sürümü fark edip uyarır.
