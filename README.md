# MSc/MPhil IT Class Roster

Class roster verification portal for the MSc/MPhil Information Technology cohort. Students enter their index number to check their name and details, then confirm them or request a correction. Every response updates the master list.

| Page | Who uses it | What it does |
|---|---|---|
| `index.html` | Students | Look up by index number, confirm details, request a correction, or report a missing name |
| `admin.html` | Class rep | Password-protected master list: verified / not verified counts, search, download as Excel or CSV |

No student names are stored in this repository. The roster and all responses live in a private Google Sheet that only the Apps Script back end can read.

## How it fits together

```
Student ─▶ index.html (GitHub Pages) ─▶ Apps Script web app ─▶ Google Sheet (private)
Class rep ─▶ admin.html (GitHub Pages) ─▶ Apps Script (needs ADMIN_KEY) ─▶ same sheet
```

## Setup

1. **Google Sheet** – open your copy of *MSc IT Class Roster – Master List* (tabs: Master List, Summary, Log).
2. **Back end** – in the sheet go to *Extensions → Apps Script*, paste `backend/Code.gs`, and save.
3. **Admin password** – in Apps Script open *Project Settings* (gear) → *Script properties* → add `ADMIN_KEY` with a long password. Do **not** put the password in any file in this repo.
4. **Deploy** – *Deploy → New deployment → Web app*, Execute as **Me**, Who has access **Anyone**. Authorise, then copy the web app URL.
5. **Connect** – edit `config.js` in this repo and paste the URL between the quotes. Commit.
6. **GitHub Pages** – *Settings → Pages → Deploy from a branch → main / (root)*.

Student link: `https://<username>.github.io/<repo>/`
Master list: `https://<username>.github.io/<repo>/admin.html`

## Updating the back end

If you change `Code.gs`, redeploy with *Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy*. This keeps the same URL, so `config.js` does not change.
