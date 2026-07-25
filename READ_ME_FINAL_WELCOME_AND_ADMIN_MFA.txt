FINAL ZIP CHANGES

1. Student system remains unchanged. Password reset continues through email reset link.
2. First-login Premium 3D Welcome screen added. It appears once per device/browser and is available again through the “निर्देश” button.
3. YouTube: https://youtube.com/@gkbypurushotamsir007?si=nOQLN11CTw2V3KrI
4. Telegram: https://t.me/gkbypurushotamsir
5. Hidden Admin URL changed to:
   gk-portal-x9q7m2v4k8r6-auth-3p5n1c7d.html
6. Admin login is locked to: jangra1432@gmail.com
7. Admin requires Email + Password + Google Authenticator TOTP + profiles.role=admin.
8. First successful admin password login will display a QR code. Scan it in Google Authenticator and verify the 6-digit code.
9. Password recovery uses the existing Brevo/Supabase email reset link. MFA remains required after reset.
10. Run RUN_THIS_FINAL_ADMIN_SECURITY_ONCE.sql once in Supabase SQL Editor before final use.

IMPORTANT BACKUP
During first MFA setup, save the manual setup key securely offline and/or enroll a backup authenticator factor later. Supabase recovery codes are not provided.
11. Admin session automatically locks after 20 minutes of inactivity and re-checks AAL2 every minute.
