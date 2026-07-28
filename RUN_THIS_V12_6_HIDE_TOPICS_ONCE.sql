-- GK BY PURUSHOTAM SIR — V12.6 Topic Publish Control
-- इसे gk-mock-test-production Turso database में केवल एक बार चलाएँ।
-- Questions delete नहीं होंगे। सभी Topics Draft/Hidden हो जाएंगे।
-- इसके बाद Admin Panel में Topic के सामने Show to Students टिक करके Save करने पर ही Student Panel में दिखेगा।

UPDATE cbt_topics SET active = 0;

SELECT COUNT(*) AS uploaded_questions_safe FROM cbt_questions;
SELECT COUNT(*) AS hidden_topics FROM cbt_topics WHERE active = 0;
