FIXES IN THIS BUILD

1. ADMIN PDF DELETE
- Every PDF in Admin > PDFs now has a visible red "Delete PDF" button.
- "Delete All PDFs" button is visible at the top of PDF List.
- R2 PDFs are deleted from Cloudflare R2.
- Old legacy PDFs are deleted from Supabase Storage.

2. PDF VERIFICATION BUTTON
- "Verification यहाँ से करें" now opens the exact verification questions for that PDF's Schedule Day.
- It no longer depends only on today's Home verification panel.
- Student can answer directly in a premium popup.
- Wrong answer => retry allowed.
- Correct completion => "Read PDF Now" button appears.

3. NO VERIFICATION QUESTION = DIRECT READ
- If Admin has not configured any active verification question for that PDF day, the PDF opens directly.
- This requires the included SQL patch.

IMPORTANT SETUP
A. Upload/replace all extracted ZIP files in GitHub and Commit.
B. In Supabase SQL Editor run ONLY:
   RUN_THIS_PDF_VERIFICATION_FIX.sql
   once.
C. No Cloudflare Worker code change is required for this fix.
D. After deployment use Ctrl+F5 / reopen installed PWA.
