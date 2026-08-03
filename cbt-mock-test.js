// V12.6: Student dropdown shows only Admin-published topics that contain active MCQ questions.
const API_BASE_URL = String((window.APP_CONFIG && window.APP_CONFIG.MOCK_TEST_API_URL) || "https://exam-arena-api-live.ak0258107.workers.dev/api").replace(/\/+$/, "");

const FIXED_SUBJECT_KEY = "all_subjects";
const FIXED_SUBJECT_NAME = "All Subjects";
let catalogSubjects = [];
let currentAuthUser = null;
let currentProfile = null;
let currentAccessToken = "";

const MAX_TOPICS = 5;
const PER_QUESTION_SECONDS = 25;
const QUESTION_LIMIT_OPTIONS = [10, 20, 30, 40, 50, 75, 100];

const YOUTUBE_CHANNEL_LINK = "https://youtube.com/@gkbypurushotamsir007?si=_0OqQKcPhURoTLIE";
const TELEGRAM_CHANNEL_LINK = "https://t.me/gkbypurushotamsir";

let questionCounts = {};
let countsLoaded = false;

let selectedTopics = [];
let topicIdCounter = 1;

let currentStudent = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let selectedAnswers = [];
let testSubmitted = false;

let currentTestMeta = null;
let timerInterval = null;
let testStartMs = 0;
let testEndMs = 0;
let totalTestMs = 0;
let totalElapsedSeconds = 0;

let lastStats = null;
let lastServerResult = null;
let currentAnalysisIndex = 0;

let currentNegativeMarking = false;
const MARKS_PER_QUESTION = 2;
const NEGATIVE_MARKS_VALUE = 0.25;
const TOPPER_MIN_PERCENTAGE = 80;
const SHARE_UNLOCK_TEST_LIMIT = 5;
const SHARE_UNLOCK_REQUIRED = 5;

let lastTopperData = null;

function clean(value) {
    return String(value === null || value === undefined ? "" : value)
        .replace(/\r/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\u200B/g, "")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, "-")
        .trim();
}


function byId(id) {
    return document.getElementById(id);
}

async function refreshCbtSession() {
    const { data: { session } } = await sb.auth.getSession();
    currentAccessToken = session && session.access_token ? session.access_token : "";
    return session;
}

async function apiFetch(path, options = {}) {
    if (!currentAccessToken) await refreshCbtSession();
    const headers = new Headers(options.headers || {});
    if (currentAccessToken) headers.set("Authorization", `Bearer ${currentAccessToken}`);
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

function getCatalogSubjects() {
    return Array.isArray(catalogSubjects) ? catalogSubjects : [];
}

function getSubject(subjectKey) {
    return getCatalogSubjects().find((subject) => subject.key === subjectKey) || null;
}

function getSubjectName(subjectKey) {
    return (getSubject(subjectKey) || {}).name || subjectKey || "Subject";
}

function getTopicsForSubject(subjectKey) {
    const subject = getSubject(subjectKey);
    return subject && Array.isArray(subject.topics) ? subject.topics : [];
}

function getTopicName(subjectKey, topicKey) {
    if (topicKey === undefined) { topicKey = subjectKey; subjectKey = "haryana_gk"; }
    const topic = getTopicsForSubject(subjectKey).find((item) => item.key === topicKey);
    return topic ? topic.name : topicKey;
}

function getTestSubjectLabel() {
    const units = currentTestMeta && Array.isArray(currentTestMeta.topics) ? currentTestMeta.topics : collectSelectedTopics("all");
    const names = [...new Set((units || []).map((unit) => unit.subjectName).filter(Boolean))];
    return names.length === 1 ? names[0] : names.length > 1 ? "Multiple Subjects" : "All Subjects";
}

async function loadCatalog() {
    catalogSubjects = [];
    questionCounts = {};
    countsLoaded = false;

    try {
        const response = await apiFetch(`/catalog?t=${Date.now()}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success || !Array.isArray(data.subjects)) {
            throw new Error(data.error || data.message || "Mock Test catalog load नहीं हुआ।");
        }

        const localCatalog = (window.topicsData && typeof window.topicsData === "object") ? window.topicsData : {};
        const allowedCatalog = new Map(Object.entries(localCatalog).map(([subjectKey, subject]) => [
            clean(subjectKey),
            new Set((Array.isArray(subject.topics) ? subject.topics : []).map((topic) => clean(typeof topic === "string" ? topic : (topic.key || topic.topic_key || topic.name))))
        ]));

        catalogSubjects = data.subjects.map((subject, subjectIndex) => {
            const subjectKey = clean(subject.subject_key || subject.key);
            const topics = (Array.isArray(subject.topics) ? subject.topics : []).map((topic, topicIndex) => {
                const topicKey = clean(topic.topic_key || topic.key);
                if (!questionCounts[subjectKey]) questionCounts[subjectKey] = {};
                questionCounts[subjectKey][topicKey] = {
                    topic_name: clean(topic.topic_name || topic.name || topicKey),
                    total: Number(topic.total || 0),
                    easy: Number(topic.easy || 0),
                    normal: Number(topic.normal || 0),
                    tough: Number(topic.tough || 0)
                };
                return {
                    key: topicKey,
                    name: clean(topic.topic_name || topic.name || topicKey),
                    display_order: Number(topic.display_order || topicIndex + 1)
                };
            }).filter((topic) => topic.key && topic.name && getTopicTotal(subjectKey, topic.key, "all") > 0 && allowedCatalog.has(subjectKey) && allowedCatalog.get(subjectKey).has(topic.key));

            return {
                key: subjectKey,
                name: clean(subject.subject_name || subject.name || subjectKey),
                display_order: Number(subject.display_order || subjectIndex + 1),
                topics
            };
        }).filter((subject) => subject.key && subject.name && allowedCatalog.has(subject.key) && subject.topics.length > 0)
          .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));

        countsLoaded = true;
    } catch (error) {
        console.warn("Published CBT catalog load failed:", error);
        catalogSubjects = [];
        questionCounts = {};
        countsLoaded = false;
    }
}

function safeText(value) {
    return String(value === null || value === undefined ? "" : value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeText(value) {
    return clean(value)
        .toLowerCase()
        .replace(/[()\[\]{}:：\-–—.,।?]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function captureScrollState() {
    return {
        x: window.scrollX || window.pageXOffset || 0,
        y: window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
        htmlTop: document.documentElement.scrollTop || 0,
        bodyTop: document.body.scrollTop || 0
    };
}

function restoreScrollState(state) {
    if (!state) return;

    try {
        document.documentElement.scrollTop = state.htmlTop;
        document.body.scrollTop = state.bodyTop;
        window.scrollTo(state.x, state.y);
    } catch (error) {}
}

function restoreScrollStateHard(state) {
    if (!state) return;

    restoreScrollState(state);

    requestAnimationFrame(() => {
        restoreScrollState(state);
    });

    setTimeout(() => {
        restoreScrollState(state);
    }, 0);

    setTimeout(() => {
        restoreScrollState(state);
    }, 60);
}

function shuffleArray(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function getOptionLetter(index) {
    if (Number(index) === 0) return "A";
    if (Number(index) === 1) return "B";
    if (Number(index) === 2) return "C";
    if (Number(index) === 3) return "D";
    return "";
}

function isOneLinerTopicKey(topicKey) {
    const key = clean(topicKey).toLowerCase();
    return key.includes("one_liner") || key.includes("oneliner") || key.includes("one-liner");
}

function isOneLinerQuestion(question) {
    const type = clean(question && (question.question_type || question.questionType || question.type)).toLowerCase();
    const answerText = clean(question && (question.answer_text || question.answerText || question.answer));
    const options = [
        question && question.option_a,
        question && question.option_b,
        question && question.option_c,
        question && question.option_d
    ].map(clean).filter(Boolean);

    return type === "one_liner" || type === "oneliner" || (answerText && options.length === 0);
}

function formatTime(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatMs(ms) {
    return formatTime(Math.ceil(Math.max(0, ms) / 1000));
}

function formatScore(value) {
    const number = Number(value || 0);
    if (Number.isInteger(number)) return String(number);
    return number.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

function getSelectedNegativeMarking() {
    const select = byId("negativeMarkingSelect");
    return select && select.value === "yes";
}

function isSetupOneLinerOnly(setup) {
    return setup && setup.distribution && setup.distribution.length === 1 && isOneLinerTopicKey(setup.distribution[0].topicKey);
}

function showScreen(screenName) {
    const setupScreen = byId("setupScreen");
    const quizScreen = byId("quizScreen");
    const resultScreen = byId("resultScreen");

    [setupScreen, quizScreen, resultScreen].forEach((screen) => {
        if (!screen) return;
        screen.classList.add("hidden");
        screen.classList.remove("active");
    });

    let target = null;

    if (screenName === "setup") target = setupScreen;
    if (screenName === "quiz") target = quizScreen;
    if (screenName === "result") target = resultScreen;

    if (target) {
        target.classList.remove("hidden");
        target.classList.add("active");
    }

    window.scrollTo(0, 0);
}

function getTopicsDataSource() {
    try {
        if (typeof topicsData !== "undefined") return topicsData;
    } catch (error) {}

    return window.topicsData || {};
}

function getHaryanaSubjectData() { return getSubject("haryana_gk") || {}; }

function makeKey(value) {
    let text = clean(value).toLowerCase();

    text = text
        .replaceAll(" ", "_")
        .replaceAll("-", "_")
        .replaceAll("/", "_")
        .replaceAll("\\", "_")
        .replaceAll(".", "_")
        .replaceAll("(", "")
        .replaceAll(")", "")
        .replaceAll("[", "")
        .replaceAll("]", "")
        .replaceAll(",", "")
        .replaceAll(":", "")
        .replaceAll("?", "")
        .replaceAll("।", "");

    while (text.includes("__")) {
        text = text.replaceAll("__", "_");
    }

    return text.replace(/^_+|_+$/g, "") || "vividh";
}

function getHaryanaTopics() { return getTopicsForSubject("haryana_gk"); }

function getHaryanaTopicName(topicKey) {
    const topic = getHaryanaTopics().find((item) => item.key === topicKey);
    return topic ? topic.name : topicKey;
}

async function loadQuestionCounts() {
    questionCounts = {};
    countsLoaded = false;
    const subjects = getCatalogSubjects();
    try {
        await Promise.all(subjects.map(async (subject) => {
            const response = await apiFetch(`/questions/counts?subject_key=${encodeURIComponent(subject.key)}&t=${Date.now()}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) return;
            const raw = data.counts || data.data || {};
            const subjectCounts = raw[subject.key] || raw;
            questionCounts[subject.key] = subjectCounts.topics || {};
        }));
        countsLoaded = Object.keys(questionCounts).length > 0;
        filterCatalogToTopicsWithQuestions();
    } catch (error) {
        console.warn("Question counts load failed:", error);
    }
}

function filterCatalogToTopicsWithQuestions() {
    catalogSubjects = getCatalogSubjects()
        .map((subject) => ({
            ...subject,
            topics: (Array.isArray(subject.topics) ? subject.topics : []).filter((topic) => {
                return getTopicTotal(subject.key, topic.key, "all") > 0;
            })
        }))
        .filter((subject) => subject.topics.length > 0);
}

function getTopicTotal(subjectKey, topicKey, difficulty) {
    if (difficulty === undefined) { difficulty = topicKey; topicKey = subjectKey; subjectKey = "haryana_gk"; }
    const subjectCounts = questionCounts[subjectKey] || {};
    const topicCount = subjectCounts[topicKey];
    if (!topicCount) return 0;
    if (!difficulty || difficulty === "all") return Number(topicCount.total || 0);
    return Number(topicCount[difficulty] || 0);
}

function addTopic(defaultTopicKey = "", defaultSubjectKey = "") {
    if (selectedTopics.length >= MAX_TOPICS) {
        alert(`Maximum ${MAX_TOPICS} topics ही select कर सकते हैं।`);
        return;
    }
    const firstSubject = defaultSubjectKey || (getCatalogSubjects()[0] || {}).key || "";
    selectedTopics.push({ id: topicIdCounter++, subjectKey: firstSubject, topicKey: defaultTopicKey });
    renderDifficultyOptions(); renderTopics(); updateLimitOptions();
}

function removeTopic(topicId) {
    selectedTopics = selectedTopics.filter((topic) => topic.id !== topicId);

    if (selectedTopics.length === 0) {
        addTopic();
        return;
    }

    renderDifficultyOptions();
    renderTopics();
    updateLimitOptions();
}

