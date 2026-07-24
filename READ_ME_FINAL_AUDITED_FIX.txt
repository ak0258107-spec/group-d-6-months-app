GK BY PURUSHOTAM SIR — FINAL AUDITED ADMIN LOGIN FIX

इस ZIP में:
- Hidden Admin URL बना रहेगा:
  owner-control-gk-7x29.html
- Admin Login अब Mobile Number स्वीकार नहीं करेगा।
- केवल Supabase Authentication में registered पूरा Admin Email स्वीकार होगा।
- Login के बाद profiles.role = admin check होगा।
- उसके बाद Extra Cloudflare ADMIN_PANEL_PASSWORD पूछा जाएगा।
- Verification Questions Admin Panel में दिखेंगे।
- Single Question, Target के सभी Questions और All Verification delete controls रहेंगे।
- Poster delete, Broadcast delete और red Logout वाला system सुरक्षित रहेगा।

ADMIN LOGIN का सही क्रम:
1. Hidden Admin URL खोलें।
2. Supabase में registered Admin Email डालें।
3. उसी Admin account का Supabase Login Password डालें।
4. Continue दबाएँ।
5. फिर Cloudflare वाला Extra Admin Panel Password डालें।
6. Admin Panel खुलेगा।

SUPABASE में केवल यह नई SQL file एक बार Run करें:
RUN_ONLY_THIS_FINAL_FIX_ONCE.sql

पुरानी SQL files दोबारा Run नहीं करनी हैं।

CLOUDFLARE:
- यदि नया CLOUDFLARE_WORKER_FINAL.js पहले ही Deploy कर चुके हैं और
  ADMIN_PANEL_PASSWORD secret मौजूद है, तो Worker दोबारा बदलने की जरूरत नहीं।
- /admin/panel-login route और ADMIN_PANEL_PASSWORD इस ZIP में मौजूद हैं।

GITHUB:
1. ZIP Extract करें।
2. सभी files repository root में replace/upload करें।
3. Commit करें।
4. 2–3 मिनट बाद Ctrl+F5 करें।
5. Installed PWA पुरानी cache दिखाए तो app/browser बंद करके दोबारा खोलें।

ADMIN CHECK:
Supabase -> Authentication -> Users:
- आपका Admin Email मौजूद होना चाहिए।

Supabase -> Table Editor -> profiles:
- उसी user id की row में role = admin होना चाहिए।
