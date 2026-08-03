/* GK BY PURUSHOTAM SIR — Separate CBT Mock Test API (V12.18)
   Required Worker secrets/variables:
   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
   Optional: APP_ORIGIN (example https://ak0258107-spec.github.io)
*/

const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };
let schemaReadyPromise = null;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const url = new URL(request.url);
      await ensureQuestionVisibilitySchema(env);
      if (!url.pathname.startsWith("/api")) return json({ success: true, service: "GK CBT Mock Test API V12.18" }, 200, cors);

      const user = await verifyUser(request, env);
      const route = url.pathname.replace(/^\/api/, "") || "/";

      if (request.method === "GET" && route === "/catalog") return handleCatalog(env, cors);
      if (request.method === "GET" && route === "/questions/counts") return handleCounts(url, env, cors);
      if (request.method === "GET" && route === "/questions") return handleQuestions(url, env, cors);
      if (request.method === "POST" && route === "/register") return handleRegister(user, env, cors);
      if (request.method === "POST" && route === "/submit-result") return handleSubmitResult(request, user, env, cors);
      if (request.method === "POST" && route === "/share-click") return json({ success: true, is_unlocked: true, share_count: 5 }, 200, cors);
      if (request.method === "GET" && route === "/topper-list") return handleTopperList(url, env, cors);

      if (route.startsWith("/admin/")) {
        await verifyAdmin(request, user, env);
        if (request.method === "GET" && route === "/admin/summary") return handleAdminSummary(url, env, cors);
        if (request.method === "POST" && route === "/admin/sync-topics") return handleSyncTopics(request, env, cors);
        if (request.method === "POST" && route === "/admin/upload-questions") return handleUploadQuestions(request, env, cors);
        if (request.method === "POST" && route === "/admin/topic-visibility") return handleTopicVisibility(request, env, cors);
        if (request.method === "POST" && route === "/admin/question-visibility") return handleQuestionVisibility(request, env, cors);
        if (request.method === "POST" && route === "/admin/topic-question-visibility") return handleTopicQuestionVisibility(request, env, cors);
        if (request.method === "GET" && route === "/admin/questions") return handleAdminQuestions(url, env, cors);
        if (request.method === "POST" && route === "/admin/delete-questions") return handleDeleteQuestions(request, env, cors);
        if (request.method === "POST" && route === "/admin/delete-empty-option-questions") return handleDeleteEmpty(request, env, cors);
        if (request.method === "POST" && route === "/admin/delete-topic-questions") return handleDeleteTopics(request, env, cors);
        if (request.method === "POST" && route === "/admin/delete-all") return handleDeleteAll(env, cors);
      }

      return json({ success: false, error: "Endpoint not found" }, 404, cors);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      return json({ success: false, error: error && error.message ? error.message : "Server error" }, status, corsHeaders(request.headers.get("Origin") || "", env));
    }
  }
};

function corsHeaders(origin, env) {
  const allowed = String(env.APP_ORIGIN || "https://ak0258107-spec.github.io").replace(/\/+$/, "");
  const ok = !origin || origin === allowed || origin.startsWith(allowed + "/") || origin.includes("localhost") || origin.includes("127.0.0.1");
  return {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": ok && origin ? origin : allowed,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function httpError(message, status = 400) {
  const err = new Error(message); err.status = status; return err;
}

async function verifyUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw httpError("Login required", 401);
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, "")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY }
  });
  if (!response.ok) throw httpError("Invalid or expired login session", 401);
  const user = await response.json();
  if (!user || !user.id) throw httpError("Invalid user", 401);
  return user;
}

async function verifyAdmin(request, user, env) {
  const auth = request.headers.get("Authorization") || "";
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" }
  });
  if (!response.ok) throw httpError("Admin profile verification failed", 403);
  const rows = await response.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || String(profile.role || "").toLowerCase() !== "admin" || profile.is_active === false) throw httpError("Admin access required", 403);
}

function tursoHttpUrl(env) {
  const raw = String(env.TURSO_DATABASE_URL || "").trim();
  if (!raw) throw httpError("TURSO_DATABASE_URL missing", 500);
  return raw.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "") + "/v2/pipeline";
}

