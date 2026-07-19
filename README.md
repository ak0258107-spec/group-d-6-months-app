# GROUP D 6 MONTHS TARGET BATCH — FINAL AUDITED PACKAGE

## Included
- Student registration/login
- Student dashboard
- 6-month schedule and daily targets
- Target completion tracking
- Class/PDF verification questions
- Study PDF access via private Supabase Storage signed links
- Progress and fixed feedback messages
- Admin dashboard
- Students/progress overview
- 6-month schedule view
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
This package uses the already-created Supabase schema and the 6-month data already inserted in schedule_days/daily_targets.


## Mobile Number + Password Login
The user-facing login now uses Name + Mobile Number + Password.
Internally the app maps the mobile number to a hidden Auth identifier, so students never need an email address.

Required Supabase setting:
Authentication -> Providers / Sign In -> Email -> Confirm email = OFF
This prevents fake/internal auth identifiers from requiring email confirmation.

Phone is stored in profiles.phone through signup metadata.


PREMIUM FINAL: Run RUN_ONCE_PREMIUM_VERIFICATION_PATCH.sql once before using this version. Manual Mark Complete is removed; correct verification answer is required.


# ULTIMATE FINAL UPDATE
- Test admin: paste normal raw questions and click one Publish button.
- Supports mixed 10 question styles by automatic type detection.
- Separate One-Liner paste/publish system.
- Student test UI: Start Test -> Previous / Next / Submit only.
- Options white with black border; selected option dark green.
- PDF is uploaded by admin to Supabase Storage and students can only open/read it.
- Run RUN_ONCE_ULTIMATE_FINAL_PATCH.sql once in Supabase SQL Editor.


# CURRENT FINAL PROJECT STATE
- Batch: GK BY PURUSHOTAM SIR - GROUP D 6 MONTHS TARGET BATCH
- Start date: 03 August 2026
- First 5 months: 125 teaching days for syllabus completion
- Daily structure: 3 targets/classes per teaching day
- Haryana GK: daily
- Month 6: Revision + PYQ + Weak Topic Repair + Sectional Tests + Full Mock Tests
- Database schedule expected: 125 schedule_days and 375 daily_targets
- Manual Mark Complete disabled; verification-based completion retained
- Premium colorful Student/Admin panels retained
- Simple mock-test flow: Start Test -> Previous / Next / Submit -> Result + Analysis
- Selected option dark green; unselected options white with dark border
- PDF read-only for students; One-Liner section retained
