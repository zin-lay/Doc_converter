# Document → Image Converter

A self-hosted tool that turns **PDF, Word and PowerPoint** pages into high-quality **PNG or JPG** images, rendered faithfully so the output keeps the original layout, colours and design.

Everything runs on your own machine using open-source engines. **No API key, no cloud, nothing leaves your network.** A companion to the Nexora Tech Document Summarizer, with the same look and self-hosted setup.

<!-- Add a screenshot at docs/screenshot.png and uncomment: -->
<!-- ![Screenshot](docs/screenshot.png) -->

## What it does

- **PDF → images** — each page becomes a PNG or JPG. (Needs Poppler.)
- **Word & PowerPoint → images** — each page/slide becomes an image, rendered through LibreOffice so the layout is preserved. (Needs LibreOffice.)
- Choose **format** (PNG sharpest, JPG smaller), **resolution** (96–300 DPI), a **page range**, and JPG quality.
- Preview every page in the browser, **Save** individual images, or **Download all** as a ZIP.
- Images are rendered on the server and auto-deleted from temporary storage after a while.

## Requirements

- **Node.js 20+**
- **Poppler** (`poppler-utils`) — required, powers PDF rendering
- **LibreOffice** — optional, adds Word/PowerPoint support

Full details and per-OS steps are in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) and [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Quick start

```bash
git clone https://github.com/zin-lay/Doc-image-converter.git
cd Doc-image-converter
npm install

# Install the conversion engines (Debian/Kali/Ubuntu):
sudo apt install poppler-utils libreoffice

npm run check     # confirms Node, packages and engines
npm start
```

Open **http://localhost:3100**.

Prefer containers? `docker compose up -d --build` includes both engines automatically — see [docs/INSTALLATION.md](docs/INSTALLATION.md).

## How it works

```
Browser ──upload file──▶ Node server ──▶ [LibreOffice: Office → PDF] ──▶ [Poppler: PDF → PNG/JPG] ──▶ images
   ▲                                                                                                    │
   └──────────────────────── preview + ZIP download ◀───────────────────────────────────────────────┘
```

The server never sends your files anywhere; it only calls the local `pdftoppm` and `soffice` programs.

## Project structure

```
Doc-image-converter/
├── server.js            Web server + conversion pipeline (only dependency: jszip)
├── public/              index.html, app.js, styles.css, logo, favicon
├── scripts/check.js     Setup checker (npm run check)
├── docs/                REQUIREMENTS.md, INSTALLATION.md
├── .env.example         Configuration template
├── Dockerfile           Image with Poppler + LibreOffice included
└── docker-compose.yml
```

## Limitations

- Password-protected or corrupt files can't be converted; remove the password first.
- Very large files at 300 DPI produce big images and take longer; lower the DPI or use a page range.
- The older `.doc`/`.ppt` formats work through LibreOffice but may render slightly differently from modern Office.

## Security

- Listens on `127.0.0.1` (this computer only) by default.
- To share on a network, set `HOST=0.0.0.0` **and** `APP_PASSWORD`, and ideally put it behind HTTPS. See the installation guide.
- Never commit your `.env` — it's already in `.gitignore`.

## License

[MIT](LICENSE). Third-party components keep their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Poppler and LibreOffice are separate programs under their own licenses. The Nexora Tech name and logo are trademarks of their owner.