function arg(value) {
  if (value === null || value === undefined) return { type: "null" };
  if (typeof value === "number" && Number.isInteger(value)) return { type: "integer", value: String(value) };
  if (typeof value === "number") return { type: "float", value: value };
  return { type: "text", value: String(value) };
}

async function pipeline(env, statements) {
  const requests = statements.map((statement) => ({ type: "execute", stmt: { sql: statement.sql, args: (statement.args || []).map(arg) } }));
  requests.push({ type: "close" });
  const response = await fetch(tursoHttpUrl(env), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(data.error || `Turso HTTP ${response.status}`, 502);
  const output = [];
  for (let i = 0; i < statements.length; i++) {
    const item = data.results && data.results[i];
    if (!item || item.type !== "ok") throw httpError((item && item.error && item.error.message) || "Turso query failed", 502);
    output.push(parseResult(item.response && item.response.result));
  }
  return output;
}

function parseResult(result = {}) {
  const cols = (result.cols || []).map((col) => col.name);
  const rows = (result.rows || []).map((row) => Object.fromEntries(row.map((cell, index) => [cols[index], decodeCell(cell)])));
  return { rows, affected: Number(result.affected_row_count || 0), lastInsertId: result.last_insert_rowid ? decodeCell(result.last_insert_rowid) : null };
}

function decodeCell(cell) {
  if (!cell || cell.type === "null") return null;
  if (cell.type === "integer") return Number(cell.value);
  if (cell.type === "float") return Number(cell.value);
  return cell.value ?? cell.base64 ?? null;
}

async function query(env, sql, args = []) { return (await pipeline(env, [{ sql, args }]))[0]; }


async function ensureQuestionVisibilitySchema(env) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      let info = await query(env, "PRAGMA table_info(cbt_questions)");
      let hasColumn = info.rows.some((row) => String(row.name || "") === "student_visible");

      if (!hasColumn) {
        try {
          await query(env, "ALTER TABLE cbt_questions ADD COLUMN student_visible INTEGER NOT NULL DEFAULT 0");
        } catch (error) {
          // Another Worker isolate may have added the column at the same moment.
          info = await query(env, "PRAGMA table_info(cbt_questions)");
          hasColumn = info.rows.some((row) => String(row.name || "") === "student_visible");
          if (!hasColumn) throw error;
        }

        await query(env, `UPDATE cbt_questions
          SET student_visible = CASE
            WHEN active=1 AND EXISTS(
              SELECT 1 FROM cbt_topics t
              WHERE t.subject_key=cbt_questions.subject_key
                AND t.topic_key=cbt_questions.topic_key
                AND t.active=1
            ) THEN 1 ELSE 0 END`);
      }

      await query(env, `CREATE INDEX IF NOT EXISTS idx_cbt_questions_student_visible
        ON cbt_questions(subject_key,topic_key,active,student_visible,question_type)`);
      return true;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function handleCatalog(env, cors) {
  const [subjects, topics] = await pipeline(env, [
    { sql: `SELECT s.subject_key, s.subject_name, s.display_order
      FROM cbt_subjects s
      WHERE s.active=1 AND EXISTS (
        SELECT 1
        FROM cbt_topics t
        JOIN cbt_questions q ON q.subject_key=t.subject_key AND q.topic_key=t.topic_key
        WHERE t.subject_key=s.subject_key AND t.active=1 AND q.active=1 AND q.student_visible=1 AND q.question_type='mcq'
      )
      ORDER BY s.display_order, s.subject_name` },
    { sql: `SELECT t.subject_key, t.topic_key, t.topic_name, t.display_order,
        COUNT(q.id) total,
        SUM(CASE WHEN q.difficulty='easy' THEN 1 ELSE 0 END) easy,
        SUM(CASE WHEN q.difficulty='normal' THEN 1 ELSE 0 END) normal,
        SUM(CASE WHEN q.difficulty='tough' THEN 1 ELSE 0 END) tough
      FROM cbt_topics t
      JOIN cbt_questions q ON q.subject_key=t.subject_key AND q.topic_key=t.topic_key
      WHERE t.active=1 AND q.active=1 AND q.student_visible=1 AND q.question_type='mcq'
      GROUP BY t.subject_key, t.topic_key, t.topic_name, t.display_order
      HAVING COUNT(q.id) > 0
      ORDER BY t.subject_key, t.display_order, t.topic_name` }
  ]);
  const bySubject = new Map(subjects.rows.map((row) => [row.subject_key, { ...row, topics: [] }]));
  topics.rows.forEach((topic) => {
    const subject = bySubject.get(topic.subject_key);
    if (subject) subject.topics.push({
      ...topic,
      total: Number(topic.total || 0),
      easy: Number(topic.easy || 0),
      normal: Number(topic.normal || 0),
      tough: Number(topic.tough || 0)
    });
  });
  return json({ success: true, subjects: [...bySubject.values()] }, 200, cors);
}

async function handleCounts(url, env, cors) {
  const subjectKey = String(url.searchParams.get("subject_key") || "").trim();
  if (!subjectKey) throw httpError("subject_key required");
  const result = await query(env, `SELECT q.topic_key, q.topic_name, COUNT(*) total,
    SUM(CASE WHEN q.difficulty='easy' THEN 1 ELSE 0 END) easy,
    SUM(CASE WHEN q.difficulty='normal' THEN 1 ELSE 0 END) normal,
    SUM(CASE WHEN q.difficulty='tough' THEN 1 ELSE 0 END) tough
    FROM cbt_questions q
    JOIN cbt_topics t ON t.subject_key=q.subject_key AND t.topic_key=q.topic_key
    WHERE q.active=1 AND q.student_visible=1 AND q.question_type='mcq' AND t.active=1 AND q.subject_key=?
    GROUP BY q.topic_key, q.topic_name`, [subjectKey]);
  const topics = {};
  result.rows.forEach((row) => { topics[row.topic_key] = { topic_name: row.topic_name, total: Number(row.total || 0), easy: Number(row.easy || 0), normal: Number(row.normal || 0), tough: Number(row.tough || 0) }; });
  return json({ success: true, counts: { [subjectKey]: { topics } } }, 200, cors);
}

async function handleQuestions(url, env, cors) {
  const subjectKey = String(url.searchParams.get("subject_key") || "").trim();
  const topicKey = String(url.searchParams.get("topic_key") || "").trim();
  const difficulty = String(url.searchParams.get("difficulty") || "").trim();
  const questionType = String(url.searchParams.get("question_type") || "mcq").trim();
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 10)));
  if (!subjectKey || !topicKey) throw httpError("Subject and Topic required");
  const published = await query(env, "SELECT active FROM cbt_topics WHERE subject_key=? AND topic_key=? LIMIT 1", [subjectKey, topicKey]);
  if (!published.rows.length || Number(published.rows[0].active || 0) !== 1) throw httpError("यह Topic अभी विद्यार्थियों के लिए प्रकाशित नहीं है।", 403);
  let sql = `SELECT id,subject_key,subject_name,topic_key,topic_name,difficulty,question_type,question_text AS question,
    option_a,option_b,option_c,option_d,answer_index,answer_text,explanation,image_key
    FROM cbt_questions WHERE active=1 AND student_visible=1 AND subject_key=? AND topic_key=? AND question_type=?`;
  const args = [subjectKey, topicKey, questionType === "one_liner" ? "one_liner" : "mcq"];
  if (difficulty && difficulty !== "all" && questionType !== "one_liner") { sql += " AND difficulty=?"; args.push(difficulty); }
  sql += " ORDER BY abs(random()) LIMIT ?"; args.push(limit);
  const result = await query(env, sql, args);
  return json({ success: true, questions: result.rows }, 200, cors);
}

