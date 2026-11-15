# Raf — Privacy Policy

*Last updated: November 15, 2026* · [Türkçe aşağıda](#türkçe)

Raf is a browser extension for saving web pages and a set of developer / testing tools. It is built to keep your data with you.

## What Raf stores, and where

- **Local mode (default).** Pages you save (address, title, description, your tags and note, the page's readable text and an optional screenshot) are stored **only in your browser** (IndexedDB). They never leave your computer unless you export them yourself.
- **Your own Raf server (optional).** If you enter a server address and token in Settings, saved pages are sent **only to that server**, which you run and control. Nobody else, including the developer of Raf, receives them.
- **Settings** (language, theme, which features are on, and your server address/token if you add one) are kept in Chrome's extension storage. Chrome may sync them between your own devices if you use Chrome Sync.

## What Raf does not do

- No analytics, tracking, advertising or telemetry.
- No accounts. Raf has no servers of its own and collects nothing.
- No selling or sharing of data with anyone.
- No remote code. Everything the extension runs is in the package you install. Fonts and icons are bundled too.

## Permissions, and why

| Permission | Why Raf needs it |
|---|---|
| `activeTab`, `scripting` | Read the title, description and text of the page **you** choose to save, and run the tools you click (locator picker, form filling, insert UUID / test data). Only on the current tab and only when you use Raf. |
| `storage` | Keep your settings, and in local mode your shelf. |
| `contextMenus` | The right-click entries (save page / link / selection, insert UUID or test data). |
| `downloads` | Save a screenshot as a PNG, and, with a server, save finished video downloads to your Downloads folder. |
| `clipboardWrite` | The Copy buttons (UUID, test data, locators, screenshot). |
| `alarms`, `notifications` | Check on a running video download, check your own Telegram bot for new messages every 30 seconds (only if you set it up), and tell you when a save or download finished. |
| Video sites (Instagram, X, TikTok, Vimeo, Reddit…) | Show the small download button on videos. Without a server, Raf saves the video file the page is already playing straight to your Downloads folder. With your own server, the server downloads it. |
| `cookies` (optional, asked when you connect a server) | Some sites only serve a video to logged-in users. When **you** start a download from such a site, Raf sends that site's cookies to **your own server** for that one download. They're held in memory and deleted when the job ends. |
| Your server's address (optional) | Talk to the Raf server you entered. |
| `api.telegram.org` (optional, asked when you set up Telegram) | Use **your own** Telegram bot: send the pages you choose to your chat, and read messages you send to the bot. |

## Telegram (optional)

If you connect your own bot (made with @BotFather), Raf sends the pages you choose (title, address, your tags and note) to your Telegram chat, and saves links you send to the bot. The messages go straight between your browser and Telegram's servers. Telegram's [privacy policy](https://telegram.org/privacy) applies to them. The bot token is stored only on that computer (not synced). Messages from anyone else who writes to your bot are ignored.

## Video downloads

Without a server, Raf saves the video file the page is already playing, straight from the site to your computer. Nothing goes through anyone else. With your own Raf server, the server downloads it. Raf refuses paid / DRM-protected services (Netflix, Disney+, Prime Video, Spotify and similar) and live streams. The Chrome Web Store version does not download from YouTube. You are responsible for respecting copyright and each site's terms.

## Contact

Questions: open an issue at https://github.com/selimyalinkilic/raf/issues

---

## Türkçe

Raf, web sayfalarını kaydetmek için bir tarayıcı eklentisi ve geliştirici/test araçlarıdır. Verin sende kalsın diye tasarlandı.

- **Yerel mod (varsayılan):** Kaydettiğin sayfalar (adres, başlık, açıklama, etiket ve notun, sayfanın okunabilir metni, isteğe bağlı ekran görüntüsü) **yalnızca tarayıcında** (IndexedDB) tutulur. Sen dışa aktarmadıkça bilgisayarından çıkmaz.
- **Kendi Raf sunucun (isteğe bağlı):** Ayarlar'a bir sunucu adresi ve anahtar girersen kayıtlar **yalnızca o sunucuya** gider. O sunucuyu sen çalıştırırsın, Raf'ın geliştiricisi dahil kimse bu verileri almaz.
- **Ayarlar** (dil, tema, açık özellikler, varsa sunucu adresi/anahtarı) Chrome'un eklenti deposunda tutulur. Chrome Sync açıksa kendi cihazların arasında eşitlenebilir.
- **Telegram (isteğe bağlı):** Kendi botunu bağlarsan, seçtiğin sayfalar (başlık, adres, etiket ve notun) Telegram sohbetine gönderilir, bota attığın linkler kaydedilir. Mesajlar doğrudan tarayıcınla Telegram arasında gider. Bot token'ı yalnızca o bilgisayarda saklanır, eşitlenmez. Senden başkasının bota yazdıkları yok sayılır.
- **Yok:** analitik, izleme, reklam, hesap, veri satışı ya da paylaşımı, uzaktan kod. Raf'ın kendine ait sunucusu yoktur, hiçbir veri toplamaz.
- **Çerezler (isteğe bağlı):** Yalnızca sunucu bağlıyken ve girişli bir siteden video indirmeyi **sen** başlattığında, o sitenin çerezleri o tek indirme için **kendi sunucuna** gönderilir. Bellekte tutulur, iş bitince silinir.
- **Video indirme:** Sunucu olmadan Raf, sayfanın zaten oynattığı video dosyasını doğrudan siteden bilgisayarına kaydeder, araya kimse girmez. Kendi Raf sunucun varsa indirmeyi sunucu yapar. Ücretli/DRM'li servisler (Netflix, Disney+, Prime Video, Spotify vb.) ve canlı yayınlar reddedilir. Mağaza sürümü YouTube'dan indirmez. Telif haklarına ve sitelerin kurallarına uymak kullanıcının sorumluluğundadır.
