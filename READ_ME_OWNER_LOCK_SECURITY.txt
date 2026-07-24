OWNER LOCK ADMIN SECURITY

NEW ADMIN PAGE:
owner-control-gk-7x29.html

Security layers:
1. Installed app always opens Student Panel.
2. Old admin.html redirects to Student Panel.
3. New admin page checks valid Supabase login.
4. profiles.role must be admin.
5. A separate Admin Panel Password is verified by Cloudflare Worker.

Cloudflare setup:
- Worker -> Settings -> Variables and Secrets -> Add
- Type: Secret
- Name: ADMIN_PANEL_PASSWORD
- Value: choose a strong private password
- Deploy
- Then replace Worker code with CLOUDFLARE_WORKER_FINAL.js from this ZIP and Deploy.

No new Supabase SQL is required for this admin-link/password change.
