GK BY PURUSHOTAM SIR — CLOUDFLARE R2 CONNECTED FINAL

APP CHANGES
- New PDF uploads go directly to Cloudflare R2 through your secure Worker.
- Supabase stores only the PDF record and R2 object key.
- Existing old Supabase PDFs remain readable/downloadable through legacy fallback.
- Read PDF uses Worker + Supabase can_read_material permission.
- Download uses Worker + Supabase can_download_material permission.
- Admin delete removes DB record and cleans the correct storage (R2 or legacy Supabase).

WORKER URL
https://group-d-pdf-api.ak0258107.workers.dev

REQUIRED CLOUDFLARE WORKER SETTINGS
R2 Binding:
  Variable: PDF_BUCKET
  Bucket: group-d-6-months-pdfs

Variables / Secrets required:
  SUPABASE_URL = https://gjxhjvdspedjsmdxlfgz.supabase.co
  SUPABASE_ANON_KEY = your current Supabase publishable/anon key

IMPORTANT
- SUPABASE_URL can be Text.
- SUPABASE_ANON_KEY can be Secret.
- Do NOT put service_role key in the Worker or GitHub.
- ADMIN_SECRET is not used by this final Worker code.

WORKER CODE
CLOUDFLARE_WORKER_FINAL.js is included. It must match the Worker code deployed in Cloudflare.

SUPABASE SQL
No new database schema is required specifically for R2.
If your latest RUN_THIS_ONE_TIME_ONLY.sql with delete controls was already run successfully, do not run SQL again for R2.

GITHUB
Upload all extracted files from this ZIP and Commit.
Then Ctrl+F5 after deployment.
