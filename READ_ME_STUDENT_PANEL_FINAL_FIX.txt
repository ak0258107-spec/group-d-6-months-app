STUDENT PANEL FINAL FIX

Root cause:
Premium Home renderer statusModel() को call कर रहा था, लेकिन बाद की merged ZIP में function फिर गायब हो गया था। इसी कारण Student Panel blank दिख रहा था।

Fixed:
- statusModel() restored
- cache busting added
- service worker cache bumped
- logo/PWA/delete controls retained

No new SQL is required for this blank-screen fix.
GitHub में files replace करें, Commit करें, 1-3 मिनट wait करें, फिर Ctrl+F5 करें.
