FINAL FIXES

1. ADMIN SECURITY
- Installed PWA now opens student.html directly.
- Typing admin.html manually does NOT grant admin access.
- Admin page stays hidden until Supabase session + profiles.role=admin are verified.
- Non-admin users are redirected to student.html.
- Real data security continues to depend on Supabase RLS/admin RPC checks.

2. MOBILE WIDTH
- Left-right page scrolling is blocked.
- Main cards, grids, inputs and mobile shell are constrained to the phone width.
- Only intentionally wide tables may scroll inside their own table container.

3. CLASS VERIFICATION DELETE
- Admin > Daily Class Setup now shows "Delete Verification" when a target has saved verification questions.
- Clicking it securely deletes all verification questions for that target.
- After deletion, that target will no longer demand class verification.

SETUP
A. Upload/replace all extracted files in GitHub and Commit.
B. In Supabase SQL Editor run RUN_THIS_SECURITY_MOBILE_VERIFICATION_DELETE_FIX.sql once.
C. No Cloudflare Worker change is needed for these three fixes.
D. Ctrl+F5. For installed PWA, close/reopen it; if the old start page is cached, uninstall and reinstall once.