function updateSelectedSubject(topicId, subjectKey) {
    const unit = selectedTopics.find((item) => item.id === topicId);
    if (!unit) return;
    unit.subjectKey = subjectKey;
    unit.topicKey = "";
    renderDifficultyOptions(); renderTopics(); updateLimitOptions();
}

function updateSelectedTopic(topicId, topicKey) {
    const topic = selectedTopics.find((item) => item.id === topicId);

    if (!topic) return;

    topic.topicKey = topicKey;

    renderDifficultyOptions();
    renderTopics();
    updateLimitOptions();
}

function renderTopics() {
    const area = byId("selectedTopicsArea");
    if (!area) return;
    const subjects = getCatalogSubjects();
    const difficulty = getSelectedDifficulty();

    if (!subjects.length) {
        area.innerHTML = `<div class="unit-card"><div class="unit-title">अभी Mock Test उपलब्ध नहीं है</div><div class="selection-note">Admin जिस Subject/Topic में MCQ Questions upload करेगा, केवल वही Subject और Topic यहाँ अपने-आप दिखाई देगा।</div></div>`;
        return;
    }

    if (!selectedTopics.length) selectedTopics.push({ id: topicIdCounter++, subjectKey: (subjects[0] || {}).key || "", topicKey: "" });

    area.innerHTML = selectedTopics.map((unit, index) => {
        const subjectOptions = [`<option value="">-- Subject Select करें --</option>`, ...subjects.map((subject) => `<option value="${safeText(subject.key)}" ${subject.key === unit.subjectKey ? "selected" : ""}>${safeText(subject.name)}</option>`)].join("");
        const topics = getTopicsForSubject(unit.subjectKey);
        const topicOptions = [`<option value="">-- Topic Select करें --</option>`, ...topics.map((topic) => {
            const count = getTopicTotal(unit.subjectKey, topic.key, difficulty);
            return `<option value="${safeText(topic.key)}" ${topic.key === unit.topicKey ? "selected" : ""}>${safeText(topic.name)}${countsLoaded ? ` — ${count} Questions` : ""}</option>`;
        })].join("");
        return `<div class="unit-card" data-topic-id="${unit.id}">
            <div class="unit-head"><div class="unit-title">Selection ${index + 1}</div>${selectedTopics.length > 1 ? `<button type="button" class="remove-unit-btn" data-remove-topic="${unit.id}">Remove</button>` : ""}</div>
            <div class="unit-grid">
              <div><div class="unit-select-label">Subject</div><select data-subject-select="${unit.id}">${subjectOptions}</select></div>
              <div><div class="unit-select-label">Topic</div><select data-topic-select="${unit.id}">${topicOptions}</select></div>
            </div>
        </div>`;
    }).join("");
    area.querySelectorAll("[data-subject-select]").forEach((select) => select.addEventListener("change", () => updateSelectedSubject(Number(select.dataset.subjectSelect), select.value)));
    area.querySelectorAll("[data-topic-select]").forEach((select) => select.addEventListener("change", () => updateSelectedTopic(Number(select.dataset.topicSelect), select.value)));
    area.querySelectorAll("[data-remove-topic]").forEach((button) => button.addEventListener("click", () => removeTopic(Number(button.dataset.removeTopic))));
}

function getSelectedDifficulty() {
    const select = byId("difficultySelect");
    return select ? clean(select.value || "all") : "all";
}

function getSelectedTopicKeysForDifficulty() {
    return selectedTopics.filter((unit) => unit.subjectKey && unit.topicKey).map((unit) => ({ subjectKey: unit.subjectKey, topicKey: unit.topicKey }));
}

function getSelectedDifficultyTotal(difficulty) {
    const units = getSelectedTopicKeysForDifficulty();
    return units.reduce((sum, unit) => sum + getTopicTotal(unit.subjectKey, unit.topicKey, difficulty), 0);
}

function renderDifficultyOptions() {
    const select = byId("difficultySelect");

    if (!select) return;

    const oldValue = clean(select.value || "normal");
    const hasSelectedTopic = getSelectedTopicKeysForDifficulty().length > 0;

    const difficultyItems = [
        { value: "easy", name: "Easy" },
        { value: "normal", name: "Normal" },
        { value: "tough", name: "Tough" }
    ].map((item) => {
        const count = hasSelectedTopic && countsLoaded ? getSelectedDifficultyTotal(item.value) : 0;
        return { ...item, count };
    });

    let nextValue = oldValue;

    if (hasSelectedTopic && countsLoaded) {
        const oldItem = difficultyItems.find((item) => item.value === oldValue);

        if (!oldItem || Number(oldItem.count || 0) <= 0) {
            const availableItem=difficultyItems.find(item=>Number(item.count||0)>0);
            nextValue=availableItem?availableItem.value:"normal";
        }
    } else if (!["easy", "normal", "tough"].includes(nextValue)) {
        nextValue = "normal";
    }

    select.innerHTML = difficultyItems.map((item) => {
        const countText = hasSelectedTopic && countsLoaded ? ` — ${item.count} Q` : "";
        const disabled = hasSelectedTopic && countsLoaded && Number(item.count || 0) <= 0 ? "disabled" : "";
        const selected = item.value === nextValue ? "selected" : "";

        return `<option value="${item.value}" ${selected} ${disabled}>${item.name}${countText}</option>`;
    }).join("");

    if (select.value !== nextValue && (!hasSelectedTopic || !countsLoaded || getSelectedDifficultyTotal(nextValue) > 0)) {
        select.value = nextValue;
    }
}

function getSelectedLimit() {
    const select = byId("limitSelect");
    const value = Number(select ? select.value : 10);
    return QUESTION_LIMIT_OPTIONS.includes(value) ? value : 10;
}

function collectSelectedTopics(difficultyOverride = null) {
    const difficulty = difficultyOverride || getSelectedDifficulty();
    return selectedTopics.filter((unit) => unit.subjectKey && unit.topicKey).map((unit) => ({
        id: unit.id,
        subjectKey: unit.subjectKey,
        subjectName: getSubjectName(unit.subjectKey),
        topicKey: unit.topicKey,
        topicName: getTopicName(unit.subjectKey, unit.topicKey),
        available: getTopicTotal(unit.subjectKey, unit.topicKey, difficulty),
        available_all: getTopicTotal(unit.subjectKey, unit.topicKey, "all")
    }));
}

function getAllowedLimits() {
    return QUESTION_LIMIT_OPTIONS.slice();
}

function updateLimitOptions() {
    const select = byId("limitSelect");

    if (!select) return;

    const validTopics = collectSelectedTopics();
    const topicCount = Math.max(1, validTopics.length);
    const oldValue = Number(select.value || 0);

    select.innerHTML = QUESTION_LIMIT_OPTIONS.map((limit) => {
        let label = `${limit} Questions`;

        if (topicCount > 1) {
            const base = Math.floor(limit / topicCount);
            const remainder = limit % topicCount;

            label = remainder
                ? `${limit} Questions (लगभग ${base}-${base + 1} प्रति Topic)`
                : `${limit} Questions (${base} प्रति Topic)`;
        }

        return `<option value="${limit}">${label}</option>`;
    }).join("");

    select.value = QUESTION_LIMIT_OPTIONS.includes(oldValue) ? String(oldValue) : "10";
}

function buildDistribution(topics, totalLimit) {
    const count = topics.length;
    const base = Math.floor(totalLimit / count);
    let remainder = totalLimit % count;

    return topics.map((topic) => {
        const extra = remainder > 0 ? 1 : 0;

        if (remainder > 0) remainder--;

        return {
            ...topic,
            questionLimit: base + extra
        };
    });
}

function validateTestSetup() {
    let difficulty = getSelectedDifficulty();
    let topics = collectSelectedTopics(difficulty);
    const limit = getSelectedLimit();
    if (!currentAuthUser || !currentProfile) { alert("Student login required है।"); return null; }
    if (!topics.length) { alert("कम से कम एक Subject और Topic select करें।"); return null; }
    if (topics.length > MAX_TOPICS) { alert(`Maximum ${MAX_TOPICS} topics ही select कर सकते हैं।`); return null; }
    const duplicateSet = new Set();
    for (const topic of topics) {
        const key = `${topic.subjectKey}__${topic.topicKey}`;
        if (duplicateSet.has(key)) { alert(`${topic.subjectName} / ${topic.topicName} दो बार select है।`); return null; }
        duplicateSet.add(key);
    }
    if (countsLoaded) {
        let totalAvailable = topics.reduce((sum, topic) => sum + Number(topic.available || 0), 0);
        let zeroTopic = topics.find((topic) => Number(topic.available || 0) <= 0);
        totalAvailable = topics.reduce((sum, topic) => sum + Number(topic.available || 0), 0);
        zeroTopic = topics.find((topic) => Number(topic.available || 0) <= 0);
        if (totalAvailable < limit) { alert(`Selected topics में ${limit} questions उपलब्ध नहीं हैं। अभी ${totalAvailable} उपलब्ध हैं।`); return null; }
        if (zeroTopic) { alert(`${zeroTopic.subjectName} / ${zeroTopic.topicName} में अभी questions नहीं हैं।`); return null; }
    }
    return { topics, distribution: buildDistribution(topics, limit), limit, difficulty, negativeMarking: getSelectedNegativeMarking() };
}

async function registerStudent(studentName, mobile) {
    const response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: studentName,
            student_name: studentName,
            mobile,
            roll_info: ""
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || "Student registration failed.");
    }

    return {
        ...data,
        student_id: data.student_id || data.id || null,
        roll_number: data.roll_number || data.roll_no || "",
        test_count: Number(data.test_count || 0),
        share_count: Number(data.share_count || 0),
        is_unlocked: !!data.is_unlocked
    };
}

function parseAnswerIndex(value) {
    if (typeof value === "number") {
        if (value >= 0 && value <= 3) return value;
    }

    const text = clean(value)
        .replace(/[()]/g, " ")
        .trim()
        .toUpperCase();

    if (!text) return -1;

    const first = text.match(/[ABCDकखगघ]/);

    if (!first) return -1;

    const key = first[0];

    if (key === "A" || key === "क") return 0;
    if (key === "B" || key === "ख") return 1;
    if (key === "C" || key === "ग") return 2;
    if (key === "D" || key === "घ") return 3;

    return -1;
}

function resolveAnswerByText(answerRaw, options) {
    const raw = clean(answerRaw);

    if (!raw) return -1;

    let answerText = raw
        .replace(/^\s*\(?\s*[ABCDabcdकखगघ]\s*\)?[\.\)\:\-\s]*/i, "")
        .replace(/^\s*(?:option|विकल्प)\s*[ABCDabcdकखगघ]\s*[\.\)\:\-\s]*/i, "")
        .trim();

    const normalizedAnswer = normalizeText(answerText || raw);

    for (let i = 0; i < options.length; i++) {
        const normalizedOption = normalizeText(options[i]);

        if (!normalizedAnswer || !normalizedOption) continue;

        if (normalizedAnswer === normalizedOption) return i;
        if (normalizedOption.includes(normalizedAnswer)) return i;
        if (normalizedAnswer.includes(normalizedOption)) return i;
    }

    return -1;
}

