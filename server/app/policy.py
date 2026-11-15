"""What Raf refuses to download.

Paid / DRM streaming and music services are blocked by domain (their content is copyrighted and
DRM-protected — downloading it breaks their terms and, in many countries, the law). Live streams and
scheduled premieres are refused too (checked from yt-dlp's live_status)."""
from urllib.parse import urlparse

BLOCKED = {
    # global streaming
    "netflix.com": "Netflix", "disneyplus.com": "Disney+", "primevideo.com": "Prime Video",
    "hbomax.com": "HBO Max", "max.com": "Max", "hulu.com": "Hulu", "tv.apple.com": "Apple TV+",
    "paramountplus.com": "Paramount+", "peacocktv.com": "Peacock", "crunchyroll.com": "Crunchyroll",
    "mubi.com": "MUBI", "dazn.com": "DAZN", "skyshowtime.com": "SkyShowtime", "now.com": "NOW",
    # Turkey
    "blutv.com": "BluTV", "exxen.com": "Exxen", "gain.tv": "Gain", "tabii.com": "tabii",
    "todtv.com.tr": "TOD", "beinconnect.com.tr": "beIN CONNECT", "digiturkplay.com": "Digiturk Play",
    "ssportplus.com": "S Sport Plus", "tivibu.com.tr": "Tivibu", "tvplus.com.tr": "TV+",
    # music
    "spotify.com": "Spotify", "music.apple.com": "Apple Music", "deezer.com": "Deezer",
    "tidal.com": "TIDAL", "music.amazon.com": "Amazon Music", "music.youtube.com": "YouTube Music",
}
# Amazon's own domains host Prime Video under /gp/video
AMAZON_VIDEO = ("/gp/video", "/video/")


def blocked(url):
    """Return the service name if this URL must not be downloaded, else None."""
    p = urlparse(url)
    host = p.netloc.lower().split(":")[0]
    for dom, name in BLOCKED.items():
        if host == dom or host.endswith("." + dom):
            return name
    if (host.startswith("amazon.") or ".amazon." in host) and p.path.startswith(AMAZON_VIDEO):
        return "Prime Video"
    return None


def blocked_message(name):
    return f"Raf doesn't download from {name}: paid / DRM-protected content."


LIVE_MESSAGE = "Raf doesn't download live streams or upcoming premieres. Try again once it has ended."


def live_filter(info, *, incomplete=False):
    """yt-dlp match_filter: returning a string skips the video."""
    if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
        return LIVE_MESSAGE
    return None
