-- GK BY PURUSHOTAM SIR — TURSO V12.13 QUESTION VISIBILITY MIGRATION
-- Existing gk-mock-test-production database में केवल एक बार चलाएँ।
-- इससे Questions delete नहीं होंगे। Existing live Topics के Questions visible रहेंगे;
-- नए uploaded Questions Draft/Hidden रहेंगे, जब तक Admin Show to Students Save न करे।

ALTER TABLE cbt_questions
ADD COLUMN student_visible INTEGER NOT NULL DEFAULT 0;

UPDATE cbt_questions
SET student_visible = CASE
  WHEN active=1 AND EXISTS(
    SELECT 1
    FROM cbt_topics t
    WHERE t.subject_key=cbt_questions.subject_key
      AND t.topic_key=cbt_questions.topic_key
      AND t.active=1
  ) THEN 1
  ELSE 0
END;

CREATE INDEX IF NOT EXISTS idx_cbt_questions_student_visible
ON cbt_questions(subject_key,topic_key,active,student_visible,question_type);