function normalizeQuestion(question) {
    let options = question.options;

    if (typeof options === "string") {
        try {
            options = JSON.parse(options);
        } catch (error) {
            options = [];
        }
    }

    if (!Array.isArray(options) || options.length < 4) {
        options = [
            question.option_a,
            question.option_b,
            question.option_c,
            question.option_d
        ];
    }

    const cleanOptions = [];

    options.forEach((item) => {
        if (item !== null && item !== undefined && clean(item)) {
            cleanOptions.push(clean(item));
        }
    });

    while (cleanOptions.length < 4) {
        cleanOptions.push("");
    }

    const answerRaw =
        question.answer_index !== undefined && question.answer_index !== null && question.answer_index !== ""
            ? question.answer_index
            : question.correct_answer_index !== undefined && question.correct_answer_index !== null && question.correct_answer_index !== ""
                ? question.correct_answer_index
                : question.correct_index !== undefined && question.correct_index !== null && question.correct_index !== ""
                    ? question.correct_index
                    : question.correct_answer || question.correctAnswer || question.answer || question.correct_option || "";

    let answerIndex = parseAnswerIndex(answerRaw);

    if (answerIndex < 0 || answerIndex > 3) {
        answerIndex = resolveAnswerByText(question.correct_answer || question.correctAnswer || question.answer || "", cleanOptions);
    }

    const questionType = isOneLinerQuestion({ ...question, option_a: cleanOptions[0] || "", option_b: cleanOptions[1] || "", option_c: cleanOptions[2] || "", option_d: cleanOptions[3] || "" })
        ? "one_liner"
        : "mcq";

    const answerText = clean(question.answer_text || question.answerText || question.answer || question.correct_answer || question.correctAnswer || "");

    return {
        ...question,
        id: question.id || question.question_id || "",
        question_type: questionType,
        questionType,
        question: clean(question.question || question.question_text || ""),
        question_text: clean(question.question_text || question.question || ""),
        options: questionType === "one_liner" ? [] : cleanOptions.slice(0, 4),
        option_a: questionType === "one_liner" ? "" : (cleanOptions[0] || ""),
        option_b: questionType === "one_liner" ? "" : (cleanOptions[1] || ""),
        option_c: questionType === "one_liner" ? "" : (cleanOptions[2] || ""),
        option_d: questionType === "one_liner" ? "" : (cleanOptions[3] || ""),
        answerIndex: questionType === "one_liner" ? -1 : answerIndex,
        answer_index: questionType === "one_liner" ? -1 : answerIndex,
        answer_text: answerText,
        answerText,
        answer: questionType === "one_liner" ? answerText : (question.answer || question.correct_answer || question.correctAnswer || getOptionLetter(answerIndex)),
        correct_answer: questionType === "one_liner" ? answerText : (question.correct_answer || question.answer || question.correctAnswer || getOptionLetter(answerIndex)),
        explanation: clean(question.explanation || ""),
        subject_key: question.subject_key || question.subjectKey || FIXED_SUBJECT_KEY,
        subject_name: question.subject_name || question.subjectName || FIXED_SUBJECT_NAME,
        topic_key: question.topic_key || question.topicKey || "",
        topic_name: question.topic_name || question.topicName || "",
        selected_subject_key: FIXED_SUBJECT_KEY,
        selected_subject_name: FIXED_SUBJECT_NAME,
        selected_topic_key: question.selected_topic_key || "",
        selected_topic_name: question.selected_topic_name || "",
        difficulty: question.difficulty || "normal"
    };
}