async function handleRegister(user, env, cors) {
  const result = await query(env, "SELECT COUNT(*) total FROM cbt_attempts WHERE auth_user_id=?", [user.id]);
  return json({ success: true, student_id: user.id, roll_number: user.id.slice(0, 8).toUpperCase(), test_count: Number(result.rows[0]?.total || 0), share_count: 5, is_unlocked: true }, 200, cors);
}

async function handleSubmitResult(request, user, env, cors) {
  const body = await request.json().catch(() => ({}));
  const selectedUnits = Array.isArray(body.selected_units) ? body.selected_units.slice(0, 5) : [];
  const subjectLabel = String(body.selected_subject || "All Subjects").slice(0, 200);
  const result = await query(env, `INSERT INTO cbt_attempts
    (auth_user_id,student_name,subject_label,topic_label,difficulty,total_questions,correct_count,wrong_count,skipped_count,score,total_marks,percentage,negative_marking,time_taken_seconds,selected_units_json,subject_result_json,topic_result_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      user.id, String(body.student_name || user.email || "Student").slice(0, 150), subjectLabel,
      String(body.topic_name || "Multiple Topics").slice(0, 300), String(body.difficulty || "all").slice(0, 20),
      Number(body.total_questions || 0), Number(body.correct_answers || 0), Number(body.wrong_answers || 0), Number(body.skipped_questions || 0),
      Number(body.score || 0), Number(body.total_marks || 0), Number(body.percentage || 0), Number(body.negative_marking || 0), Number(body.time_taken_seconds || 0),
      JSON.stringify(selectedUnits), JSON.stringify(body.subject_wise_result || []), JSON.stringify(body.topic_wise_result || [])
    ]);
  return json({ success: true, result: { attempt_id: result.lastInsertId } }, 200, cors);
}

async function handleTopperList(url, env, cors) {
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 30)));
  const result = await query(env, `SELECT student_name,subject_label AS subject_name,topic_label AS topic_name,difficulty,total_questions,score,total_marks,percentage,negative_marking,time_taken_seconds,created_at
    FROM cbt_attempts WHERE percentage>=80 ORDER BY percentage DESC, score DESC, time_taken_seconds ASC LIMIT ?`, [limit]);
  return json({ success: true, toppers: result.rows }, 200, cors);
}

async function handleAdminSummary(url, env, cors) {
  const subjectKey = String(url.searchParams.get("subject_key") || "").trim();
  if (!subjectKey) throw httpError("subject_key required");
  const [total, rows] = await pipeline(env, [
    { sql: "SELECT COUNT(*) total FROM cbt_questions WHERE subject_key=? AND active=1 AND question_type='mcq'", args: [subjectKey] },
    { sql: `SELECT t.topic_key, t.topic_name, t.active AS student_visible,
        COUNT(q.id) count,
        SUM(CASE WHEN q.active=1 AND q.question_type='mcq' THEN 1 ELSE 0 END) active_mcq_count,
        SUM(CASE WHEN q.active=1 AND q.student_visible=1 AND q.question_type='mcq' THEN 1 ELSE 0 END) visible_mcq_count
      FROM cbt_topics t
      LEFT JOIN cbt_questions q ON q.subject_key=t.subject_key AND q.topic_key=t.topic_key
      WHERE t.subject_key=?
      GROUP BY t.topic_key, t.topic_name, t.active, t.display_order
      ORDER BY t.display_order, t.topic_name`, args: [subjectKey] }
  ]);
  return json({ success: true, total_questions: Number(total.rows[0]?.total || 0), by_topic: rows.rows }, 200, cors);
}

async function handleSyncTopics(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjects = Array.isArray(body.subjects) ? body.subjects.slice(0, 25) : [];
  if (!subjects.length) throw httpError("Subjects required");
  const statements = [];
  let topicCount = 0;
  subjects.forEach((subject, si) => {
    const key = safeKey(subject.key); const name = safeText(subject.name, 150);
    if (!key || !name) return;
    statements.push({ sql: `INSERT INTO cbt_subjects(subject_key,subject_name,display_order,active) VALUES(?,?,?,1)
      ON CONFLICT(subject_key) DO UPDATE SET subject_name=excluded.subject_name,display_order=excluded.display_order,active=1`, args: [key, name, Number(subject.order || si + 1)] });
    (Array.isArray(subject.topics) ? subject.topics.slice(0, 500) : []).forEach((topic, ti) => {
      const topicKey = safeKey(topic.key || topic.name); const topicName = safeText(topic.name || topic.key, 200);
      if (!topicKey || !topicName) return;
      topicCount++;
      statements.push({ sql: `INSERT INTO cbt_topics(subject_key,topic_key,topic_name,display_order,active) VALUES(?,?,?,?,0)
        ON CONFLICT(subject_key,topic_key) DO UPDATE SET topic_name=excluded.topic_name,display_order=excluded.display_order`, args: [key, topicKey, topicName, Number(topic.order || ti + 1)] });
    });
  });
  if (!statements.length) throw httpError("Valid Subject/Topic not found");
  await pipeline(env, statements);
  return json({ success: true, subjects_updated: subjects.length, topics_inserted: topicCount, topics_updated: topicCount }, 200, cors);
}

async function handleUploadQuestions(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key); const subjectName = safeText(body.subject_name, 150);
  const topicKey = safeKey(body.topic_key); const topicName = safeText(body.topic_name, 200);
  const difficulty = ["easy", "normal", "tough"].includes(body.difficulty) ? body.difficulty : "normal";
  if (!subjectKey || !subjectName || !topicKey || !topicName) throw httpError("Subject/Topic required");
  if (/data:image|base64,/i.test(String(body.raw_text || ""))) throw httpError("Binary/Base64 image question database में allowed नहीं है। Image R2 में upload करें।");
  const parsed = parseUploadText(String(body.raw_text || ""));
  if (!parsed.length) throw httpError("Valid questions नहीं मिले।");

  await pipeline(env, [
    { sql: `INSERT INTO cbt_subjects(subject_key,subject_name,display_order,active) VALUES(?,?,999,1)
      ON CONFLICT(subject_key) DO UPDATE SET subject_name=excluded.subject_name,active=1`, args: [subjectKey, subjectName] },
    { sql: `INSERT INTO cbt_topics(subject_key,topic_key,topic_name,display_order,active) VALUES(?,?,?,999,0)
      ON CONFLICT(subject_key,topic_key) DO UPDATE SET topic_name=excluded.topic_name,active=0`, args: [subjectKey, topicKey, topicName] }
  ]);

  const statements = [];
  for (const question of parsed.slice(0, 100)) {
    const fingerprint = await sha256([subjectKey, topicKey, question.type, normalize(question.question), normalize(question.options.join("|")), normalize(question.answerText || String(question.answerIndex))].join("||"));
    statements.push({ sql: `INSERT OR IGNORE INTO cbt_questions
      (subject_key,subject_name,topic_key,topic_name,difficulty,question_type,question_text,option_a,option_b,option_c,option_d,answer_index,answer_text,explanation,fingerprint,active,student_visible)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)`, args: [subjectKey, subjectName, topicKey, topicName, difficulty, question.type, question.question, question.options[0] || "", question.options[1] || "", question.options[2] || "", question.options[3] || "", question.answerIndex, question.answerText || "", question.explanation || "", fingerprint] });
  }
  const results = await pipeline(env, statements);
  const inserted = results.reduce((sum, item) => sum + item.affected, 0);
  return json({ success: true, found: parsed.length, inserted, duplicate: parsed.length - inserted, dummy: 0, errors: [], student_visible: false }, 200, cors);
}

async function handleTopicVisibility(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key);
  const subjectName = safeText(body.subject_name, 150);
  const topicKey = safeKey(body.topic_key);
  const topicName = safeText(body.topic_name, 200);
  const visible = body.visible === true || body.visible === 1 || String(body.visible).toLowerCase() === "true";
  if (!subjectKey || !topicKey) throw httpError("Subject/Topic required");

  const count = await query(env, "SELECT COUNT(*) total FROM cbt_questions WHERE subject_key=? AND topic_key=? AND active=1 AND question_type='mcq'", [subjectKey, topicKey]);
  const total = Number(count.rows[0]?.total || 0);
  if (visible && total < 1) throw httpError("इस Topic में Active MCQ नहीं है। पहले Questions upload करें।");

  const results = await pipeline(env, [
    { sql: `INSERT INTO cbt_subjects(subject_key,subject_name,display_order,active) VALUES(?,?,999,1)
      ON CONFLICT(subject_key) DO UPDATE SET subject_name=COALESCE(NULLIF(excluded.subject_name,''),cbt_subjects.subject_name),active=1`, args: [subjectKey, subjectName || subjectKey] },
    { sql: `INSERT INTO cbt_topics(subject_key,topic_key,topic_name,display_order,active) VALUES(?,?,?,999,?)
      ON CONFLICT(subject_key,topic_key) DO UPDATE SET topic_name=COALESCE(NULLIF(excluded.topic_name,''),cbt_topics.topic_name),active=excluded.active`, args: [subjectKey, topicKey, topicName || topicKey, visible ? 1 : 0] },
    { sql: `UPDATE cbt_questions SET student_visible=?, updated_at=CURRENT_TIMESTAMP
      WHERE subject_key=? AND topic_key=? AND active=1 AND question_type='mcq'`, args: [visible ? 1 : 0, subjectKey, topicKey] }
  ]);

  return json({
    success: true,
    subject_key: subjectKey,
    topic_key: topicKey,
    student_visible: visible,
    updated_questions: Number(results[2]?.affected || 0)
  }, 200, cors);
}


async function handleQuestionVisibility(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key);
  const topicKey = safeKey(body.topic_key);
  const ids = [...new Set((Array.isArray(body.question_ids) ? body.question_ids : [body.question_id])
    .map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].slice(0, 500);
  const visible = body.visible === true || body.visible === 1 || String(body.visible).toLowerCase() === "true";
  if (!subjectKey || !topicKey || !ids.length) throw httpError("Subject, Topic और Question IDs required");
  const placeholders = ids.map(() => "?").join(",");
  const [updated] = await pipeline(env, [{
    sql: `UPDATE cbt_questions SET student_visible=?, updated_at=CURRENT_TIMESTAMP
      WHERE subject_key=? AND topic_key=? AND active=1 AND id IN (${placeholders})`,
    args: [visible ? 1 : 0, subjectKey, topicKey, ...ids]
  }]);
  return json({ success: true, updated_questions: updated.affected, student_visible: visible }, 200, cors);
}

async function handleTopicQuestionVisibility(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key);
  const topicKey = safeKey(body.topic_key);
  const visible = body.visible === true || body.visible === 1 || String(body.visible).toLowerCase() === "true";
  if (!subjectKey || !topicKey) throw httpError("Subject/Topic required");
  const [updated] = await pipeline(env, [{
    sql: `UPDATE cbt_questions SET student_visible=?, updated_at=CURRENT_TIMESTAMP
      WHERE subject_key=? AND topic_key=? AND active=1 AND question_type='mcq'`,
    args: [visible ? 1 : 0, subjectKey, topicKey]
  }]);
  return json({ success: true, updated_questions: updated.affected, student_visible: visible }, 200, cors);
}

async function handleAdminQuestions(url, env, cors) {
  const subjectKey = safeKey(url.searchParams.get("subject_key"));
  const topicKey = safeKey(url.searchParams.get("topic_key"));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  if (!subjectKey || !topicKey) throw httpError("Subject/Topic required");

  const [total, rows] = await pipeline(env, [
    { sql: `SELECT COUNT(*) total FROM cbt_questions WHERE subject_key=? AND topic_key=?`, args: [subjectKey, topicKey] },
    { sql: `SELECT id, difficulty, question_type, question_text, option_a, option_b, option_c, option_d,
        answer_index, answer_text, explanation, active, student_visible, created_at
      FROM cbt_questions
      WHERE subject_key=? AND topic_key=?
      ORDER BY id DESC
      LIMIT ? OFFSET ?`, args: [subjectKey, topicKey, limit, offset] }
  ]);

  return json({
    success: true,
    total: Number(total.rows[0]?.total || 0),
    questions: rows.rows
  }, 200, cors);
}

async function handleDeleteQuestions(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key);
  const topicKey = safeKey(body.topic_key);
  const ids = [...new Set((Array.isArray(body.question_ids) ? body.question_ids : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))].slice(0, 500);
  if (!subjectKey || !topicKey || !ids.length) throw httpError("Subject, Topic और Question IDs required");

  const placeholders = ids.map(() => "?").join(",");
  const [deleted] = await pipeline(env, [
    { sql: `DELETE FROM cbt_questions WHERE subject_key=? AND topic_key=? AND id IN (${placeholders})`, args: [subjectKey, topicKey, ...ids] },
    { sql: `UPDATE cbt_topics SET active=0 WHERE subject_key=? AND topic_key=? AND NOT EXISTS (
        SELECT 1 FROM cbt_questions q
        WHERE q.subject_key=cbt_topics.subject_key
          AND q.topic_key=cbt_topics.topic_key
          AND q.active=1
          AND q.question_type='mcq'
      )`, args: [subjectKey, topicKey] }
  ]);

  return json({ success: true, deleted_questions: deleted.affected }, 200, cors);
}

async function handleDeleteEmpty(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key); const topics = (Array.isArray(body.topic_keys) ? body.topic_keys : []).map(safeKey).filter(Boolean);
  if (!subjectKey || !topics.length) throw httpError("Subject/Topics required");
  const placeholders = topics.map(() => "?").join(",");
  const [deleted] = await pipeline(env, [
    { sql: `DELETE FROM cbt_questions WHERE subject_key=? AND topic_key IN (${placeholders}) AND (question_type='one_liner' OR trim(option_a)='' OR trim(option_b)='' OR trim(option_c)='' OR trim(option_d)='')`, args: [subjectKey, ...topics] },
    { sql: `UPDATE cbt_topics SET active=0 WHERE subject_key=? AND topic_key IN (${placeholders}) AND NOT EXISTS (
        SELECT 1 FROM cbt_questions q WHERE q.subject_key=cbt_topics.subject_key AND q.topic_key=cbt_topics.topic_key AND q.active=1 AND q.question_type='mcq'
      )`, args: [subjectKey, ...topics] }
  ]);
  return json({ success: true, deleted_questions: deleted.affected }, 200, cors);
}

async function handleDeleteTopics(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key); const topics = (Array.isArray(body.topic_keys) ? body.topic_keys : []).map(safeKey).filter(Boolean);
  if (!subjectKey || !topics.length) throw httpError("Subject/Topics required");
  const placeholders = topics.map(() => "?").join(",");
  const [deleted] = await pipeline(env, [
    { sql: `DELETE FROM cbt_questions WHERE subject_key=? AND topic_key IN (${placeholders})`, args: [subjectKey, ...topics] },
    { sql: `UPDATE cbt_topics SET active=0 WHERE subject_key=? AND topic_key IN (${placeholders})`, args: [subjectKey, ...topics] }
  ]);
  return json({ success: true, deleted_questions: deleted.affected }, 200, cors);
}

async function handleDeleteAll(env, cors) {
  const [deleted] = await pipeline(env, [
    { sql: "DELETE FROM cbt_questions" },
    { sql: "UPDATE cbt_topics SET active=0" }
  ]);
  return json({ success: true, deleted_questions: deleted.affected }, 200, cors);
}

function parseUploadText(raw) {
  return raw.split(/\n\s*---\s*\n/g).map((block) => {
    const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const get = (prefix) => { const line = lines.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase() + ":")); return line ? line.slice(line.indexOf(":") + 1).trim() : ""; };
    const type = get("Type").toLowerCase() === "one_liner" ? "one_liner" : "mcq";
    const question = safeText(get("Q"), 4000); const explanation = safeText(get("Explanation"), 6000);
    if (!question) return null;
    if (type === "one_liner") { const answerText = safeText(get("Answer"), 2000); return answerText ? { type, question, options: [], answerIndex: -1, answerText, explanation } : null; }
    const options = [get("A"), get("B"), get("C"), get("D")].map((x) => safeText(x, 2000));
    const letter = get("Answer").replace(/[()\s.]/g, "").toUpperCase().charAt(0); const answerIndex = { A: 0, B: 1, C: 2, D: 3 }[letter];
    if (options.some((x) => !x) || answerIndex === undefined) return null;
    return { type, question, options, answerIndex, answerText: "", explanation };
  }).filter(Boolean);
}

function safeKey(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_\-\u0900-\u097f]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120); }
function safeText(value, max = 1000) { return String(value || "").replace(/\u0000/g, "").trim().slice(0, max); }
function normalize(value) { return String(value || "").toLowerCase().replace(/\s+/g, " ").trim(); }
async function sha256(text) { const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
