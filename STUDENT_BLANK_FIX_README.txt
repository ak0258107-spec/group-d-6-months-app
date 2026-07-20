FIXED:
Student Panel blank screen was caused by the Premium Home renderer calling statusModel() while that function was missing.
This build adds the missing statusModel() and bumps the service-worker cache.

UPLOAD:
Replace all files on GitHub with this ZIP contents, Commit, wait for deployment, then Ctrl+F5.
No new Supabase SQL is required for this fix.
