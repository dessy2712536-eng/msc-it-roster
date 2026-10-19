# GCTU · MPhil/MSc Information Technology · January 2026 Cohort — Class Portal

| Page | Who | What it does |
|---|---|---|
| `index.html` | Students | Enter index number → next class, attendance ring, attendance per course, every class, timetable; confirm name & index, add emails, report an issue |
| `admin.html` | Class reps (2 admins) | Take the register (Present / Absent / Excused), edit or delete past classes, see students & emails, read feedback, download Excel |

Every issue a student reports is **emailed to both admins** and listed on the Feedback tab.
No student data lives in this repository — it is all in a private Google Sheet reached through Apps Script.

```
Students  ─▶ index.html ─┐
                          ├─▶ Apps Script web app ─▶ Google Sheet (private) ─▶ email to class rep
Class reps ─▶ admin.html ─┘       (email + password per admin)
```

## Files
```
index.html            student portal
admin.html            class rep (register, students, feedback)
config.js             ← paste the Apps Script web app URL here
assets/app.css        design tokens + components
assets/common.js      shared helpers
assets/timetable.js   2nd-semester timetable (courses, lecturers, times, venues) — edit if it changes
assets/gctu-logo.png  ← add the GCTU logo (see assets/LOGO-README.txt)
backend/Code.gs       paste into the Google Sheet's Apps Script
```

## Setup (one time)
1. Google Sheet → **Extensions → Apps Script** → paste `backend/Code.gs` → Save.
2. **Project Settings → Script properties** — add one property per admin. Property = the admin's email, Value = their password. Feedback emails go to every admin listed (optional `NOTIFY_EMAIL` overrides). Admin emails and passwords live only here, never in the repo.
3. In the editor choose the **setup** function → **Run** → allow permissions (Sheets + send email). This creates the Sessions, Attendance, Register and Feedback tabs.
4. **Deploy → New deployment → Web app** · Execute as **Me** · Access **Anyone** → copy the URL.
5. Paste the URL into `config.js`. Add `assets/gctu-logo.png`.
6. Upload everything to the GitHub repo → **Settings → Pages → main / root**.

## Updating the back end later
Deploy → Manage deployments → ✏️ → Version: **New version** → Deploy (URL stays the same). Never upload over `config.js`.