async function fetchRandomQuestionsOnce(subjectKey, topicKey, difficulty, limit, mode = "mcq") {
    const url = new URL(`${API_BASE_URL}/questions`);
    url.searchParams.set("subject_key", subjectKey);
    url.searchParams.set("topic_key", topicKey);
    url.searchParams.set("question_type", mode === "one_liner" ? "one_liner" : "mcq");
    if (difficulty && difficulty !== "all" && mode !== "one_liner") url.searchParams.set("difficulty", difficulty);
    url.searchParams.set("limit", String(Math.max(1, Math.min(200, Number(limit || 10)))));
    url.searchParams.set("t", String(Date.now()));
    const response = await apiFetch(`/questions?${url.searchParams.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) return [];
    return (data.questions || []).map(normalizeQuestion).filter((question) => mode === "one_liner" ? (isOneLinerQuestion(question) && !!clean(question.answer_text || question.answerText || question.answer)) : (!isOneLinerQuestion(question) && question.options && question.options.length >= 4 && question.options.every(Boolean) && question.answerIndex >= 0 && question.answerIndex <= 3));
}

async function fetchTopicPool(topicUnit, difficulty, totalLimit) {
    const requestLimit = Math.max(10, Math.min(200, Number(totalLimit || 10)));
    const oneLinerMode = isOneLinerTopicKey(topicUnit.topicKey);
    const fetchMode = oneLinerMode ? "one_liner" : "mcq";
    let questions = [];
    try { questions = await fetchRandomQuestionsOnce(topicUnit.subjectKey, topicUnit.topicKey, difficulty, requestLimit, fetchMode); } catch (_) {}
    const seen = new Set(); const unique = [];
    (questions || []).forEach((question) => {
        const key = finalQuestionKey(question); if (seen.has(key)) return; seen.add(key);
        unique.push({ ...question, selected_subject_key: topicUnit.subjectKey, selected_subject_name: topicUnit.subjectName, selected_topic_key: topicUnit.topicKey, selected_topic_name: topicUnit.topicName, subject_key: question.subject_key || topicUnit.subjectKey, subject_name: question.subject_name || topicUnit.subjectName, topic_key: question.topic_key || topicUnit.topicKey, topic_name: question.topic_name || topicUnit.topicName });
    });
    return { topic: topicUnit, questions: shuffleArray(unique) };
}

function finalQuestionKey(question) {
    if (isOneLinerQuestion(question)) {
        return `one:${normalizeText((question.question || question.question_text || "") + " " + (question.answer_text || question.answerText || question.answer || ""))}`;
    }

    return `q:${normalizeText((question.question || question.question_text || "") + " " + (question.options || []).join(" "))}`;
}

async function fetchQuestionsForTest(distribution, difficulty) {
    const totalLimit = distribution.reduce((sum, item) => sum + Number(item.questionLimit || 0), 0);
    const pools = [];

    for (const topicUnit of distribution) {
        pools.push(await fetchTopicPool(topicUnit, difficulty, totalLimit));
    }

    const topicCount = pools.length;
    const base = Math.floor(totalLimit / topicCount);
    let remainder = totalLimit % topicCount;

    const used = new Set();
    const selected = [];

    pools.forEach((pool) => {
        const quota = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;

        let taken = 0;

        for (const question of pool.questions) {
            if (taken >= quota) break;

            const key = finalQuestionKey(question);
            if (used.has(key)) continue;

            used.add(key);
            selected.push(question);
            taken++;
        }
    });

    if (selected.length < totalLimit) {
        const remaining = [];

        pools.forEach((pool) => {
            pool.questions.forEach((question) => {
                const key = finalQuestionKey(question);
                if (!used.has(key)) {
                    remaining.push(question);
                }
            });
        });

        shuffleArray(remaining).forEach((question) => {
            if (selected.length >= totalLimit) return;

            const key = finalQuestionKey(question);
            if (used.has(key)) return;

            used.add(key);
            selected.push(question);
        });
    }

    if (selected.length < totalLimit) {
        const availableText = pools
            .map((pool) => `${pool.topic.topicName}: ${pool.questions.length}`)
            .join("\n");

        throw new Error(
            `Selected topics में ${totalLimit} unique questions नहीं मिले। अभी ${selected.length} questions मिले।\n\nAvailable:\n${availableText}`
        );
    }

    return shuffleArray(selected.slice(0, totalLimit));
}


function isCurrentReadableMode() {
    return currentTestMeta && currentTestMeta.mode === "one_liner";
}

function setQuizChromeForOneLiner() {
    const topbar = document.querySelector(".quiz-topbar");
    const progress = document.querySelector(".progress-wrap");
    const actionsTop = document.querySelector(".quiz-actions-top");
    const actionsBottom = document.querySelector(".quiz-actions-bottom");

    [topbar, progress, actionsTop, actionsBottom].forEach((item) => {
        if (item) item.style.display = "none";
    });
}

function restoreQuizChrome() {
    const topbar = document.querySelector(".quiz-topbar");
    const progress = document.querySelector(".progress-wrap");
    const actionsTop = document.querySelector(".quiz-actions-top");
    const actionsBottom = document.querySelector(".quiz-actions-bottom");

    [topbar, progress, actionsTop, actionsBottom].forEach((item) => {
        if (item) item.style.display = "";
    });
}

function renderOneLinerReadableMode() {
    const area = byId("questionArea");
    if (!area) return;

    setQuizChromeForOneLiner();

    const topicText = (currentTestMeta && currentTestMeta.topics ? currentTestMeta.topics : [])
        .map((topic) => topic.topicName)
        .join(", ");

    const itemsHtml = currentQuestions.map((question, index) => {
        const qText = clean(question.question || question.question_text || "");
        const ansText = clean(question.answer_text || question.answerText || question.answer || question.correct_answer || "");

        return `
            <div class="one-liner-item">
                <div class="one-liner-question"><span>${index + 1}.</span> ${safeText(qText)}</div>
                <div class="one-liner-answer">उत्तर: ${safeText(ansText)}</div>
            </div>
        `;
    }).join("");

    area.innerHTML = `
        <div class="one-liner-readable-page">
            <div class="one-liner-readable-head">
                <h2>GK BY PURUSHOTAM SIR</h2>
                <h3>One-Liner Readable Mode</h3>
                <p>${safeText(getTestSubjectLabel())}${topicText ? " / " + safeText(topicText) : ""}</p>
                <p>Total Facts: ${currentQuestions.length}</p>
            </div>

            <div class="one-liner-list">
                ${itemsHtml}
            </div>

            <div class="one-liner-actions">
                <button type="button" class="result-btn purple-btn" id="oneLinerPdfBtn">One-Liner PDF</button>
                <button type="button" class="result-btn green-btn" id="oneLinerNewTestBtn">NEW TEST</button>
                <button type="button" class="result-btn gray-btn" id="oneLinerHomeBtn">HOME</button>
            </div>
        </div>
    `;

    const pdfBtn = byId("oneLinerPdfBtn");
    const newBtn = byId("oneLinerNewTestBtn");
    const homeBtn = byId("oneLinerHomeBtn");

    if (pdfBtn) pdfBtn.addEventListener("click", printOneLinerPdf);
    if (newBtn) newBtn.addEventListener("click", startNewTestSameSelection);
    if (homeBtn) homeBtn.addEventListener("click", goHome);

    window.scrollTo(0, 0);
}

async function startTest() {
    const setup = validateTestSetup(); if (!setup) return;
    const startBtn = byId("startTestBtn");
    try {
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = "Loading..."; }
        currentStudent = { student_id: currentAuthUser.id, student_name: currentProfile.full_name || currentAuthUser.email || "Student", roll_number: currentAuthUser.id.slice(0,8).toUpperCase(), test_count: 0, share_count: 5, is_unlocked: true };
        currentNegativeMarking = !!setup.negativeMarking;
        const rollInfo = byId("rollInfo"); if (rollInfo) rollInfo.textContent = `Student ID: ${currentStudent.roll_number}`;
        currentQuestions = await fetchQuestionsForTest(setup.distribution, setup.difficulty);
        if (!currentQuestions.length) { alert("Questions नहीं मिले।"); return; }
        currentQuestionIndex = 0; selectedAnswers = new Array(currentQuestions.length).fill(null); testSubmitted = false;
        const readableMode = setup.distribution.length === 1 && (isOneLinerTopicKey(setup.distribution[0].topicKey) || currentQuestions.every((question) => isOneLinerQuestion(question)));
        currentTestMeta = { subjectKey: setup.distribution.length === 1 ? setup.distribution[0].subjectKey : "multi_subject", subjectName: setup.distribution.length === 1 ? setup.distribution[0].subjectName : "Multiple Subjects", topics: setup.distribution, units: setup.distribution, difficulty: setup.difficulty, limit: setup.limit, totalQuestions: currentQuestions.length, mode: readableMode ? "one_liner" : "test", negativeMarking: currentNegativeMarking };
        if (readableMode) { if (timerInterval) clearInterval(timerInterval); timerInterval=null; totalElapsedSeconds=0; lastStats=null; lastServerResult=null; currentAnalysisIndex=0; showScreen("quiz"); renderOneLinerReadableMode(); return; }
        restoreQuizChrome(); testStartMs=Date.now(); totalTestMs=currentQuestions.length*PER_QUESTION_SECONDS*1000; testEndMs=testStartMs+totalTestMs; totalElapsedSeconds=0; lastStats=null; lastServerResult=null; currentAnalysisIndex=0; showScreen("quiz"); renderCurrentQuestion(true); startTimer();
    } catch (error) { console.error(error); alert(error.message || "Test start नहीं हो पाया।"); }
    finally { if (startBtn) { startBtn.disabled=false; startBtn.textContent="START TEST"; } }
}

function startTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
        updateTimerDisplay();

        const remaining = testEndMs - Date.now();

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            autoSubmitTest();
        }
    }, 500);

    updateTimerDisplay();
}

function updateTimerDisplay() {
    if (!currentQuestions.length || !currentTestMeta) return;

    const now = Date.now();
    const remainingMs = Math.max(0, testEndMs - now);
    totalElapsedSeconds = Math.ceil((now - testStartMs) / 1000);

    const timer = byId("quizTotalTimer");

    if (timer) {
        timer.textContent = formatMs(remainingMs);
    }

    const progress = byId("quizProgressFill");

    if (progress) {
        const completed = Math.min(100, ((now - testStartMs) / totalTestMs) * 100);
        progress.style.width = `${Math.max(0, completed)}%`;
    }
}

function getDisplayOptions(question) {
    let options = question.options;

    if (typeof options === "string") {
        try {
            options = JSON.parse(options);
        } catch (error) {
            options = [];
        }
    }

    if (!Array.isArray(options) || options.length < 4) {
        options = [
            question.option_a,
            question.option_b,
            question.option_c,
            question.option_d
        ];
    }

    options = options.map((item) => clean(item)).filter(Boolean);

    while (options.length < 4) {
        options.push("");
    }

    return options.slice(0, 4);
}

function removeInlineOptionsFromQuestion(rawText, options) {
    let text = clean(rawText);

    const optionTail = text.match(/\s(?:A[\.\)]?|\(A\)|क[\.\)]?|\(क\))\s+(.+?)\s(?:B[\.\)]?|\(B\)|ख[\.\)]?|\(ख\))\s+(.+?)\s(?:C[\.\)]?|\(C\)|ग[\.\)]?|\(ग\))\s+(.+?)\s(?:D[\.\)]?|\(D\)|घ[\.\)]?|\(घ\))\s+(.+)$/i);

    if (!optionTail) {
        return {
            questionText: text,
            options
        };
    }

    const extractedOptions = [
        clean(optionTail[1]),
        clean(optionTail[2]),
        clean(optionTail[3]),
        clean(optionTail[4])
    ];

    const questionText = text.slice(0, optionTail.index).trim();
    const hasRealOptions = options.filter(Boolean).length >= 4;

    return {
        questionText,
        options: hasRealOptions ? options : extractedOptions
    };
}

function splitStatementLines(text) {
    return clean(text)
        .replace(/\s+(?=(\d+|[०-९]+)\s*[\.\)]\s*)/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function splitConclusionLines(text) {
    return clean(text)
        .replace(/\s+(?=(I|II|III|IV|V|VI|VII|VIII|IX|X|i|ii|iii|iv|v|vi|vii|viii|ix|x)\s*[\.\)]\s*)/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

function prepareComplexQuestionLines(rawText) {
    let text = clean(rawText)
        .replace(/\s*\|\|\s*/g, "\n")
        .replace(/\s*\|\s*/g, "\n")
        .replace(/^Q\s*\d+\s*[\.\)]\s*/i, "")
        .replace(/^प्रश्न\s*\d+\s*[\.\)]\s*/i, "")
        .trim();

    const labelPattern = "(?:कथन|निष्कर्ष|अभिकथन|कारण|Assertion|Reason|Statement|Conclusion|सूची|List|Column|स्तम्भ)";
    const suffixPattern = "(?:\\s*(?:[-–—]?\\s*(?:\\d+|[०-९]+|I|II|III|IV|V|A|B|R)|\\([^)]{1,12}\\)))?";
    text = text.replace(new RegExp("\\s+(?=" + labelPattern + suffixPattern + "\\s*[:：])", "gi"), "\n");
    text = text.replace(/\s+(?=(?:I|II|III|IV|V|VI|VII|VIII|IX|X|\d+|[०-९]+)\s*[\.\)]\s+)/g, "\n");

    return text.split(/\n+/).map((line) => clean(line)).filter(Boolean);
}

function buildQuestionHtml(rawText, questionNumber) {
    const lines = prepareComplexQuestionLines(rawText);
    if (!lines.length) return `Q${questionNumber}.`;
    if (lines.length === 1) return `Q${questionNumber}. ${safeText(lines[0])}`;

    const headingRegex = /^((?:कथन|निष्कर्ष|अभिकथन|कारण|Assertion|Reason|Statement|Conclusion|सूची|List|Column|स्तम्भ)(?:\s*(?:[-–—]?\s*(?:\d+|[०-९]+|I|II|III|IV|V|A|B|R)|\([^)]{1,12}\)))?\s*[:：])\s*(.*)$/i;
    const numberedRegex = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|\d+|[०-९]+)\s*[\.\)]/i;
    let html = `<div class="complex-question-format">`;
    let hasMain = false;

    lines.forEach((line, index) => {
        const heading = line.match(headingRegex);
        if (heading) {
            html += `<div class="complex-heading"><span>${safeText(heading[1])}</span>${heading[2] ? `<b>${safeText(heading[2])}</b>` : ""}</div>`;
            return;
        }
        if (numberedRegex.test(line)) {
            html += `<div class="complex-numbered-line">${safeText(line)}</div>`;
            return;
        }
        if (!hasMain) {
            html += `<div class="main-question-line">Q${questionNumber}. ${safeText(line)}</div>`;
            hasMain = true;
        } else {
            html += `<div class="complex-detail-line">${safeText(line)}</div>`;
        }
    });

    if (!hasMain) html = `<div class="complex-question-format"><div class="main-question-line">Q${questionNumber}. नीचे दिए गए कथनों पर विचार कीजिए।</div>` + html.split('<div class="complex-question-format">')[1];
    html += `</div>`;
    return html;
}

function renderCurrentQuestion(shouldScrollTop = true) {
    if (!currentQuestions.length) return;

    if (isCurrentReadableMode()) {
        renderOneLinerReadableMode();
        return;
    }

    restoreQuizChrome();

    const question = currentQuestions[currentQuestionIndex];

    const numberBox = byId("quizQuestionNumber");
    const subjectTopicBox = byId("quizSubjectTopic");

    if (numberBox) {
        numberBox.textContent = `Q. ${currentQuestionIndex + 1}/${currentQuestions.length}`;
    }

    if (subjectTopicBox) {
        subjectTopicBox.textContent = `${question.selected_subject_name || question.subject_name || getTestSubjectLabel()} / ${question.selected_topic_name || question.topic_name}`;
    }

    const area = byId("questionArea");

    if (!area) return;

    const selected = selectedAnswers[currentQuestionIndex];
    const baseOptions = getDisplayOptions(question);
    const fixedData = removeInlineOptionsFromQuestion(question.question || question.question_text || "", baseOptions);
    const questionHtml = buildQuestionHtml(fixedData.questionText, currentQuestionIndex + 1);

    const optionsHtml = fixedData.options.slice(0, 4).map((option, index) => {
        const selectedClass = Number(selected) === index ? " selected" : "";

        return `
            <button type="button" class="option-btn${selectedClass}" data-option-index="${index}">
                <strong>${getOptionLetter(index)}.</strong> ${safeText(option)}
            </button>
        `;
    }).join("");

    area.innerHTML = `
        <div class="question-meta">
            <span>Subject: ${safeText(question.selected_subject_name || question.subject_name || getTestSubjectLabel())}</span>
            <span>Topic: ${safeText(question.selected_topic_name || question.topic_name)}</span>
            <span>Difficulty: ${safeText(question.difficulty || (currentTestMeta ? currentTestMeta.difficulty : ""))}</span>
        </div>

        <div class="question-box">
            <div class="question-text">${questionHtml}</div>
            <div class="options-list">
                ${optionsHtml}
            </div>
        </div>
    `;

    area.querySelectorAll("[data-option-index]").forEach((button) => {
        button.addEventListener("mousedown", (event) => {
            event.preventDefault();
        });

        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const state = captureScrollState();
            selectOption(Number(button.dataset.optionIndex), state);

            return false;
        });
    });

    const menuTestBtn = byId("menuTestBtn");
    const menuResultBtn = byId("menuResultBtn");
    const menuTopperBtn = byId("menuTopperBtn");
    const menuOneLinerBtn = byId("menuOneLinerBtn");

    if (menuTestBtn) menuTestBtn.addEventListener("click", startNewTestSameSelection);
    if (menuResultBtn) menuResultBtn.addEventListener("click", () => {
        if (lastStats) renderResult(lastStats, lastServerResult || {});
        else alert("अभी result available नहीं है। पहले test complete करें।");
    });
    if (menuTopperBtn) menuTopperBtn.addEventListener("click", openTopperList);
    if (menuOneLinerBtn) menuOneLinerBtn.addEventListener("click", () => {
        alert("One-Liner पढ़ने के लिए One-Liner topic select करके START TEST दबाएँ।");
        showScreen("setup");
    });

    const prevBtn = byId("prevBtn");
    const nextBtn = byId("nextBtn");

    if (prevBtn) prevBtn.disabled = currentQuestionIndex === 0;
    if (nextBtn) nextBtn.disabled = currentQuestionIndex === currentQuestions.length - 1;

    if (shouldScrollTop) {
        window.scrollTo(0, 0);
    }
}

function refreshOptionSelectionOnly() {
    const area = byId("questionArea");
    if (!area) return;

    const selected = selectedAnswers[currentQuestionIndex];

    area.querySelectorAll("[data-option-index]").forEach((button) => {
        const index = Number(button.dataset.optionIndex);
        button.classList.toggle("selected", Number(selected) === index);
    });
}

function selectOption(index, scrollState = null) {
    if (testSubmitted) return;

    const state = scrollState || captureScrollState();

    selectedAnswers[currentQuestionIndex] = index;

    refreshOptionSelectionOnly();
    restoreScrollStateHard(state);
}

function goPrevious() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderCurrentQuestion(true);
    }
}

function goNext() {
    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion(true);
    }
}

function skipQuestion() {
    if (testSubmitted) return;

    selectedAnswers[currentQuestionIndex] = null;

    if (currentQuestionIndex < currentQuestions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion(true);
    } else {
        openSubmitModal();
    }
}

function getAnsweredCount() {
    return selectedAnswers.filter((answer) => answer !== null && answer !== undefined).length;
}

function getNotAnsweredNumbers() {
    return selectedAnswers
        .map((answer, index) => {
            if (answer === null || answer === undefined) return index + 1;
            return null;
        })
        .filter((item) => item !== null);
}

function openStatusModal() {
    const modal = byId("statusModal");
    const grid = byId("questionStatusGrid");

    if (!modal || !grid) return;

    grid.innerHTML = currentQuestions.map((question, index) => {
        const answered = selectedAnswers[index] !== null && selectedAnswers[index] !== undefined;
        const statusClass = answered ? "answered" : "not-answered";
        const currentClass = index === currentQuestionIndex ? " current" : "";

        return `
            <button type="button" class="status-number-btn ${statusClass}${currentClass}" data-go-question="${index}">
                ${index + 1}
            </button>
        `;
    }).join("");

    grid.querySelectorAll("[data-go-question]").forEach((button) => {
        button.addEventListener("click", () => {
            currentQuestionIndex = Number(button.dataset.goQuestion);
            closeStatusModal();
            renderCurrentQuestion(true);
        });
    });

    modal.classList.remove("hidden");
}

function closeStatusModal() {
    const modal = byId("statusModal");

    if (modal) {
        modal.classList.add("hidden");
    }
}

function openSubmitModal() {
    const modal = byId("submitModal");
    const area = byId("submitSummaryArea");

    if (!modal || !area) return;

    const total = currentQuestions.length;
    const answered = getAnsweredCount();
    const notAnswered = total - answered;
    const notAnsweredNumbers = getNotAnsweredNumbers();

    area.innerHTML = `
        <h3>Test Submit करने से पहले Check करें</h3>
        <div>Total Questions: <strong>${total}</strong></div>
        <div>Answered: <strong>${answered}</strong></div>
        <div>Not Answered / Skipped: <strong>${notAnswered}</strong></div>
        ${
            notAnsweredNumbers.length
                ? `<div class="not-answered-list">Not Answered Questions: ${notAnsweredNumbers.join(", ")}</div>`
                : `<div class="not-answered-list" style="background:#dcfce7;border-color:#16a34a;color:#14532d;">सभी questions answered हैं।</div>`
        }
    `;

    modal.classList.remove("hidden");
}

function closeSubmitModal() {
    const modal = byId("submitModal");

    if (modal) {
        modal.classList.add("hidden");
    }
}

async function submitFinal() {
    closeSubmitModal();
    await finishTest();
}

async function autoSubmitTest() {
    if (testSubmitted) return;

    alert("Time खत्म हो गया। Test auto-submit हो रहा है।");
    await finishTest();
}

function calculateStats() {
    let correct=0, wrong=0, skipped=0; const subjectMap=new Map(), topicMap=new Map();
    currentQuestions.forEach((question,index)=>{
        const userAnswer=selectedAnswers[index], correctAnswer=Number(question.answerIndex);
        const subjectKey=question.selected_subject_key || question.subject_key || "other";
        const subjectName=question.selected_subject_name || question.subject_name || getSubjectName(subjectKey);
        const topicRaw=question.selected_topic_key || question.topic_key || "vividh";
        const topicKey=`${subjectKey}__${topicRaw}`;
        const topicName=question.selected_topic_name || question.topic_name || "विविध";
        if(!subjectMap.has(subjectKey)) subjectMap.set(subjectKey,{subjectKey,subjectName,total:0,correct:0,wrong:0,skipped:0});
        if(!topicMap.has(topicKey)) topicMap.set(topicKey,{subjectKey,subjectName,topicKey:topicRaw,topicName,total:0,correct:0,wrong:0,skipped:0});
        const s=subjectMap.get(subjectKey), t=topicMap.get(topicKey); s.total++; t.total++;
        if(userAnswer===null || userAnswer===undefined){skipped++;s.skipped++;t.skipped++;}
        else if(Number(userAnswer)===correctAnswer){correct++;s.correct++;t.correct++;}
        else{wrong++;s.wrong++;t.wrong++;}
    });
    const total=currentQuestions.length; const positiveMarks=correct*MARKS_PER_QUESTION; const negativeMarks=currentNegativeMarking?wrong*NEGATIVE_MARKS_VALUE:0; const scoreMarks=Math.max(0,positiveMarks-negativeMarks); const totalMarks=total*MARKS_PER_QUESTION; const percentage=totalMarks?Number(((scoreMarks/totalMarks)*100).toFixed(2)):0;
    const convert=(row)=>({...row,percentage:row.total?Number(((row.correct/row.total)*100).toFixed(2)):0});
    return {total,correct,wrong,skipped,scoreMarks,totalMarks,percentage,negativeMarking:currentNegativeMarking,negativeValue:currentNegativeMarking?NEGATIVE_MARKS_VALUE:0,marksPerQuestion:MARKS_PER_QUESTION,subjectStats:[...subjectMap.values()].map(convert),topicStats:[...topicMap.values()].map(convert)};
}

async function submitResultToServer(stats) {
    try {
        const topics=currentTestMeta && currentTestMeta.topics ? currentTestMeta.topics : [];
        const payload={auth_user_id:currentAuthUser.id,student_name:currentStudent?currentStudent.student_name:"Student",student_id:currentAuthUser.id,score:stats.scoreMarks,total_marks:stats.totalMarks,negative_marking:stats.negativeMarking?1:0,negative_value:stats.negativeValue,topic_key:topics.length===1?topics[0].topicKey:"multi_topic",topic_name:topics.length===1?topics[0].topicName:"Multiple Topics",total_questions:stats.total,correct_answers:stats.correct,wrong_answers:stats.wrong,skipped_questions:stats.skipped,percentage:stats.percentage,time_taken_seconds:totalElapsedSeconds,selected_units:topics,selected_subject:getTestSubjectLabel(),difficulty:currentTestMeta?currentTestMeta.difficulty:"all",subject_wise_result:stats.subjectStats,topic_wise_result:stats.topicStats};
        const response=await apiFetch('/submit-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data=await response.json().catch(()=>({})); if(!response.ok||!data.success){console.warn('Result save failed:',data);return{};} return {...data,...(data.result||{})};
    }catch(error){console.warn('Result submit error:',error);return{};}
}

async function finishTest() {
    if (testSubmitted) return;

    testSubmitted = true;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    totalElapsedSeconds = Math.ceil((Date.now() - testStartMs) / 1000);

    showScreen("result");

    const resultArea = byId("resultArea");

    if (resultArea) {
        resultArea.innerHTML = `
            <div style="text-align:center;font-size:20px;font-weight:900;padding:30px;">
                Result तैयार हो रहा है...
            </div>
        `;
    }

    const stats = calculateStats();
    const serverResult = await submitResultToServer(stats);

    lastStats = stats;
    lastServerResult = serverResult;

    renderResult(stats, serverResult);
    triggerCelebrationByPercentage(stats.percentage);
}

function getResultMessage(percentage) {
    if (percentage >= 80) {
        return {
            className: "excellent",
            title: "शानदार प्रदर्शन",
            line: "आपने बहुत बढ़िया तैयारी दिखाई है। अब 90%+ target कीजिए।"
        };
    }

    if (percentage >= 60) {
        return {
            className: "good",
            title: "अच्छा प्रयास",
            line: "आप सही दिशा में जा रहे हैं। थोड़ी revision से score 80%+ जा सकता है।"
        };
    }

    if (percentage >= 40) {
        return {
            className: "revision",
            title: "Revision की जरूरत है",
            line: "आपने attempt अच्छा किया। अब weak topics को दोबारा पढ़िए।"
        };
    }

    return {
        className: "motivation",
        title: "घबराइए नहीं",
        line: "हर topper की शुरुआत practice से ही होती है। Analysis देखकर गलत questions revise करें।"
    };
}

function getWeakArea(stats) {
    const allTopics = [...(stats.topicStats || [])];

    if (!allTopics.length) return "Overall Revision";

    const sorted = allTopics.sort((a, b) => {
        if (a.percentage !== b.percentage) return a.percentage - b.percentage;
        return b.wrong - a.wrong;
    });

    const weak = sorted[0];

    if (!weak) return "Overall Revision";
    if (weak.percentage >= 70) return "Overall ठीक है";

    return `${weak.topicName}`;
}

function buildPerformanceTable(title, rows, type) {
    const body = rows.map((row) => {
        const name = type === "subject"
            ? row.subjectName
            : row.topicName;

        return `
            <div class="performance-row">
                <div>${safeText(name)}</div>
                <div>${row.total}</div>
                <div>${row.correct}</div>
                <div>${row.wrong}</div>
                <div>${row.skipped}</div>
                <div>${row.percentage}%</div>
            </div>
        `;
    }).join("");

    return `
        <div class="performance-box">
            <h3>${title}</h3>
            <div class="performance-row header">
                <div>Name</div>
                <div>Total</div>
                <div>Correct</div>
                <div>Wrong</div>
                <div>Skip</div>
                <div>%</div>
            </div>
            ${body}
        </div>
    `;
}

function getTelegramPromoHtml() {
    return `
        <div class="channel-box">
            <div class="channel-title">Free Study Channels Join करें</div>
            <div class="channel-buttons">
                <a href="${YOUTUBE_CHANNEL_LINK}" target="_blank" rel="noopener" class="youtube-btn">Subscribe YouTube</a>
                <a href="${TELEGRAM_CHANNEL_LINK}" target="_blank" rel="noopener" class="telegram-btn">Join Telegram</a>
            </div>
        </div>
    `;
}


function getLogoWatermarkHtml() {
    return `<img class="pdf-watermark-logo" src="assets/logo.webp" alt="GK BY PURUSHOTAM SIR Logo">`;
}

function buildOneLinerPrintableHtml() {
    const topicsText = currentTestMeta && currentTestMeta.topics
        ? currentTestMeta.topics.map((topic) => topic.topicName).join(", ")
        : "One-Liner";

    const itemsHtml = currentQuestions.map((question, index) => {
        const qText = clean(question.question || question.question_text || "");
        const ansText = clean(question.answer_text || question.answerText || question.answer || "");
        return `
            <div class="pdf-question-block">
                <div class="pdf-question">${index + 1}. ${safeText(qText)}</div>
                <div class="pdf-answer one-liner-pdf-answer"><strong>उत्तर:</strong> ${safeText(ansText)}</div>
            </div>
        `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>GK BY PURUSHOTAM SIR - One-Liner PDF</title>
<style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 18mm 14mm; font-family: Arial, "Nirmala UI", sans-serif; color: #111; background: #fff; position: relative; }
    .pdf-watermark-logo { position: fixed; top: 50%; left: 50%; width: 55%; max-width: 520px; opacity: 0.08; transform: translate(-50%, -50%); z-index: 0; }
    .pdf-content { position: relative; z-index: 1; }
    .pdf-head { text-align: center; border: 2px solid #111; padding: 10px; margin-bottom: 14px; background: rgba(255,255,255,0.92); }
    .pdf-head h1 { margin: 0; font-size: 24px; font-weight: 900; }
    .pdf-head h2 { margin: 6px 0 0; font-size: 19px; font-weight: 900; }
    .pdf-topic { font-size: 15px; font-weight: 800; margin-bottom: 14px; }
    .pdf-question-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; padding: 9px; border: 1px solid #ddd; border-radius: 8px; background: rgba(255,255,255,0.92); }
    .pdf-question { font-size: 16px; font-weight: 850; line-height: 1.45; white-space: pre-wrap; }
    .pdf-answer { margin-top: 6px; font-size: 15px; font-weight: 850; color: #166534; line-height: 1.4; }
    @media print { body { padding: 14mm; } }
</style>
</head>
<body>
    ${getLogoWatermarkHtml()}
    <div class="pdf-content">
        <div class="pdf-head">
            <h1>GK BY PURUSHOTAM SIR</h1>
            <h2>Haryana GK One-Liner Notes</h2>
        </div>
        <div class="pdf-topic">Topic: ${safeText(topicsText)} | Total Facts: ${currentQuestions.length}</div>
        ${itemsHtml}
    </div>
</body>
</html>`;
}

function printOneLinerPdf() {
    if (!currentQuestions.length) {
        alert("One-Liner PDF बनाने के लिए पहले One-Liner topic open करें।");
        return;
    }

    const hasOneLinerData = currentQuestions.some((question) => isOneLinerQuestion(question)) || isCurrentReadableMode();

    if (!hasOneLinerData) {
        alert("One-Liner PDF के लिए One-Liner topic select करके START TEST दबाएँ।");
        return;
    }

    openPrintableWindow(buildOneLinerPrintableHtml(), "GK BY PURUSHOTAM SIR - One-Liner PDF");
}

function isShareLocked(student) {
    if (!student) return false;
    return Number(student.test_count || 0) >= SHARE_UNLOCK_TEST_LIMIT && !student.is_unlocked;
}

function getShareText() {
    return "GK BY PURUSHOTAM SIR Haryana GK Mock Test App - Free practice test, PDF और topper list के साथ।";
}

async function recordShareClick() {
    if (!currentStudent) return { share_count: 0, is_unlocked: false };

    const response = await apiFetch(`/share-click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            student_id: currentStudent.student_id,
            auth_user_id: currentAuthUser ? currentAuthUser.id : ""
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
        throw new Error(data.error || "Share progress save नहीं हुआ।");
    }

    currentStudent.share_count = Number(data.share_count || 0);
    currentStudent.is_unlocked = !!data.is_unlocked;

    return data;
}

function openShareUnlockModal(student) {
    const old = document.getElementById("shareUnlockOverlay");
    if (old) old.remove();

    const shareCount = Math.min(SHARE_UNLOCK_REQUIRED, Number(student.share_count || 0));
    const overlay = document.createElement("div");
    overlay.id = "shareUnlockOverlay";
    overlay.className = "pdf-choice-overlay share-unlock-overlay";
    overlay.innerHTML = `
        <div class="pdf-choice-card share-unlock-card">
            <h2>Free Mock Test Unlock</h2>
            <p>आपने ${SHARE_UNLOCK_TEST_LIMIT} test पूरे कर लिए हैं। आगे के सारे mock test free unlock करने के लिए app को 5 दोस्तों/ग्रुप में share करें। यह काम केवल एक बार होगा।</p>
            <div class="share-progress-text" id="shareProgressText">Share Progress: ${shareCount}/${SHARE_UNLOCK_REQUIRED}</div>
            <button type="button" class="pdf-choice-btn" id="shareNowBtn">Share Now</button>
            <button type="button" class="pdf-choice-btn both" id="shareCheckBtn">Unlock Check</button>
            <button type="button" class="pdf-choice-btn gray-share-btn" id="shareCloseBtn">Back</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const updateText = () => {
        const progress = byId("shareProgressText");
        if (progress) progress.textContent = `Share Progress: ${Math.min(SHARE_UNLOCK_REQUIRED, Number(currentStudent.share_count || 0))}/${SHARE_UNLOCK_REQUIRED}`;
    };

    byId("shareCloseBtn").addEventListener("click", close);
    byId("shareCheckBtn").addEventListener("click", () => {
        if (currentStudent && currentStudent.is_unlocked) {
            close();
            alert("Mock test unlock हो गए हैं। अब START TEST दोबारा दबाएँ।");
        } else {
            updateText();
            alert("अभी 5 share पूरे नहीं हुए हैं।");
        }
    });

    byId("shareNowBtn").addEventListener("click", async () => {
        try {
            const shareUrl = window.location.href.split("#")[0];
            const shareText = getShareText();

            if (navigator.share) {
                try {
                    await navigator.share({ title: "GK BY PURUSHOTAM SIR", text: shareText, url: shareUrl });
                } catch (err) {
                    return;
                }
            } else {
                const wa = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
                window.open(wa, "_blank");
            }

            const data = await recordShareClick();
            updateText();

            if (data.is_unlocked) {
                alert("धन्यवाद भाई! आगे के सारे mock test free unlock हो गए हैं।");
                close();
            }
        } catch (error) {
            alert(error.message || "Share count save नहीं हुआ।");
        }
    });
}

async function openTopperList() {
    showScreen("result");
    const resultArea = byId("resultArea");
    if (!resultArea) return;

    resultArea.innerHTML = `${buildResultTabPatti("topper")}<div style="text-align:center;font-size:20px;font-weight:900;padding:30px;">Topper List loading...</div>`;
    bindResultTabPatti();

    try {
        const response = await apiFetch(`/topper-list?limit=30&t=${Date.now()}`);
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Topper list load नहीं हुई।");
        }

        lastTopperData = data.toppers || [];
        renderTopperList(lastTopperData);
    } catch (error) {
        resultArea.innerHTML = `${buildResultTabPatti("topper")}<div class="result-message revision"><h2>Topper List</h2><p>${safeText(error.message || "Topper list load नहीं हुई।")}</p></div>`;
        bindResultTabPatti();
    }
}

function maskMobile(value) {
    const mobile = clean(value);
    if (mobile.length < 4) return "";
    return `${mobile.slice(0, 2)}XXXXXX${mobile.slice(-2)}`;
}

function renderTopperSection(title, rows) {
    if (!rows.length) {
        return `
            <div class="topper-section">
                <h3>${safeText(title)}</h3>
                <div class="topper-empty">अभी 80%+ topper उपलब्ध नहीं है।</div>
            </div>
        `;
    }

    const body = rows.map((row, index) => {
        const neg = Number(row.negative_marking || 0) === 1;
        return `
            <div class="topper-card">
                <div class="topper-rank">#${index + 1}</div>
                <div class="topper-info">
                    <h4>${safeText(row.student_name || "Student")}</h4>
                    <p>${maskMobile(row.mobile)} ${row.roll_info ? " | " + safeText(row.roll_info) : ""}</p>
                    <p>Topic: ${safeText(row.topic_name || "Multiple Topics")}</p>
                    <p>Difficulty: ${safeText(String(row.difficulty || "normal").toUpperCase())}</p>
                    <p class="topper-mode">${neg ? "Negative Marking Mode में Topper" : "Without Negative Marking Mode"}</p>
                </div>
                <div class="topper-score">
                    <strong>${formatScore(row.score_marks)}/${formatScore(row.total_marks)}</strong>
                    <span>${formatScore(row.percentage)}%</span>
                    <small>Time: ${formatTime(Number(row.time_taken || 0))}</small>
                </div>
            </div>
        `;
    }).join("");

    return `<div class="topper-section"><h3>${safeText(title)}</h3>${body}</div>`;
}

function renderTopperList(rows) {
    const resultArea = byId("resultArea");
    if (!resultArea) return;

    const withoutNegative = rows.filter((row) => Number(row.negative_marking || 0) !== 1);
    const withNegative = rows.filter((row) => Number(row.negative_marking || 0) === 1);

    resultArea.innerHTML = `
        <div class="topper-page">
            ${buildResultTabPatti("topper")}
            <h2 class="result-title">🏆 Topper List</h2>
            <div class="topper-note">Topper list में केवल ${TOPPER_MIN_PERCENTAGE}%+ वाले बच्चे आएंगे। Same score पर कम time वाला ऊपर रहेगा।</div>
            ${renderTopperSection("Topper List - Without Negative Marking", withoutNegative)}
            ${renderTopperSection("Topper List - Negative Marking", withNegative)}
            <div class="result-actions">
                <button type="button" class="result-btn green-btn" id="topperNewTestBtn">NEW TEST</button>
                <button type="button" class="result-btn gray-btn" id="topperHomeBtn">HOME</button>
            </div>
        </div>
    `;

    bindResultTabPatti();

    const newBtn = byId("topperNewTestBtn");
    const homeBtn = byId("topperHomeBtn");
    if (newBtn) newBtn.addEventListener("click", startNewTestSameSelection);
    if (homeBtn) homeBtn.addEventListener("click", goHome);
}


function openPdfOptionsModal() {
    if (!currentQuestions.length || !lastStats) {
        alert("PDF बनाने के लिए test result available नहीं है।");
        return;
    }

    const old = document.getElementById("pdfChoiceOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "pdfChoiceOverlay";
    overlay.className = "pdf-choice-overlay";
    overlay.innerHTML = `
        <div class="pdf-choice-card">
            <button type="button" class="pdf-choice-close" id="pdfChoiceCloseBtn">×</button>
            <h2>PDF Option चुनें</h2>
            <p>जो questions बच्चे ने test में लगाए हैं, PDF केवल उन्हीं questions की बनेगी।</p>
            <button type="button" class="pdf-choice-btn" id="pdfWithoutBtn">Without Answer PDF</button>
            <button type="button" class="pdf-choice-btn" id="pdfWithBtn">With Answer PDF</button>
            <button type="button" class="pdf-choice-btn both" id="pdfBothBtn">Both PDF</button>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    byId("pdfChoiceCloseBtn").addEventListener("click", close);
    byId("pdfWithoutBtn").addEventListener("click", () => { close(); printTestPdf("without"); });
    byId("pdfWithBtn").addEventListener("click", () => { close(); printTestPdf("with"); });
    byId("pdfBothBtn").addEventListener("click", () => {
        close();
        printTestPdf("without");
        printTestPdf("with");
    });
}

function getPdfFileTitle(mode) {
    const studentName = currentStudent && currentStudent.student_name ? currentStudent.student_name : "Student";
    const suffix = mode === "with" ? "With Answer" : "Without Answer";
    return `GK BY PURUSHOTAM SIR - ${studentName} - ${suffix}`;
}

function buildPrintableQuestionHtml(question, index, mode) {
    const baseOptions = getDisplayOptions(question);
    const fixedData = removeInlineOptionsFromQuestion(question.question || question.question_text || "", baseOptions);
    const qText = clean(fixedData.questionText);
    const options = fixedData.options.slice(0, 4);

    const optionHtml = options.map((option, optIndex) => {
        return `<div class="pdf-option">(${getOptionLetter(optIndex)}) ${safeText(option)}</div>`;
    }).join("");

    let answerHtml = "";

    if (mode === "with") {
        answerHtml = `
            <div class="pdf-answer"><strong>उत्तर:</strong> (${getOptionLetter(question.answerIndex)}) ${safeText(options[question.answerIndex] || "")}</div>
            <div class="pdf-exp"><strong>व्याख्या:</strong> ${safeText(question.explanation || "")}</div>
        `;
    }

    return `
        <div class="pdf-question-block">
            <div class="pdf-question">प्रश्न ${index + 1}. ${safeText(qText)}</div>
            <div class="pdf-options">${optionHtml}</div>
            ${answerHtml}
        </div>
    `;
}

function buildPrintableHtml(mode) {
    const studentName = currentStudent && currentStudent.student_name ? currentStudent.student_name : "";
    const rollNumber = currentStudent ? (currentStudent.roll_number || currentStudent.student_id || "") : "";
    const topicsText = currentTestMeta && currentTestMeta.topics
        ? currentTestMeta.topics.map((topic) => topic.topicName).join(", ")
        : "";

    const questionHtml = currentQuestions.map((question, index) => buildPrintableQuestionHtml(question, index, mode)).join("");
    const title = mode === "with" ? "Practice Test - With Answer" : "Practice Test - Without Answer";

    return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<title>${safeText(getPdfFileTitle(mode))}</title>
<style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px; font-family: Arial, "Nirmala UI", sans-serif; color: #111; background: #fff; position: relative; }
    .pdf-watermark-logo { position: fixed; top: 50%; left: 50%; width: 55%; max-width: 520px; opacity: 0.08; transform: translate(-50%, -50%); z-index: 0; }
    .pdf-content { position: relative; z-index: 1; }
    .pdf-head { text-align: center; border: 2px solid #111; padding: 10px; margin-bottom: 14px; background: rgba(255,255,255,0.92); }
    .pdf-head h1 { margin: 0; font-size: 24px; font-weight: 900; }
    .pdf-head h2 { margin: 6px 0 0; font-size: 19px; font-weight: 900; }
    .pdf-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin: 12px 0; font-size: 14px; font-weight: 700; }
    .pdf-line { border-bottom: 1px solid #555; display: inline-block; min-width: 170px; height: 16px; }
    .pdf-topic { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
    .pdf-question-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px dashed #999; }
    .pdf-question { font-size: 16px; font-weight: 800; line-height: 1.45; margin-bottom: 8px; white-space: pre-wrap; }
    .pdf-options { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; font-size: 15px; line-height: 1.35; }
    .pdf-option { border: 1px solid #ddd; border-radius: 6px; padding: 6px; min-height: 28px; }
    .pdf-answer { margin-top: 8px; padding: 7px; border: 1px solid #111; font-size: 15px; font-weight: 800; }
    .pdf-exp { margin-top: 6px; padding: 7px; background: #f5f5f5; border: 1px solid #ccc; font-size: 14px; line-height: 1.4; }
    @media print { body { padding: 14mm; } .no-print { display: none !important; } }
</style>
</head>
<body>
    ${getLogoWatermarkHtml()}
    <div class="pdf-content">
    <div class="pdf-head">
        <h1>GK BY PURUSHOTAM SIR</h1>
        <h2>Haryana GK ${safeText(title)}</h2>
    </div>

    <div class="pdf-meta">
        <div>नाम: ${mode === "without" ? '<span class="pdf-line"></span>' : safeText(studentName)}</div>
        <div>दिनांक: <span class="pdf-line"></span></div>
        <div>Student ID: ${safeText(rollNumber)}</div>
        <div>कुल प्रश्न: ${currentQuestions.length}</div>
        <div>समय: <span class="pdf-line"></span></div>
        <div>Score: ${mode === "without" ? '<span class="pdf-line"></span>' : `${lastStats ? formatScore(lastStats.scoreMarks) : 0}/${lastStats ? formatScore(lastStats.totalMarks) : currentQuestions.length * MARKS_PER_QUESTION}`}</div>
    </div>

    <div class="pdf-topic">Topic: ${safeText(topicsText)}</div>

    ${questionHtml}
    </div>

</body>
</html>`;
}


function openPrintableWindow(html, titleText) {
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
        alert("PDF window block हो गई है। Browser popup allow करें या One-Liner PDF button दोबारा दबाएँ।");
        return;
    }

    printWindow.document.open();
    printWindow.document.write(html.replace("</body>", `
        <div style="position:fixed;right:12px;bottom:12px;z-index:99999;background:#ffffff;border:2px solid #111;border-radius:10px;padding:10px;box-shadow:0 4px 18px rgba(0,0,0,.18);font-family:Arial,sans-serif;">
            <button onclick="window.print()" style="background:#0f766e;color:white;border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer;">Save / Print PDF</button>
        </div>
        <script>
            window.addEventListener('load', function () {
                setTimeout(function () { window.focus(); window.print(); }, 700);
            });
        <\/script>
    </body>`));
    printWindow.document.close();
}

function openPrintableFrame(html, titleText) {
    const oldFrame = document.getElementById("directPrintFrame");
    if (oldFrame) oldFrame.remove();

    const frame = document.createElement("iframe");
    frame.id = "directPrintFrame";
    frame.title = titleText || "GK BY PURUSHOTAM SIR PDF";
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";

    document.body.appendChild(frame);

    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    frame.onload = function () {
        setTimeout(function () {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            } catch (error) {
                alert("PDF print/download open नहीं हुआ। Browser में print allow करके दोबारा दबाएँ।");
            }
        }, 450);
    };
}

