ADMIN DELETE CONTROLS ADDED

Admin can now:
- Delete one One-Liner.
- Delete all One-Liners of one Topic.
- Delete all One-Liners.
- Delete one Question from a Test.
- Delete a complete Test with all its Questions.
- Delete all Tests.
- Delete one PDF.
- Delete all PDFs.

IMPORTANT:
This build adds new Supabase RPC functions.
You MUST run the updated RUN_THIS_ONE_TIME_ONLY.sql once in Supabase SQL Editor after uploading this ZIP.
The SQL is idempotent and safe to run again because functions are CREATE OR REPLACE.
