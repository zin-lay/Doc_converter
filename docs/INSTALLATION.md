# Installation Guide

See [REQUIREMENTS.md](REQUIREMENTS.md) first. Choose an option:

- [Linux (Debian/Kali/Ubuntu)](#linux-debiankaliubuntu)
- [macOS](#macos)
- [Windows](#windows)
- [Docker (any OS)](#docker-any-os)
- [Sharing on your network](#sharing-on-your-network)
- [Troubleshooting](#troubleshooting)

---

## Linux (Debian/Kali/Ubuntu)

```bash
# 1. Node.js 20 (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Conversion engines
sudo apt-get install -y poppler-utils libreoffice

# 3. The app
git clone https://github.com/zin-lay/Doc-image-converter.git
cd Doc-image-converter
npm install
cp .env.example .env        # optional
npm run check
npm start
```

Open **http://localhost:3100**. Stop with `Ctrl + C`.

---

## macOS

```bash
brew install node poppler
brew install --cask libreoffice     # optional: Word/PowerPoint support

git clone https://github.com/zin-lay/Doc-image-converter.git
cd Doc-image-converter
npm install
npm run check
npm start
```

---

## Windows

1. Install **Node.js LTS** from https://nodejs.org.
2. Install **LibreOffice** from https://www.libreoffice.org (optional, for Word/PowerPoint).
3. Install a **Poppler for Windows** build and add its `bin` folder to your PATH so `pdftoppm` works.
4. Then:
   ```powershell
   git clone https://github.com/zin-lay/Doc-image-converter.git
   cd Doc-image-converter
   npm install
   npm run check
   npm start
   ```

If `soffice` isn't on PATH, set its full path in `.env`:
`SOFFICE_BIN=C:\Program Files\LibreOffice\program\soffice.exe`

> Tip: On Windows, Docker Desktop or WSL avoids the manual Poppler/LibreOffice setup.

---

## Docker (any OS)

The image includes Poppler and LibreOffice, so nothing else is needed.

```bash
git clone https://github.com/zin-lay/Doc-image-converter.git
cd Doc-image-converter
cp .env.example .env         # optional
docker compose up -d --build
```

Open **http://localhost:3100**. Logs: `docker compose logs -f`. Stop: `docker compose down`.

---

## Sharing on your network

1. In `.env`:
   ```ini
   HOST=0.0.0.0
   APP_USER=team
   APP_PASSWORD=choose-a-strong-password
   ```
2. Restart, and allow the port through the firewall (`sudo ufw allow 3100/tcp` on Linux).
3. Colleagues open `http://YOUR-IP:3100` and sign in.

For anything beyond a trusted LAN, put it behind HTTPS with a reverse proxy (Caddy/Nginx) and keep `HOST=127.0.0.1` so only the proxy reaches the app. With Nginx, raise `client_max_body_size` to at least your `MAX_UPLOAD_MB`.

---

## Troubleshooting

Run `npm run check` first.

| Problem | Fix |
|---|---|
| Badge says "Engine missing" | Install Poppler: `sudo apt install poppler-utils`, then restart. |
| Badge says "PDF only" | That's expected without LibreOffice. Install it for Word/PowerPoint: `sudo apt install libreoffice`. |
| Word/PowerPoint fails but PDF works | LibreOffice isn't found. Install it, or set `SOFFICE_BIN` in `.env` to its full path. |
| "File is larger than the … limit" | Raise `MAX_UPLOAD_MB` in `.env`. |
| "Conversion took too long" | Use a page range, lower the DPI, or raise `CONVERT_TIMEOUT_MS`. |
| Images look low-res | Pick a higher Resolution (220 or 300 DPI). |
| First Office conversion is slow | LibreOffice warms up on first run; later conversions are faster. |
| `EADDRINUSE` | Port 3100 is busy. Set `PORT=3101` in `.env`. |
| Result links say "expired" | Images auto-delete after `JOB_TTL_MIN` minutes. Convert again. |