function printTestPdf(mode) {
    const title = getPdfFileTitle(mode);
    openPrintableFrame(buildPrintableHtml(mode), title);
}


function buildResultTabPatti(activeTab) {
    const active = clean(activeTab || "result").toLowerCase();
    return `
        <div class="result-tab-patti" role="tablist" aria-label="Result Options">
            <button type="button" class="result-tab-btn ${active === "result" ? "active" : ""}" id="resultTabResultBtn">Result</button>
            <button type="button" class="result-tab-btn ${active === "topper" ? "active" : ""}" id="resultTabTopperBtn">Topper List</button>
            <button type="button" class="result-tab-btn ${active === "pdf" ? "active" : ""}" id="resultTabPdfBtn">PDF</button>
            <button type="button" class="result-tab-btn ${active === "newtest" ? "active" : ""}" id="resultTabNewTestBtn">New Test</button>
        </div>
    `;
}

function bindResultTabPatti() {
    const resultTabBtn = byId("resultTabResultBtn");
    const topperTabBtn = byId("resultTabTopperBtn");
    const pdfTabBtn = byId("resultTabPdfBtn");
    const newTestTabBtn = byId("resultTabNewTestBtn");

    if (resultTabBtn) resultTabBtn.addEventListener("click", () => {
        if (lastStats) renderResult(lastStats, lastServerResult || {});
    });

    if (topperTabBtn) topperTabBtn.addEventListener("click", openTopperList);
    if (pdfTabBtn) pdfTabBtn.addEventListener("click", renderPdfDownloadTab);
    if (newTestTabBtn) newTestTabBtn.addEventListener("click", startNewTestSameSelection);
}

