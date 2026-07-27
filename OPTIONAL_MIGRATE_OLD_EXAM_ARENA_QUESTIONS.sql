-- केवल तभी चलाएँ जब पुराने Exam Arena की questions table का Haryana GK data बचाना हो।
-- पहले RUN_THIS_TURSO_CBT_SETUP.sql चलना जरूरी है।

INSERT OR IGNORE INTO cbt_subjects(subject_key,subject_name,display_order,active)
SELECT subject_key, MAX(subject_name), 1, 1 FROM questions GROUP BY subject_key;

INSERT OR IGNORE INTO cbt_topics(subject_key,topic_key,topic_name,display_order,active)
SELECT subject_key, topic_key, MAX(topic_name), 0, 1 FROM questions GROUP BY subject_key,topic_key;

INSERT OR IGNORE INTO cbt_questions(
 subject_key,subject_name,topic_key,topic_name,difficulty,question_type,question_text,
 option_a,option_b,option_c,option_d,answer_index,answer_text,explanation,fingerprint,active
)
SELECT
 subject_key,subject_name,topic_key,topic_name,
 CASE WHEN difficulty IN ('easy','normal','tough') THEN difficulty ELSE 'normal' END,
 'mcq',question,COALESCE(option_a,''),COALESCE(option_b,''),COALESCE(option_c,''),COALESCE(option_d,''),
 COALESCE(answer_index,-1),'',COALESCE(explanation,''),
 'legacy-' || id,COALESCE(active,1)
FROM questions;
