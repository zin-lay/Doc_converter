# Includes Poppler + LibreOffice so all conversions work out of the box.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils libreoffice-core libreoffice-writer libreoffice-impress libreoffice-calc \
      fonts-dejavu fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
ENV HOST=0.0.0.0 PORT=3100 NODE_ENV=production
EXPOSE 3100
CMD ["node","server.js"]