function renderPdfDownloadTab() {
    const resultArea = byId("resultArea");

    if (!resultArea) return;

    if (!currentQuestions.length || !lastStats) {
        alert("PDF बनाने के लिए पहले test complete करें।");
        return;
    }

    resultArea.innerHTML = `
        ${buildResultTabPatti("pdf")}
        <div class="pdf-download-tab-panel">
            <h2 class="result-title">📄 PDF Download</h2>
            <p class="pdf-download-note">जिस button पर click करेंगे, PDF print/download window सीधे खुल जाएगी। इसमें केवल इसी test के questions रहेंगे।</p>
            <div class="pdf-direct-actions easy-pdf-actions">
                <button type="button" class="result-btn purple-btn" id="pdfDirectWithoutBtn">⬇️ Without Answer PDF</button>
                <button type="button" class="result-btn blue-btn" id="pdfDirectWithBtn">⬇️ With Answer PDF</button>
                <button type="button" class="result-btn green-btn" id="pdfDirectBothBtn">⬇️ Both PDF</button>
            </div>
            <div class="pdf-download-help">
                <p><strong>Without Answer:</strong> बच्चे को test paper जैसा PDF मिलेगा।</p>
                <p><strong>With Answer:</strong> answer और explanation के साथ मिलान वाली PDF मिलेगी।</p>
                <p><strong>Both:</strong> दोनों PDF एक-एक करके खुलेंगी।</p>
            </div>
        </div>
    `;

    bindResultTabPatti();

    const withoutBtn = byId("pdfDirectWithoutBtn");
    const withBtn = byId("pdfDirectWithBtn");
    const bothBtn = byId("pdfDirectBothBtn");

    if (withoutBtn) withoutBtn.addEventListener("click", () => printTestPdf("without"));
    if (withBtn) withBtn.addEventListener("click", () => printTestPdf("with"));
    if (bothBtn) bothBtn.addEventListener("click", () => {
        printTestPdf("without");
        setTimeout(() => printTestPdf("with"), 1200);
    });
}

