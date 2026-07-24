ADMIN DIRECT LOGIN FLOW FIX

अब hidden Admin URL खोलने पर Student Login page पर redirect नहीं होगा।

Admin page पर तीन-step security एक ही screen पर चलेगी:
1. Admin Email या Mobile Number
2. Supabase Admin Login Password
3. Extra Cloudflare Admin Panel Password

केवल profiles.role = admin account स्वीकार होगा।
Student account डालने पर access reject होकर session sign-out हो जाएगी।

SETUP:
1. ZIP extract करें।
2. सभी files GitHub repository में replace/upload करें।
3. Commit changes करें।
4. Deployment के बाद Ctrl+F5 दबाएँ।
5. Installed PWA cache पुरानी हो तो browser/app बंद करके दोबारा खोलें।

Supabase SQL और Cloudflare Worker में इस fix के लिए कोई नया बदलाव नहीं करना है।
