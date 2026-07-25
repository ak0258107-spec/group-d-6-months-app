GK BY PURUSHOTAM SIR – NEW AUTHENTICATOR + WELCOME BUILD

NEW HIDDEN ADMIN PAGE
vault-gk-6m-q7v9x2p4-k8r3.html

WHAT IS ADDED
1. Student login/registration और मौजूदा features सुरक्षित रखे गए हैं।
2. First-open full-screen Welcome page जोड़ा गया है।
3. Welcome page पर Telegram, YouTube और आगे बढ़ें बटन हैं।
4. Admin login: Email + Password + profile role=admin + Authenticator TOTP.
5. पहली Admin login पर QR code आएगा; Google/Microsoft Authenticator से scan करें।
6. बाद की login पर केवल Authenticator का बदलता 6-digit code माँगा जाएगा।
7. Admin idle session 20 मिनट बाद local sign-out होगा।
8. Cloudflare Worker admin routes अब JWT aal2 भी check करते हैं।
9. पुराना hidden admin filename बदल दिया गया है।

DEPLOYMENT
A. ZIP की सभी files GitHub repository root में replace/upload करें।
B. Supabase SQL Editor में RUN_THIS_ADMIN_AUTHENTICATOR_SECURITY_ONCE.sql एक बार Run करें।
C. Updated CLOUDFLARE_WORKER_FINAL.js को अपने existing Worker में paste करके Deploy करें।
D. Browser में पुरानी PWA/cache हटाने के लिए page एक बार hard refresh करें। नया service worker पुराना cache delete करेगा।

WELCOME LINKS
config.js में ये values हैं:
TELEGRAM_URL: https://t.me/gkbypurushotamsir
YOUTUBE_URL: https://www.youtube.com/@gkbypurushotamsir
यदि वास्तविक YouTube handle अलग है तो केवल YOUTUBE_URL बदलें।

IMPORTANT MFA RECOVERY
Authenticator setup का QR/secret सुरक्षित रखें। फोन बदलने से पहले Authenticator account transfer/backup करें।
