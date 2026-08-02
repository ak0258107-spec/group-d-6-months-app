V12.16 POSTER SIZE / FULL IMAGE FIX — केवल ये काम करें

समस्या:
पुराना poster box 2:1 और object-fit: cover था। इसलिए 16:9, A4 या portrait poster ऊपर/नीचे अथवा किनारों से कटता था।

नया सिस्टम:
1. Admin Poster panel में Poster Format चुनें:
   - 16:9 Landscape
   - A4 Portrait
   - A4 Landscape
   - Square 1:1
   - Original / Auto Size
2. Image Display में “Full Image — बिना कटे” default है।
3. पुराने uploaded poster के सामने भी Format/Display बदलकर “Save Size” कर सकते हैं। दोबारा upload जरूरी नहीं।
4. Student Home पर चुने हुए ratio में पूरा poster दिखेगा।
5. Poster दबाने पर Full Screen खुलेगा; optional link अलग button से खुलेगा।

DEPLOYMENT:
A. Supabase SQL Editor में updated RUN_THIS_POSTER_SYSTEM_ONCE.sql पूरा Run करें।
   Success: V12.16 POSTER FORMAT SETUP SUCCESS
B. फिर इस ZIP की सभी 99 files GitHub repository root में Upload/Replace करके Commit करें।
C. App को hard refresh करें या installed PWA पूरी तरह बंद करके दोबारा खोलें।

Cloudflare Worker, R2, Turso, Push Worker या Supabase Auth में कोई बदलाव नहीं करना है।