function renderResult(stats, serverResult) {
    const resultArea = byId("resultArea");

    if (!resultArea) return;

    const message = getResultMessage(stats.percentage);

    const studentName = currentStudent ? currentStudent.student_name : "";
    const rollNumber = currentStudent ? currentStudent.roll_number || currentStudent.student_id || "" : "";

    const selectedTopicsText = (currentTestMeta.topics || []).map((topic) => topic.topicName).join(", ");

    resultArea.innerHTML = `
        ${buildResultTabPatti("result")}
        <h2 class="result-title">आपका Result</h2>

        <div class="result-message ${message.className}">
            <h2>${safeText(message.title)}</h2>
            <p>${safeText(message.line)}</p>
        </div>

        <div class="result-grid">
            <div class="result-item"><span>Student Name</span>${safeText(studentName)}</div>
            <div class="result-item"><span>Student ID</span>${safeText(rollNumber)}</div>
            <div class="result-item"><span>Subject</span>${safeText(getTestSubjectLabel())}</div>
            <div class="result-item"><span>Difficulty</span>${safeText((currentTestMeta.difficulty || "").toUpperCase())}</div>
            <div class="result-item"><span>Selected Topics</span>${safeText(selectedTopicsText)}</div>
            <div class="result-item"><span>Total Questions</span>${stats.total}</div>
            <div class="result-item"><span>Correct</span>${stats.correct}</div>
            <div class="result-item"><span>Wrong</span>${stats.wrong}</div>
            <div class="result-item"><span>Skipped / Not Answered</span>${stats.skipped}</div>
            <div class="result-item"><span>Score</span>${formatScore(stats.scoreMarks)}/${formatScore(stats.totalMarks)}</div>
            <div class="result-item"><span>Negative Marking</span>${stats.negativeMarking ? "ON (-0.25)" : "OFF"}</div>
            <div class="result-item"><span>Percentage</span>${formatScore(stats.percentage)}%</div>
            <div class="result-item"><span>Time Taken</span>${formatTime(totalElapsedSeconds)}</div>
            <div class="result-item"><span>Weak Area</span>${safeText(getWeakArea(stats))}</div>
        </div>

        ${buildPerformanceTable("Subject-wise Performance", stats.subjectStats, "subject")}
        ${buildPerformanceTable("Topic-wise Performance", stats.topicStats, "topic")}

        <div class="result-actions">
            <button type="button" class="result-btn blue-btn" id="analyzeBtn">ANALYZE</button>
            <button type="button" class="result-btn green-btn" id="newTestBtn">NEW TEST</button>
            <button type="button" class="result-btn gray-btn" id="homeBtn">HOME</button>
        </div>

        ${getTelegramPromoHtml()}
    `;

    const analyzeBtn = byId("analyzeBtn");
    const newTestBtn = byId("newTestBtn");
    const homeBtn = byId("homeBtn");

    bindResultTabPatti();

    if (analyzeBtn) analyzeBtn.addEventListener("click", openAnalysis);
    if (newTestBtn) newTestBtn.addEventListener("click", startNewTestSameSelection);
    if (homeBtn) homeBtn.addEventListener("click", goHome);

    showScreen("result");
}

function getAnswerText(question, index) {
    const answerIndex = Number(index);

    if (answerIndex < 0 || answerIndex > 3 || Number.isNaN(answerIndex)) {
        return "Not Answered";
    }

    return `${getOptionLetter(answerIndex)}. ${question.options[answerIndex] || ""}`;
}

function getAnalysisStatus(question, userAnswer) {
    if (userAnswer === null || userAnswer === undefined) {
        return {
            text: "Skipped",
            pillClass: "analysis-status-skipped",
            answerClass: "your-answer-skipped"
        };
    }

    if (Number(userAnswer) === Number(question.answerIndex)) {
        return {
            text: "Correct",
            pillClass: "analysis-status-correct",
            answerClass: "your-answer-correct"
        };
    }

    return {
        text: "Wrong",
        pillClass: "analysis-status-wrong",
        answerClass: "your-answer-wrong"
    };
}

function openAnalysis() {
    currentAnalysisIndex = 0;
    renderAnalysis();
}

function renderAnalysis() {
    showScreen("result");

    const resultArea = byId("resultArea");

    if (!resultArea) return;

    if (currentAnalysisIndex >= currentQuestions.length) {
        resultArea.innerHTML = `
            <div class="analysis-page">
                <div class="analysis-complete">Analysis Complete</div>

                <div class="analysis-actions">
                    <button type="button" class="analysis-btn gray-btn" id="analysisPrevEndBtn">PREVIOUS</button>
                    <button type="button" class="analysis-btn blue-btn" id="analysisResultEndBtn">RESULT</button>
                    <button type="button" class="analysis-btn green-btn" id="analysisNewEndBtn">NEW TEST</button>
                    <button type="button" class="analysis-btn gray-btn" id="analysisHomeEndBtn">HOME</button>
                </div>
            </div>
        `;

        const prevEndBtn = byId("analysisPrevEndBtn");
        const resultEndBtn = byId("analysisResultEndBtn");
        const newEndBtn = byId("analysisNewEndBtn");
        const homeEndBtn = byId("analysisHomeEndBtn");

        if (prevEndBtn) prevEndBtn.addEventListener("click", analysisPrevious);
        if (resultEndBtn) resultEndBtn.addEventListener("click", backToResult);
        if (newEndBtn) newEndBtn.addEventListener("click", startNewTestSameSelection);
        if (homeEndBtn) homeEndBtn.addEventListener("click", goHome);

        return;
    }

    const question = currentQuestions[currentAnalysisIndex];
    const userAnswer = selectedAnswers[currentAnalysisIndex];
    const correctAnswer = question.answerIndex;
    const status = getAnalysisStatus(question, userAnswer);

    const baseOptions = getDisplayOptions(question);
    const fixedData = removeInlineOptionsFromQuestion(question.question || question.question_text || "", baseOptions);
    const questionHtml = buildQuestionHtml(fixedData.questionText, currentAnalysisIndex + 1);

    resultArea.innerHTML = `
        <div class="analysis-page">
            <div class="analysis-head">
                <div class="analysis-pill">Q. ${currentAnalysisIndex + 1}/${currentQuestions.length}</div>
                <div class="analysis-pill">${safeText(question.selected_subject_name || question.subject_name || getTestSubjectLabel())} / ${safeText(question.selected_topic_name || question.topic_name)}</div>
                <div class="analysis-pill ${status.pillClass}">${safeText(status.text)}</div>
            </div>

            <div class="analysis-question">
                ${questionHtml}
            </div>

            <div class="analysis-box ${status.answerClass}">
                <strong>Your Answer:</strong> ${safeText(getAnswerText(question, userAnswer))}
            </div>

            <div class="analysis-box correct-answer-box">
                <strong>Correct Answer:</strong> ${safeText(getAnswerText(question, correctAnswer))}
            </div>

            <div class="analysis-box explanation-box">
                <strong>Explanation:</strong> ${safeText(question.explanation || "Explanation available नहीं है।")}
            </div>

            <div class="analysis-actions">
                <button type="button" class="analysis-btn gray-btn" id="analysisPrevBtn" ${currentAnalysisIndex === 0 ? "disabled" : ""}>PREVIOUS</button>
                <button type="button" class="analysis-btn blue-btn" id="analysisNextBtn">NEXT</button>
                <button type="button" class="analysis-btn purple-btn" id="analysisResultBtn">RESULT</button>
                <button type="button" class="analysis-btn green-btn" id="analysisNewBtn">NEW TEST</button>
                <button type="button" class="analysis-btn gray-btn" id="analysisHomeBtn">HOME</button>
            </div>
        </div>
    `;

    const prevBtn = byId("analysisPrevBtn");
    const nextBtn = byId("analysisNextBtn");
    const resultBtn = byId("analysisResultBtn");
    const newBtn = byId("analysisNewBtn");
    const homeBtn = byId("analysisHomeBtn");

    if (prevBtn) prevBtn.addEventListener("click", analysisPrevious);
    if (nextBtn) nextBtn.addEventListener("click", analysisNext);
    if (resultBtn) resultBtn.addEventListener("click", backToResult);
    if (newBtn) newBtn.addEventListener("click", startNewTestSameSelection);
    if (homeBtn) homeBtn.addEventListener("click", goHome);
}

function analysisPrevious() {
    if (currentAnalysisIndex > 0) {
        currentAnalysisIndex--;
        renderAnalysis();
    }
}

function analysisNext() {
    if (currentAnalysisIndex < currentQuestions.length) {
        currentAnalysisIndex++;
        renderAnalysis();
    }
}

function backToResult() {
    if (lastStats) {
        renderResult(lastStats, lastServerResult || {});
    }
}

