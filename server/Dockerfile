FROM denoland/deno:bin AS deno
FROM python:3.12-slim
# ffmpeg: video+ses birleştirme / mp3; deno: yt-dlp'nin YouTube için ihtiyaç duyduğu JS çalıştırıcı
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
ENV PYTHONUNBUFFERED=1 DB_PATH=/data/raf.db
EXPOSE 8000
# yt-dlp siteler değiştikçe sık güncellenir: her açılışta en yeni sürüme çek
CMD ["sh", "-c", "pip install -q -U --user --no-warn-script-location 'yt-dlp[default]' 2>/dev/null || true; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
