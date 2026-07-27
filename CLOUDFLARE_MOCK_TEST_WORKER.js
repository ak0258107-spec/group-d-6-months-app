/* GK BY PURUSHOTAM SIR — Separate CBT Mock Test API (V11)
   Required Worker secrets/variables:
   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
   Optional: APP_ORIGIN (example https://ak0258107-spec.github.io)
*/

const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api")) return json({ success: true, service: "GK CBT Mock Test API V11" }, 200, cors);

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

async function handleCatalog(env, cors) {
  const [subjects, topics] = await pipeline(env, [
    { sql: "SELECT subject_key, subject_name, display_order FROM cbt_subjects WHERE active=1 ORDER BY display_order, subject_name" },
    { sql: "SELECT subject_key, topic_key, topic_name, display_order FROM cbt_topics WHERE active=1 ORDER BY subject_key, display_order, topic_name" }
  ]);
  const bySubject = new Map(subjects.rows.map((s) => [s.subject_key, { ...s, topics: [] }]));
  topics.rows.forEach((topic) => { const subject = bySubject.get(topic.subject_key); if (subject) subject.topics.push(topic); });
  return json({ success: true, subjects: [...bySubject.values()] }, 200, cors);
}

async function handleCounts(url, env, cors) {
  const subjectKey = String(url.searchParams.get("subject_key") || "").trim();
  if (!subjectKey) throw httpError("subject_key required");
  const result = await query(env, `SELECT topic_key, topic_name, COUNT(*) total,
    SUM(CASE WHEN difficulty='easy' THEN 1 ELSE 0 END) easy,
    SUM(CASE WHEN difficulty='normal' THEN 1 ELSE 0 END) normal,
    SUM(CASE WHEN difficulty='tough' THEN 1 ELSE 0 END) tough
    FROM cbt_questions WHERE active=1 AND subject_key=? GROUP BY topic_key, topic_name`, [subjectKey]);
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
  let sql = `SELECT id,subject_key,subject_name,topic_key,topic_name,difficulty,question_type,question_text AS question,
    option_a,option_b,option_c,option_d,answer_index,answer_text,explanation,image_key
    FROM cbt_questions WHERE active=1 AND subject_key=? AND topic_key=? AND question_type=?`;
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
    { sql: "SELECT COUNT(*) total FROM cbt_questions WHERE subject_key=?", args: [subjectKey] },
    { sql: "SELECT topic_key,topic_name,COUNT(*) count FROM cbt_questions WHERE subject_key=? GROUP BY topic_key,topic_name ORDER BY topic_name", args: [subjectKey] }
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
      statements.push({ sql: `INSERT INTO cbt_topics(subject_key,topic_key,topic_name,display_order,active) VALUES(?,?,?,?,1)
        ON CONFLICT(subject_key,topic_key) DO UPDATE SET topic_name=excluded.topic_name,display_order=excluded.display_order,active=1`, args: [key, topicKey, topicName, Number(topic.order || ti + 1)] });
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
  const statements = [];
  for (const question of parsed.slice(0, 100)) {
    const fingerprint = await sha256([subjectKey, topicKey, question.type, normalize(question.question), normalize(question.options.join("|")), normalize(question.answerText || String(question.answerIndex))].join("||"));
    statements.push({ sql: `INSERT OR IGNORE INTO cbt_questions
      (subject_key,subject_name,topic_key,topic_name,difficulty,question_type,question_text,option_a,option_b,option_c,option_d,answer_index,answer_text,explanation,fingerprint,active)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, args: [subjectKey, subjectName, topicKey, topicName, difficulty, question.type, question.question, question.options[0] || "", question.options[1] || "", question.options[2] || "", question.options[3] || "", question.answerIndex, question.answerText || "", question.explanation || "", fingerprint] });
  }
  const results = await pipeline(env, statements);
  const inserted = results.reduce((sum, item) => sum + item.affected, 0);
  return json({ success: true, found: parsed.length, inserted, duplicate: parsed.length - inserted, dummy: 0, errors: [] }, 200, cors);
}

async function handleDeleteEmpty(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key); const topics = (Array.isArray(body.topic_keys) ? body.topic_keys : []).map(safeKey).filter(Boolean);
  if (!subjectKey || !topics.length) throw httpError("Subject/Topics required");
  const placeholders = topics.map(() => "?").join(",");
  const result = await query(env, `DELETE FROM cbt_questions WHERE subject_key=? AND topic_key IN (${placeholders}) AND (question_type='one_liner' OR trim(option_a)='' OR trim(option_b)='' OR trim(option_c)='' OR trim(option_d)='')`, [subjectKey, ...topics]);
  return json({ success: true, deleted_questions: result.affected }, 200, cors);
}

async function handleDeleteTopics(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const subjectKey = safeKey(body.subject_key); const topics = (Array.isArray(body.topic_keys) ? body.topic_keys : []).map(safeKey).filter(Boolean);
  if (!subjectKey || !topics.length) throw httpError("Subject/Topics required");
  const placeholders = topics.map(() => "?").join(",");
  const result = await query(env, `DELETE FROM cbt_questions WHERE subject_key=? AND topic_key IN (${placeholders})`, [subjectKey, ...topics]);
  return json({ success: true, deleted_questions: result.affected }, 200, cors);
}

async function handleDeleteAll(env, cors) {
  const result = await query(env, "DELETE FROM cbt_questions");
  return json({ success: true, deleted_questions: result.affected }, 200, cors);
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
