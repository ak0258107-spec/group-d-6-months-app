# GROUP D 90 DAYS TARGET BATCH — FINAL AUDITED PACKAGE

## Included
- Student registration/login
- Student dashboard
- 90-day schedule and daily targets
- Target completion tracking
- Class/PDF verification questions
- Study PDF access via private Supabase Storage signed links
- Progress and fixed feedback messages
- Admin dashboard
- Students/progress overview
- 90-day schedule view
- Mixed-test creation
- All 10 question types in one test
- PDF upload
- Verification question creation
- Fixed admin messages
- Mock-test timer
- Previous / Skip / Next / Submit buttons
- Status palette colors
- Result summary
- Question-wise analysis
- Topic-wise performance
- PWA manifest + service worker
- No page-level horizontal scrolling

## Before first use
1. Upload all extracted files to GitHub repository root.
2. Deploy on Cloudflare Pages.
3. Register your own account from the app.
4. In Supabase SQL Editor, promote your own user to admin:
   update public.profiles set role='admin' where id='YOUR-AUTH-USER-UUID';
5. Never put a secret/service_role key in frontend files.

## Note
This package uses the already-created Supabase schema and the 90-day data already inserted in schedule_days/daily_targets.


## Mobile Number + Password Login
The user-facing login now uses Name + Mobile Number + Password.
Internally the app maps the mobile number to a hidden Auth identifier, so students never need an email address.

Required Supabase setting:
Authentication -> Providers / Sign In -> Email -> Confirm email = OFF
This prevents fake/internal auth identifiers from requiring email confirmation.

Phone is stored in profiles.phone through signup metadata.


PREMIUM FINAL: Run RUN_ONCE_PREMIUM_VERIFICATION_PATCH.sql once before using this version. Manual Mark Complete is removed; correct verification answer is required.
