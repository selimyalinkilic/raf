# Chrome Web Store listing

Everything to paste into the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).
Package: `./scripts/build-store.sh` → `dist/raf-store-<version>.zip`.

## Store assets (this folder)

| Field | File |
|---|---|
| Icon 128×128 | `extension/icons/128.png` |
| Screenshots 1280×800 (in this order) | `screenshot-1-save.png`, `screenshot-2-search.png`, `screenshot-3-fill.png`, `screenshot-4-picker.png`, `screenshot-5-dark.png` |
| Small promo tile 440×280 | `promo-small-440x280.png` |
| Marquee promo tile 1400×560 | `promo-marquee-1400x560.png` |
| Promo video (YouTube) | https://youtu.be/_U53kZwrMeg (source: `raf-demo.mp4`) |

- **Category:** Productivity. Developer Tools also fits, but Productivity is the main use.
- **Language:** English (default) + Turkish. The extension already ships `_locales/en` and `_locales/tr`, so the store shows the right name and summary.
- **Privacy policy URL:** `https://github.com/selimyalinkilic/raf/blob/main/docs/PRIVACY.md`
- **Homepage / support URL:** `https://github.com/selimyalinkilic/raf`

---

## English

**Summary (max 132 characters)**

> Save pages to your own private shelf and find them again, plus test-data, form-fill and Playwright locator tools. No account.

**Description**

```
Raf ("shelf" in Turkish) saves the page you're looking at in one click and helps you find it again — plus a handful of tools developers and testers use every day.

No account, no sign-up, no tracking. Your shelf lives in your browser.

SAVE & FIND
• Save the current page, a link or a text selection — from the toolbar, the right-click menu or Alt+Shift+S
• Add tags (with suggestions), a note and an optional screenshot
• Search everything you saved, including the page text. Accents don't matter: "bakim" finds "bakım"
• Filter by tag, export your shelf to a JSON file, import it back anywhere
• Save all open tabs as a session and reopen them later

FOR DEVELOPERS & TESTERS
• Locator picker: click any element and get ranked Playwright locators (getByTestId, getByRole, text, CSS, XPath) with live match counts — Alt+Shift+L
• Fill form: fill a whole form with one consistent fake person — Alt+Shift+F. Fields you already typed in are left alone
• Test data (Turkey): names, emails, phone numbers, addresses, checksum-valid national ID (TCKN), tax number (VKN) and IBAN — right-click any field to insert one
• UUID v4 (right-click → Insert UUID, or Alt+Shift+U), Lorem ipsum, Base64 (UTF-8 safe), JWT decoder
• Screenshot of the visible area to PNG or clipboard
• QR code of the current page to open it on your phone

MAKE IT YOURS
• Light and dark theme (or follow your system)
• English and Turkish
• Turn every feature and menu entry on or off

GOING FURTHER: YOUR OWN RAF SERVER (optional, open source)
Raf is open source. If you run the Raf server yourself (Docker), the extension can also download videos from many sites, send links to your Telegram, and give you the same shelf on your phone through a web app. Raf never downloads from paid / DRM-protected services or live streams. The Chrome Web Store version does not download from YouTube. See the GitHub page for the self-hosted version.

PRIVACY
Everything stays in your browser unless you connect your own server. Raf has no servers of its own and collects nothing. No analytics, no ads.
Source code: https://github.com/selimyalinkilic/raf
```

---

## Türkçe

**Özet (en fazla 132 karakter)**

> Sayfaları kendi özel rafına kaydet, kolayca bul; test verisi, form doldurma ve Playwright locator araçları. Hesap gerekmez.

**Açıklama**

