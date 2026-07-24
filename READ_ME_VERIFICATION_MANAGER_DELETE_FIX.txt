VERIFICATION MANAGER DELETE FIX

Admin Panel > Daily Class Setup में नीचे नया "सभी Verification Questions" section मिलेगा।

इसमें:
- Student Panel में दिख रहे पुराने/legacy questions भी दिखेंगे।
- Hidden question के options भी Admin को दिखेंगे।
- केवल एक question delete कर सकते हैं।
- एक target के सभी verification questions delete कर सकते हैं।
- सभी verification questions एक साथ delete कर सकते हैं।

SETUP:
1. ZIP extract करके सभी files GitHub में replace/upload करें।
2. Supabase SQL Editor में RUN_THIS_VERIFICATION_MANAGER_DELETE_FIX_ONCE.sql एक बार Run करें।
3. Commit के बाद Ctrl+F5 दबाएँ।
4. Cloudflare Worker में कोई बदलाव नहीं है।
