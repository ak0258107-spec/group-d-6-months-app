GK BY PURUSHOTAM SIR — FINAL EMAIL OTP SECURITY SETUP

केवल Authentication बदला गया है। Student/Admin Panel के बाकी features नहीं बदले गए।

FINAL FLOW
1. Student Registration: Email + Password; Registration पर OTP नहीं।
2. Student Login: Email + Password; Login पर OTP नहीं।
3. Student Forgot Password: Email -> 6-digit OTP -> New Password.
4. Admin Login: Hidden URL -> Admin Email + Password -> Admin Email OTP -> Panel.
5. Admin Forgot Password: Admin Email -> Recovery OTP -> New Admin Password.

A. BREVO CUSTOM SMTP
1. Brevo account बनाकर sender Email verify करें।
2. Brevo -> SMTP & API -> SMTP credentials खोलें।
3. Supabase -> Project Settings -> Authentication -> SMTP Settings.
4. Enable Custom SMTP.
5. Host: smtp-relay.brevo.com
6. Port: 587
7. Username: Brevo SMTP login
8. Password: Brevo SMTP key
9. Sender Email: वही verified sender
10. Sender Name: GK BY PURUSHOTAM SIR
11. Save करें।

B. SUPABASE AUTH SETTINGS
Supabase -> Authentication -> Providers -> Email:
- Enable Email provider: ON
- Confirm Email: OFF (जरूरी; Registration पर OTP/email नहीं जाएगा)
- Secure email change: ON रहने दें

Supabase -> Authentication -> Rate Limits:
- Email sending rate को जरूरत अनुसार रखें; Brevo Free final limit 300/day है।

C. EMAIL TEMPLATES
Supabase -> Authentication -> Email Templates

1) Magic Link template (Admin Security OTP के लिए)
Subject: Admin Security OTP | GK BY PURUSHOTAM SIR
Body:
<h2>Admin Security Verification</h2>
<p>आपका 6 अंकों का Admin Security OTP:</p>
<h1>{{ .Token }}</h1>
<p>OTP किसी के साथ साझा न करें।</p>

2) Reset Password / Recovery template (Student और Admin Forgot Password के लिए)
Subject: Password Reset OTP | GK BY PURUSHOTAM SIR
Body:
<h2>Password Reset</h2>
<p>आपका 6 अंकों का Password Reset OTP:</p>
<h1>{{ .Token }}</h1>
<p>OTP किसी के साथ साझा न करें।</p>

महत्वपूर्ण: Template में {{ .ConfirmationURL }} की जगह {{ .Token }} होना चाहिए।

D. ADMIN DATABASE CHECK
Supabase -> Authentication -> Users में Admin Email मौजूद हो।
Supabase -> Table Editor -> profiles में उसी user id की role value: admin

E. DEPLOY
1. इस ZIP की सभी files GitHub repository root में replace करें।
2. Commit करें।
3. 2-3 मिनट बाद Ctrl+F5 करें।
4. Installed PWA पुरानी cache दिखाए तो browser/app बंद करके दोबारा खोलें।

F. SQL / CLOUDFLARE
- इस Email OTP बदलाव के लिए कोई नई SQL query आवश्यक नहीं।
- Cloudflare Worker/ADMIN_PANEL_PASSWORD अब Admin gate में इस्तेमाल नहीं होता। Existing Worker को बाकी PDF/R2 features के लिए रहने दें।
- पुरानी SQL files दोबारा Run न करें।

FINAL TEST
1. नया Student register करें: कोई email नहीं आनी चाहिए; direct login/session होना चाहिए।
2. Student Forgot Password: OTP email आए; OTP verify; नया password; login।
3. Admin hidden URL: Email+Password; Admin email OTP; OTP verify; panel open।
4. Admin Forgot Password: recovery OTP; नया password; फिर login+security OTP।
