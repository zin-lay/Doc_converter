# Requirements

## Software

| Software | Version | Needed for | Install |
|---|---|---|---|
| Node.js | 20 LTS+ (18.17 min) | Running the app | https://nodejs.org |
| Poppler | any recent | PDF → images (**required**) | `sudo apt install poppler-utils` |
| LibreOffice | 7.x+ | Word/PowerPoint → images (optional) | `sudo apt install libreoffice` |
| Git | any | Cloning the repo (optional) | https://git-scm.com |

Without Poppler, no conversions run. Without LibreOffice, PDF still works but Word/PowerPoint are disabled (the app detects this and tells you).

**Docker alternative:** only Docker is needed; the image installs both engines for you.

## Operating systems

- Linux (Debian/Kali/Ubuntu, RHEL/Rocky, etc.)
- macOS 12+ — install engines with Homebrew: `brew install poppler` and `brew install --cask libreoffice`
- Windows 10/11 — install the Poppler build and LibreOffice, and make sure `pdftoppm` and `soffice` are on PATH (or set `SOFFICE_BIN` in `.env`). Docker or WSL is often easier on Windows.

## Hardware

- Light for PDFs. LibreOffice uses more memory for Office files; 4 GB RAM is comfortable.
- Disk: the app is small; converted images live in the system temp folder briefly and are auto-deleted (`JOB_TTL_MIN`).
- Higher DPI = sharper but larger images and more CPU/time. 150 DPI suits screens; 300 DPI suits print.

## Supported input formats

| Input | Extensions | Engine |
|---|---|---|
| PDF | .pdf | Poppler |
| Word | .docx, .doc, .odt, .rtf | LibreOffice → Poppler |
| PowerPoint | .pptx, .ppt, .odp | LibreOffice → Poppler |
| Spreadsheet | .xlsx, .xls, .ods | LibreOffice → Poppler |

## Output

- **PNG** (lossless, sharpest) or **JPG** (smaller, adjustable quality).
- One image per page/slide, named `<file>-p01.png`, `<file>-p02.png`, …
- Download individually or as a single ZIP.

## npm package

| Package | Version | License | Purpose |
|---|---|---|---|
| jszip | 3.10.1 | MIT | Building the ZIP download |

The server otherwise uses only built-in Node.js modules.
