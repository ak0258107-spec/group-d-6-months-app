GK BY PURUSHOTAM SIR — FINAL V16.2 LOGO ONLY UPDATE

यह V16.1 का वही app है। किसी feature, layout, CBT logic, Classes, Poster, Profile, Admin/Student UI या database logic में बदलाव नहीं किया गया है।

केवल नया user-supplied logo उन assets में replace किया गया है जहाँ पुराना logo पहले से उपयोग हो रहा था:
- CBT logo
- PWA / App icons
- Favicon
- Apple touch icon
- Existing CBT social/preview banner के पुराने-logo स्थान पर

पुराना logo cache में न अटके, इसलिए Service Worker cache key को केवल refresh के लिए bump किया गया है।

DEPLOY:
1. 02_GITHUB_ROOT_UPLOAD_FINAL_V16_2_LOGO.zip extract करें।
2. उसके अंदर की FILES को GitHub repository के main/(root) में upload/replace करें।
3. Folder को folder के रूप में upload न करें।
4. GitHub Pages deploy होने दें।
5. App/browser में Ctrl+Shift+R या hard refresh करें।

SUPABASE SQL: कोई नई SQL नहीं चलानी है।
CLOUDFLARE: कोई बदलाव नहीं।