```
Raf, baktığın sayfayı tek tıkla kaydeder ve sonra kolayca bulmanı sağlar; üstüne geliştiricilerin ve test uzmanlarının her gün kullandığı araçları da getirir.

Hesap yok, kayıt yok, izleme yok. Rafın kendi tarayıcında durur.

KAYDET VE BUL
• Sayfayı, bir linki ya da seçili metni kaydet — araç çubuğundan, sağ tık menüsünden ya da Alt+Shift+S ile
• Etiket (önerili), not ve isteğe bağlı ekran görüntüsü ekle
• Sayfa metni dahil her şeyde ara. Türkçe karakterler sorun değil: "bakim" yazınca "bakım" bulunur
• Etikete göre süz, rafını JSON olarak dışa aktar, istediğin yerde geri yükle
• Açık sekmelerin hepsini oturum olarak kaydet, sonra tek tıkla geri aç

GELİŞTİRİCİ VE TEST ARAÇLARI
• Locator seçici: bir öğeye tıkla, sıralanmış Playwright locator'larını al (getByTestId, getByRole, metin, CSS, XPath) — eşleşme sayılarıyla, Alt+Shift+L
• Formu doldur: tüm formu tek bir sahte kişiyle doldur — Alt+Shift+F. Senin yazdığın alanlara dokunmaz
• Test verisi: ad, e-posta, telefon, adres; doğrulamadan geçen TCKN, VKN ve IBAN — sağ tıkla herhangi bir alana ekle
• UUID v4 (sağ tık → UUID ekle ya da Alt+Shift+U), Lorem ipsum, Base64 (UTF-8 uyumlu), JWT çözücü
• Görünen alanın ekran görüntüsünü PNG'ye ya da panoya al
• Sayfanın QR kodu ile telefonda aç

SENİN GİBİ OLSUN
• Açık ve koyu tema (ya da sistemi takip et)
• Türkçe ve İngilizce
• Her özelliği ve menü öğesini tek tek aç/kapat

DAHA FAZLASI: KENDİ RAF SUNUCUN (isteğe bağlı, açık kaynak)
Raf açık kaynaktır. Raf sunucusunu kendin çalıştırırsan (Docker), eklenti birçok siteden video da indirebilir, linkleri Telegram'ına gönderir ve web uygulamasıyla aynı rafı telefonunda da görürsün. Raf ücretli/DRM'li servislerden ve canlı yayınlardan asla indirmez. Chrome Web Mağazası sürümü YouTube'dan indirmez. Kendi sunucunda çalışan sürüm için GitHub sayfasına bak.

GİZLİLİK
Kendi sunucunu bağlamadıkça her şey tarayıcında kalır. Raf'ın kendine ait sunucusu yoktur, hiçbir veri toplamaz. Analitik yok, reklam yok.
Kaynak kod: https://github.com/selimyalinkilic/raf
```

---

## Privacy practices tab

**Single purpose**

> Raf helps users save web pages to a personal shelf and find them again, with a small set of productivity tools for people who build and test websites (form filling, test data, locator picker).

**Permission justifications**

| Permission | Justification |
|---|---|
| activeTab | Read the title, description and text of the page the user chooses to save, and capture a screenshot of it when asked. |
| scripting | Run user-triggered tools on the current page: extract the page for saving, fill a form with test data, insert a UUID / test value, start the locator picker. |
| storage | Store the user's settings and, in local mode, the user's saved pages. |
| contextMenus | Right-click entries: save page / link / selection, insert UUID, insert test data, fill form. |
| downloads | Save a screenshot as PNG; save a finished video download from the user's own server to the Downloads folder. |
| clipboardWrite | Copy buttons for UUIDs, test data, locators and screenshots. |
| alarms | Check the status of a video download running on the user's own server. |
| notifications | Tell the user that a save or download finished or failed. |
| Host permissions (video sites) | Show a small download button on videos on these sites. It saves the video file the page already plays straight to the user's Downloads folder, or hands the link to the user's own self-hosted server. |
| cookies (optional) | Requested only when the user connects their own server. Lets downloads work on sites that need a login: that site's cookies are sent to the user's own server for that one download and are not stored. |
| Optional host permissions (any https) | Requested for the one server address the user enters in Settings, so the extension can reach the user's own self-hosted Raf server. |

**Remote code:** No, I am not using remote code.

**Data usage:** Do **not** tick any category. Raf doesn't collect or transmit user data to the developer. Saved pages stay in the browser, or go only to the user's own server.
Tick all three certifications (no selling, no unrelated use, no creditworthiness use).

---

## Before you submit

- [ ] One-time $5 developer registration in your Google account
- [ ] `./scripts/build-store.sh` and upload `dist/raf-store-<version>.zip`
- [ ] Upload the assets listed above, paste the texts
- [x] Promo video on YouTube: https://youtu.be/_U53kZwrMeg
- [ ] Privacy policy URL works (the repo must be public)