function resetTestOnly() {
    restoreQuizChrome();
    currentQuestions = [];
    currentQuestionIndex = 0;
    selectedAnswers = [];
    testSubmitted = false;
    currentTestMeta = null;
    currentAnalysisIndex = 0;
    lastStats = null;
    lastServerResult = null;
    totalElapsedSeconds = 0;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function startNewTestSameSelection() {
    resetTestOnly();
    showScreen("setup");
    renderTopics();
    updateLimitOptions();
}

function goHome() {
    resetTestOnly(); selectedTopics=[]; topicIdCounter=1;
    const rollInfo=byId("rollInfo"); if(rollInfo && currentAuthUser) rollInfo.textContent=`Student ID: ${currentAuthUser.id.slice(0,8).toUpperCase()}`;
    addTopic(); showScreen("setup");
}

function triggerCelebrationByPercentage(percentage) {
    const layer = byId("celebrationLayer");

    if (!layer) return;

    layer.innerHTML = "";
    layer.classList.remove("hidden");

    let items = [];
    let className = "confetti-piece";

    if (percentage >= 80) {
        items = ["🎉", "🎈", "⭐", "✨", "🎊"];
        className = "confetti-piece";
    } else if (percentage >= 60) {
        items = ["⭐", "👏", "✨", "🌟"];
        className = "star-piece";
    } else {
        layer.classList.add("hidden");
        return;
    }

    for (let i = 0; i < 42; i++) {
        const span = document.createElement("span");

        span.className = className;
        span.textContent = items[Math.floor(Math.random() * items.length)];
        span.style.left = `${Math.random() * 100}%`;
        span.style.animationDelay = `${Math.random() * 1.2}s`;
        span.style.fontSize = `${18 + Math.random() * 18}px`;

        layer.appendChild(span);
    }

    setTimeout(() => {
        layer.classList.add("hidden");
        layer.innerHTML = "";
    }, 4500);
}

function bindEvents() {
    const addTopicBtn = byId("addTopicBtn");
    const startBtn = byId("startTestBtn");
    const difficultySelect = byId("difficultySelect");

    if (addTopicBtn) {
        addTopicBtn.addEventListener("click", () => {
            addTopic();
        });
    }

    if (startBtn) {
        startBtn.addEventListener("click", startTest);
    }

    if (difficultySelect) {
        difficultySelect.addEventListener("change", () => {
            renderTopics();
            updateLimitOptions();
        });
    }

    const menuTestBtn = byId("menuTestBtn");
    const menuResultBtn = byId("menuResultBtn");
    const menuTopperBtn = byId("menuTopperBtn");
    const menuOneLinerBtn = byId("menuOneLinerBtn");

    if (menuTestBtn) menuTestBtn.addEventListener("click", startNewTestSameSelection);
    if (menuResultBtn) menuResultBtn.addEventListener("click", () => {
        if (lastStats) renderResult(lastStats, lastServerResult || {});
        else alert("अभी result available नहीं है। पहले test complete करें।");
    });
    if (menuTopperBtn) menuTopperBtn.addEventListener("click", openTopperList);
    if (menuOneLinerBtn) menuOneLinerBtn.addEventListener("click", () => {
        alert("One-Liner पढ़ने के लिए One-Liner topic select करके START TEST दबाएँ।");
        showScreen("setup");
    });

    const prevBtn = byId("prevBtn");
    const nextBtn = byId("nextBtn");
    const skipBtn = byId("skipBtn");
    const statusBtn = byId("statusBtn");
    const finishBtn = byId("finishBtn");

    if (prevBtn) prevBtn.addEventListener("click", goPrevious);
    if (nextBtn) nextBtn.addEventListener("click", goNext);
    if (skipBtn) skipBtn.addEventListener("click", skipQuestion);
    if (statusBtn) statusBtn.addEventListener("click", openStatusModal);
    if (finishBtn) finishBtn.addEventListener("click", openSubmitModal);

    const closeStatusBtn = byId("closeStatusModalBtn");
    const closeSubmitBtn = byId("closeSubmitModalBtn");
    const backToTestBtn = byId("backToTestBtn");
    const submitFinalBtn = byId("submitFinalBtn");

    if (closeStatusBtn) closeStatusBtn.addEventListener("click", closeStatusModal);
    if (closeSubmitBtn) closeSubmitBtn.addEventListener("click", closeSubmitModal);
    if (backToTestBtn) backToTestBtn.addEventListener("click", closeSubmitModal);
    if (submitFinalBtn) submitFinalBtn.addEventListener("click", submitFinal);
}


function injectOneLinerPdfStyles() {
    if (document.getElementById("oneLinerPdfStyle")) return;

    const style = document.createElement("style");
    style.id = "oneLinerPdfStyle";
    style.textContent = `
        .one-liner-readable-page { background: rgba(255,255,255,0.98); border: 2px solid #111827; border-radius: 16px; padding: 18px; box-shadow: 0 8px 22px rgba(15,23,42,0.12); }
        .one-liner-readable-head { text-align: center; border-bottom: 2px solid #e5e7eb; margin-bottom: 14px; padding-bottom: 12px; }
        .one-liner-readable-head h2 { margin: 0; color: #b91c1c; font-size: 24px; font-weight: 900; }
        .one-liner-readable-head h3 { margin: 6px 0; color: #1d4ed8; font-size: 20px; font-weight: 900; }
        .one-liner-readable-head p { margin: 4px 0; font-size: 15px; font-weight: 800; }
        .one-liner-list { display: grid; gap: 10px; }
        .one-liner-item { background: #ffffff; border: 2px solid #dbeafe; border-radius: 12px; padding: 12px; }
        .one-liner-question { font-size: 18px; font-weight: 900; line-height: 1.45; color: #111827; }
        .one-liner-question span { color: #b91c1c; }
        .one-liner-answer { margin-top: 6px; font-size: 17px; font-weight: 900; line-height: 1.45; color: #166534; }
        .one-liner-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
        .pdf-choice-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.62); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 16px; }
        .pdf-choice-card { width: min(440px, 96vw); background: #fff; border: 3px solid #111827; border-radius: 16px; padding: 18px; text-align: center; box-shadow: 0 18px 40px rgba(0,0,0,0.35); position: relative; }
        .pdf-choice-card h2 { margin: 0 0 8px; font-size: 24px; font-weight: 900; color: #7f1d1d; }
        .pdf-choice-card p { margin: 0 0 14px; font-size: 15px; font-weight: 800; line-height: 1.4; }
        .pdf-choice-close { position: absolute; top: 8px; right: 10px; width: 34px; height: 34px; border-radius: 50%; border: none; background: #111827; color: #fff; font-size: 24px; font-weight: 900; cursor: pointer; }
        .pdf-choice-btn { display: block; width: 100%; margin: 8px 0; padding: 12px; border-radius: 10px; border: none; background: #2563eb; color: #fff; font-size: 17px; font-weight: 900; cursor: pointer; }
        .pdf-choice-btn.both { background: #7c3aed; }
        .gray-share-btn { background: #374151 !important; }
        .share-progress-text { margin: 12px 0; padding: 10px; border-radius: 10px; background: #ecfeff; color: #155e75; font-size: 18px; font-weight: 900; }

        .result-tab-patti { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin: 0 0 16px; border-bottom: 3px solid #94a3b8; align-items: end; }
        .result-tab-btn { min-height: 44px; border: 2px solid #94a3b8; border-bottom: none; border-radius: 14px 14px 0 0; margin-right: 5px; padding: 10px 8px; background: #e5e7eb; color: #111827; font-size: 16px; font-weight: 950; cursor: pointer; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.08); }
        .result-tab-btn.active { background: #ffffff; color: #b91c1c; transform: translateY(3px); border-color: #111827; box-shadow: 0 -2px 10px rgba(0,0,0,0.10); }
        .result-tab-btn:hover { background: #fff7ed; }
        .top-menu-bar { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 12px; }
        .top-menu-btn { border: 2px solid rgba(255,255,255,0.65); border-radius: 12px; padding: 10px 8px; background: rgba(255,255,255,0.14); color: #fff; font-weight: 900; cursor: pointer; }
        .top-menu-btn:hover { background: rgba(255,255,255,0.28); }
        .topper-page { background: rgba(255,255,255,0.98); border: 2px solid #111827; border-radius: 16px; padding: 16px; }
        .topper-note { padding: 10px; background: #fffbeb; border: 2px solid #f59e0b; border-radius: 10px; font-weight: 900; margin-bottom: 14px; text-align: center; }
        .topper-section { margin-top: 16px; }
        .topper-section h3 { margin: 0 0 10px; color: #7f1d1d; font-size: 21px; font-weight: 900; text-align: center; }
        .topper-card { display: grid; grid-template-columns: 58px 1fr 135px; gap: 10px; align-items: center; border: 2px solid #dbeafe; border-radius: 14px; padding: 12px; margin-bottom: 10px; background: #fff; }
        .topper-rank { font-size: 22px; font-weight: 950; color: #b91c1c; text-align: center; }
        .topper-info h4 { margin: 0 0 4px; font-size: 18px; font-weight: 950; color: #111827; }
        .topper-info p { margin: 2px 0; font-size: 14px; font-weight: 800; color: #374151; }
        .topper-mode { color: #166534 !important; font-weight: 950 !important; }
        .topper-score { text-align: center; border-left: 2px dashed #cbd5e1; padding-left: 8px; }
        .topper-score strong { display: block; font-size: 20px; font-weight: 950; color: #1d4ed8; }
        .topper-score span { display: block; font-size: 17px; font-weight: 950; color: #166534; }
        .topper-score small { display: block; font-size: 13px; font-weight: 900; color: #111827; }
        .topper-empty { text-align: center; padding: 12px; font-weight: 900; background: #f3f4f6; border-radius: 10px; }
        @media (max-width: 640px) { .one-liner-question { font-size: 16px; } .one-liner-answer { font-size: 16px; } .result-tab-patti { grid-template-columns: repeat(2, 1fr); gap: 6px; border-bottom: none; } .result-tab-btn { border: 2px solid #94a3b8; border-radius: 12px; margin-right: 0; font-size: 14px; } .result-tab-btn.active { transform: none; } .top-menu-bar { grid-template-columns: repeat(2, 1fr); } .topper-card { grid-template-columns: 44px 1fr; } .topper-score { grid-column: 1 / -1; border-left: none; border-top: 2px dashed #cbd5e1; padding-top: 8px; } }
    `;

    document.head.appendChild(style);
}

async function initApp() {
    injectOneLinerPdfStyles(); showScreen("setup");
    currentAuthUser = await requireAuth(); if (!currentAuthUser) return;
    currentProfile = await getProfile(currentAuthUser.id);
    if (!currentProfile || String(currentProfile.role || "student").toLowerCase() === "admin") { location.href = "q9v3x7k2-r8m4p6t1-z5n7c2w9.html"; return; }
    await refreshCbtSession();
    const nameEl=byId("cbtStudentName"), idEl=byId("cbtStudentId");
    if(nameEl) nameEl.textContent=currentProfile.full_name || currentAuthUser.email || "Student";
    if(idEl) idEl.textContent=`Student ID: ${currentAuthUser.id.slice(0,8).toUpperCase()}`;
    await loadCatalog(); await loadQuestionCounts();
    selectedTopics=[]; topicIdCounter=1; addTopic(); bindEvents(); updateLimitOptions();
    const selectionHeadText=document.querySelector(".selection-head p"); if(selectionHeadText) selectionHeadText.textContent=`Maximum ${MAX_TOPICS} Subject/Topic selections कर सकते हैं।`;
    const note=document.querySelector(".selection-note"); if(note) note.textContent="1 से 5 Subject/Topics select करें और 10 से 100 questions तक CBT test लगाएँ।";
}

window.startTest = startTest;
window.goPrevious = goPrevious;
window.goNext = goNext;
window.skipQuestion = skipQuestion;
window.openStatusModal = openStatusModal;
window.closeStatusModal = closeStatusModal;
window.openSubmitModal = openSubmitModal;
window.closeSubmitModal = closeSubmitModal;
window.submitFinal = submitFinal;
window.goHome = goHome;
window.startNewTestSameSelection = startNewTestSameSelection;
window.openAnalysis = openAnalysis;
window.openPdfOptionsModal = openPdfOptionsModal;
window.openTopperList = openTopperList;
window.printOneLinerPdf = printOneLinerPdf;
window.backToResult = backToResult;

document.addEventListener("DOMContentLoaded", initApp);