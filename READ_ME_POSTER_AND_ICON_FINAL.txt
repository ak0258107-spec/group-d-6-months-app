GK BY PURUSHOTAM SIR — POSTER + APP ICON FINAL

APP ICON
- Approved logo applied to icon-192.png, icon-512.png, apple-touch-icon.png and favicon.png.
- Installed PWA name: GK BY PURUSHOTAM SIR.

POSTER SYSTEM
Admin > Posters:
- Upload poster
- Title
- Optional click link
- Optional start/end date
- Active/Inactive
- Sort order
- Delete

Student Home:
- Active posters appear in an automatic slider.
- Poster click opens the optional link.
- No poster means the section stays hidden.
- Poster files are stored privately in Cloudflare R2.

BEST POSTER SIZE
Recommended: 1080 × 540 px (2:1)
Also accepted: 1200 × 600 or 1600 × 800
Minimum suggested: 800 × 400
Format: JPG / PNG / WEBP
Recommended file size: under 2 MB
Maximum accepted by app: 5 MB

SETUP
1. Extract this ZIP and upload/replace all files in GitHub. Commit changes.
2. In Supabase SQL Editor, run RUN_THIS_POSTER_SYSTEM_ONCE.sql once.
3. In Cloudflare Worker group-d-pdf-api, replace code with CLOUDFLARE_WORKER_FINAL.js and Deploy.
4. Ctrl+F5 after GitHub deployment.
5. If Android still shows the old app icon, uninstall the old PWA and install it again.

Existing PDF, verification, test, one-liner, delete and target systems are preserved.
