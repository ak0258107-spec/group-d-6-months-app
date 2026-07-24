GK BY PURUSHOTAM SIR — TOTAL COMPLETE FINAL

INCLUDED SYSTEMS
- Student Panel + Admin Panel
- Installed PWA always opens Student Panel
- Private Admin URL: owner-control-gk-7x29.html
- Old admin.html redirects to Student Panel
- Supabase role=admin verification
- Separate Cloudflare Admin Panel Password
- Mobile width / no page-level left-right scrolling
- Daily targets, classes, verification, PDFs, tests, one-liners, posters
- PDF and verification delete controls
- Cloudflare R2 secure PDF/poster storage
- App icon and poster slider
- NEW: Daily Target Edit
  Admin > Daily Class Setup में Subject, Topic और Order edit करें।
  Save Target Changes दबाने पर students को updated target दिखेगा।

FINAL INSTALL STEPS

1. GITHUB
- Extract this ZIP into a new separate folder.
- Open the GitHub repository group-d-6-months-app.
- Add file > Upload files.
- Upload ALL extracted files, not the ZIP itself.
- Existing files must be replaced.
- Commit message: Total Complete Target Edit Final
- Commit changes.
- Wait 2-5 minutes and use Ctrl+F5.

2. SUPABASE
The earlier SQL patches remain installed; do not remove them.
Run only this new file once:
RUN_THIS_DAILY_TARGET_EDIT_ONCE.sql

If RUN_THIS_SECURITY_MOBILE_VERIFICATION_DELETE_FIX.sql was not run earlier, run it once too.
If RUN_THIS_POSTER_SYSTEM_ONCE.sql was already run, do not run it again.

3. CLOUDFLARE WORKER
- Open group-d-pdf-api.
- Settings > Variables and Secrets.
- Confirm these still exist:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  ADMIN_SECRET
  ADMIN_PANEL_PASSWORD (Secret)
  PDF_BUCKET binding
- Open Edit code.
- Replace the full code with CLOUDFLARE_WORKER_FINAL.js from this ZIP.
- Deploy.

4. ADMIN PANEL
Private URL:
https://ak0258107-spec.github.io/group-d-6-months-app/owner-control-gk-7x29.html

5. STUDENT APP
Installed app opens student.html.
If old cache/icon/page remains, uninstall the old PWA and reinstall once.

DAILY TARGET EDIT USE
Admin > Daily Class Setup > choose Day.
Open a target.
Edit Subject, Topic/Target or Order.
Click Save Target Changes.
The target ID stays the same, so connected verification/progress references are preserved.
