/* BuyTuk Academy — Student/Staff UI thin client */
"use strict";

const SESSION_KEY = "buytuk.ui.session.v017";
const state = {
  authMode: "student",
  tenantId: null,
  accessToken: null,
  refreshToken: null,
  studentId: null,
  user: null,
  context: null,
  currentLesson: null,
  currentExercise: null,
  attemptId: null,
  submitted: false,
  attemptStartedAt: null,
  voiceUploadKey: null,
};

async function api(method, path, { body, idempotencyKey, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.tenantId) headers["X-Tenant-Id"] = state.tenantId;
  if (auth && state.accessToken) headers["Authorization"] = `Bearer ${state.accessToken}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, json };
}

function show(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uuid = () => crypto.randomUUID();
const isVoiceExercise = (ex) => ex?.type === "VOICE" || ex?.engine === "READING";

/* PHASE-3 (CORE-WEB-PORTAL-SHELL) — role-aware portal shell (ACR-E5-001).
 * Role source of truth = JWT / authenticated identity ONLY:
 *  - student mode: the token role claim is "student" (issued by
 *    studentLoginWithIdentity and verified on every request);
 *  - staff mode: the role mirrors the server's login/refresh response and is
 *    re-verified via GET /v1/auth/me on session restore (the server derives
 *    it from req.user — the JWT). NEVER from URL/query/localStorage/form.
 * The shell is presentation-only: the real boundaries remain API authorization
 * + tenant isolation + RLS (PHASE-2). Capabilities without a real /v1 surface
 * render an explicit "غير مدعومة بعد" placeholder — zero mock data. */
const PORTAL_TITLES = {
  student: "بوابة الطالب",
  teacher: "بوابة المعلم",
  parent: "بوابة ولي الأمر",
  principal: "بوابة المدير",
  admin: "بوابة المسؤول",
};
const PORTAL_ROUTES = {
  student: ["dashboard", "read", "learn", "practice", "reports", "exercises", "progress", "messages", "notes", "wallet", "points-store", "support"],
  teacher: ["dashboard", "passages", "lessons", "students", "classes", "reports", "exercises", "analytics", "schedule", "attendance", "ratings", "voice-qa", "settings"],
  parent: ["dashboard", "children", "progress", "reports", "communication"],
  principal: ["dashboard", "teachers", "students", "classes", "analytics", "reports"],
  admin: ["dashboard", "users", "queue", "audit", "models", "settings"],
};
const PORTAL_CAP_TITLES = {
  dashboard: "اللوحة الرئيسية", read: "القراءة", learn: "التعلّم", practice: "التدريب",
  reports: "التقارير", exercises: "الأنشطة", progress: "التقدم", messages: "الرسائل",
  notes: "الملاحظات", wallet: "المحفظة", "points-store": "متجر النقاط", support: "الدعم",
  passages: "المقاطع", lessons: "الدروس", students: "الطلاب", classes: "الصفوف",
  analytics: "التحليلات", schedule: "الجدول", attendance: "الحضور", ratings: "التقييمات",
  "voice-qa": "القراءة الصوتية", settings: "الإعدادات", children: "الأبناء",
  communication: "التواصل", teachers: "المعلمون", users: "المستخدمون", queue: "قائمة الانتظار",
  audit: "سجل التدقيق", models: "النماذج",
};
const PORTAL_CAP_PHASE = {
  student: { read: "PHASE-6", learn: "PHASE-6", practice: "PHASE-6", reports: "PHASE-6", exercises: "PHASE-6", progress: "PHASE-6", "points-store": "PHASE-12", notes: "PHASE-12", support: "PHASE-12" },
  teacher: { students: "PHASE-7", reports: "PHASE-7", schedule: "PHASE-12", classes: "PHASE-12", settings: "PHASE-12" },
  admin: { models: "PHASE-12", settings: "PHASE-12" },
};

function slugFileName(name) {
  const clean = String(name ?? "reading-audio.bin")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "reading-audio.bin";
}

function persistSession() {
  const payload = {
    authMode: state.authMode,
    tenantId: state.tenantId,
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    studentId: state.studentId,
    user: state.user,
    context: state.context,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearSessionStorage() {
  sessionStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    syncHeader();
    return Boolean(state.accessToken);
  } catch {
    clearSessionStorage();
    return false;
  }
}

async function refreshIfPossible() {
  if (!state.refreshToken || state.authMode === "student") return false;
  const r = await api("POST", "/v1/auth/refresh", { body: { refreshToken: state.refreshToken }, auth: false });
  if (r.status !== 200 || !r.json?.accessToken) return false;
  state.accessToken = r.json.accessToken;
  state.refreshToken = r.json.refreshToken ?? state.refreshToken;
  state.user = r.json.user ?? state.user;
  persistSession();
  return true;
}

async function safeLogout() {
  const refreshToken = state.refreshToken;
  if (refreshToken) {
    try {
      await api("POST", "/v1/auth/logout", { body: { refreshToken } });
    } catch {}
  }
  Object.assign(state, {
    authMode: "student",
    tenantId: null,
    accessToken: null,
    refreshToken: null,
    studentId: null,
    user: null,
    context: null,
    currentLesson: null,
    currentExercise: null,
    attemptId: null,
    submitted: false,
    attemptStartedAt: null,
    voiceUploadKey: null,
  });
  clearSessionStorage();
  syncHeader();
  $("portal-nav").classList.add("hidden");
  $("portal-nav").innerHTML = "";
  showLoginMode("student");
  show("view-login");
}

function clearVoiceUploadUi() {
  state.voiceUploadKey = null;
  if ($("activity-audio-file")) $("activity-audio-file").value = "";
  if ($("activity-upload-status")) $("activity-upload-status").textContent = "";
  if ($("activity-voice-meta")) $("activity-voice-meta").textContent = "";
}

function setVoiceStatus(text, tone = "muted") {
  const el = $("activity-upload-status");
  if (!el) return;
  el.className = `${tone} small`;
  el.textContent = text;
}

function hideAuthMessages() {
  $("login-error").classList.add("hidden");
  $("login-success").classList.add("hidden");
  $("forgot-password-error").classList.add("hidden");
  $("forgot-password-result").classList.add("hidden");
}

function setAuthMessage(type, text) {
  const el = $(type === "error" ? "login-error" : "login-success");
  el.textContent = text;
  el.classList.remove("hidden");
}

function syncHeader() {
  const loggedIn = Boolean(state.accessToken);
  $("app-header").classList.toggle("hidden", !loggedIn);
  $("header-logout").classList.toggle("hidden", !loggedIn);
  if (!loggedIn) {
    $("header-user").textContent = "";
    return;
  }
  if (state.authMode === "student") {
    $("header-user").textContent = `طالب · ${state.studentId ?? ""}`;
  } else {
    $("header-user").textContent = `${state.user?.role ?? "user"} · ${state.user?.email ?? ""}`;
  }
}

function showLoginMode(mode) {
  state.authMode = mode;
  $("student-login-fields").classList.toggle("hidden", mode !== "student");
  $("staff-login-fields").classList.toggle("hidden", mode !== "staff");
  $("login-tenant").required = mode === "student";
  $("login-identity").required = mode === "student";
  $("login-email").required = mode === "staff";
  $("login-password").required = mode === "staff";
  $("switch-student").classList.toggle("secondary", mode !== "student");
  $("switch-student").classList.toggle("primary", mode === "student");
  $("switch-staff").classList.toggle("secondary", mode !== "staff");
  $("switch-staff").classList.toggle("primary", mode === "staff");
  hideAuthMessages();
}

function voiceExpectedText(meta) {
  return String(meta.expectedText ?? meta.passageText ?? meta.question ?? "").trim();
}

function renderVoiceMeta(meta) {
  const bits = [];
  if (meta.passageId) bits.push(`passageId: ${meta.passageId}`);
  if (meta.sessionId) bits.push(`sessionId: ${meta.sessionId}`);
  const expected = voiceExpectedText(meta);
  if (expected) bits.push(`النص المرجعي: ${expected}`);
  $("activity-voice-meta").textContent = bits.length === 0
    ? "هذا النشاط يحتاج metadata صوتية منشورة من المعلم (passageId / sessionId / expectedText)."
    : bits.join(" · ");
}

function renderActivityMode(ex) {
  const voice = isVoiceExercise(ex);
  $("activity-text-mode").classList.toggle("hidden", voice);
  $("activity-voice-mode").classList.toggle("hidden", !voice);
  $("activity-submit").textContent = voice ? "رفع وإرسال القراءة" : "إرسال المحاولة";
  $("activity-submit").disabled = false;
  if (voice) {
    renderVoiceMeta(ex.metadata ?? {});
    setVoiceStatus("اختر ملفًا صوتيًا ثم أرسل المحاولة. لا تُولَّد أي بيانات مصطنعة.");
  } else {
    setVoiceStatus("");
  }
}

async function requestPresignedUploadUrl(audioKey) {
  const r = await api("GET", `/api/audio/presign?key=${encodeURIComponent(audioKey)}&op=putObject`);
  if (r.status !== 200 || !r.json?.url) {
    throw new Error(r.json?.error ?? `PRESIGN_FAILED_${r.status}`);
  }
  return String(r.json.url);
}

async function uploadVoiceFile(audioKey, file) {
  const signedUrl = await requestPresignedUploadUrl(audioKey);
  const headers = file.type ? { "Content-Type": file.type } : undefined;
  const res = await fetch(signedUrl, { method: "PUT", headers, body: file });
  if (!res.ok) throw new Error(`UPLOAD_FAILED_${res.status}`);
}

async function prepareVoiceEngineInput(ex) {
  const meta = ex.metadata ?? {};
  const file = $("activity-audio-file").files?.[0] ?? null;
  if (!file) throw new Error("AUDIO_FILE_REQUIRED");
  const passageId = String(meta.passageId ?? "").trim();
  const sessionId = String(meta.sessionId ?? "").trim();
  const expectedText = voiceExpectedText(meta);
  if (!passageId || !sessionId) throw new Error("VOICE_METADATA_MISSING");

  const audioKey = [
    "student-ui",
    encodeURIComponent(state.tenantId ?? "tenant"),
    encodeURIComponent(state.studentId ?? "student"),
    encodeURIComponent(state.attemptId ?? uuid()),
    `${Date.now()}-${slugFileName(file.name)}`,
  ].join("/");

  setVoiceStatus("جارٍ طلب رابط رفع آمن…", "notice");
  await uploadVoiceFile(audioKey, file);
  state.voiceUploadKey = audioKey;
  setVoiceStatus(`تم رفع الملف بنجاح: ${file.name}`, "notice");

  return { passageId, sessionId, audioKey, expectedText };
}

function renderVoicePrompt(meta) {
  const expected = voiceExpectedText(meta);
  return expected
    ? `<div class="item title">نص القراءة: ${esc(expected)}</div>`
    : `<div class="notice">لا يوجد نص قراءة منشور داخل metadata لهذا النشاط بعد — لن تُعرض بدائل وهمية.</div>`;
}

$("switch-student").addEventListener("click", () => showLoginMode("student"));
$("switch-staff").addEventListener("click", () => showLoginMode("staff"));
$("show-forgot-password").addEventListener("click", () => { hideAuthMessages(); show("view-forgot-password"); });
$("header-logout").addEventListener("click", () => safeLogout());

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthMessages();
  if (state.authMode === "student") {
    state.tenantId = $("login-tenant").value.trim();
    const identityId = $("login-identity").value.trim();
    if (!state.tenantId || !identityId) return;
    const r = await api("POST", "/v1/auth/student-login", { body: { identityId }, auth: false });
    if (r.status !== 200 || !r.json?.accessToken) {
      setAuthMessage("error", `فشل دخول الطالب (${r.status}): ${r.json?.error?.message ?? r.json?.error ?? "تحقق من المعرفات"}`);
      return;
    }
    state.accessToken = r.json.accessToken;
    state.refreshToken = r.json.refreshToken ?? null;
    state.context = r.json.context ?? {};
    state.studentId = state.context.studentId;
    state.user = { role: "student", id: state.studentId };
    persistSession();
    syncHeader();
    await activatePortal();
    return;
  }

  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  if (!email || !password) return;
  const r = await api("POST", "/v1/auth/login", { body: { email, password }, auth: false });
  if (r.status !== 200 || !r.json?.accessToken) {
    setAuthMessage("error", `فشل دخول الفريق (${r.status}): ${r.json?.error?.message ?? r.json?.error ?? "تحقق من البريد وكلمة المرور"}`);
    return;
  }
  state.accessToken = r.json.accessToken;
  state.refreshToken = r.json.refreshToken ?? null;
  state.user = r.json.user ?? null;
  state.context = null;
  state.studentId = null;
  persistSession();
  syncHeader();
  await activatePortal();
});

document.addEventListener("click", (e) => {
  const nav = e.target?.dataset?.nav;
  if (nav === "dashboard") renderDashboard();
  if (nav === "lesson" && state.currentLesson) openLesson(state.currentLesson);
  if (nav === "login") show("view-login");
  if (nav === "portal-home") openPortalCapability("dashboard");
});

$("forgot-password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAuthMessages();
  const email = $("forgot-email").value.trim();
  if (!email) return;
  const r = await api("POST", "/v1/auth/forgot-password", { body: { email }, auth: false });
  if (r.status !== 200) {
    $("forgot-password-error").textContent = `تعذر إرسال طلب الاستعادة (${r.status})`;
    $("forgot-password-error").classList.remove("hidden");
    return;
  }
  const extra = r.json?.resetToken ? ` رمز التطوير: ${r.json.resetToken}` : "";
  $("forgot-password-result").textContent = `تم إنشاء طلب الاستعادة بنجاح.${extra}`;
  $("forgot-password-result").classList.remove("hidden");
  $("reset-password-form").classList.remove("hidden");
  if (r.json?.resetToken) $("reset-token").value = r.json.resetToken;
});

$("reset-password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("forgot-password-error").classList.add("hidden");
  const resetToken = $("reset-token").value.trim();
  const newPassword = $("reset-password").value;
  const r = await api("POST", "/v1/auth/reset-password", { body: { resetToken, newPassword }, auth: false });
  if (r.status !== 200) {
    $("forgot-password-error").textContent = `فشل تحديث كلمة المرور (${r.status}): ${r.json?.error?.message ?? r.json?.error ?? ""}`;
    $("forgot-password-error").classList.remove("hidden");
    return;
  }
  $("forgot-password-result").textContent = "تم تحديث كلمة المرور. يمكنك العودة إلى شاشة الدخول الآن.";
  $("forgot-password-result").classList.remove("hidden");
});

$("activity-audio-file")?.addEventListener("change", () => {
  const file = $("activity-audio-file").files?.[0] ?? null;
  if (!file) {
    state.voiceUploadKey = null;
    setVoiceStatus("لم يتم اختيار ملف صوتي بعد.");
    return;
  }
  state.voiceUploadKey = null;
  const kb = Math.max(1, Math.round(file.size / 1024));
  setVoiceStatus(`جاهز للرفع: ${file.name} (${kb} KB)`, "notice");
});

/* PHASE-3 — role-aware portal routing (presentation-only). */
function currentRole() {
  return state.authMode === "student" ? "student" : state.user?.role ?? null;
}

/** Re-verifies identity/role against the server (JWT → req.user). Reuses the
 * existing GET /v1/auth/me — no new endpoint, no new privileges (PHASE-3 rule). */
async function fetchVerifiedIdentity() {
  let me = await api("GET", "/v1/auth/me");
  if (me.status === 401 && (await refreshIfPossible())) me = await api("GET", "/v1/auth/me");
  if (me.status !== 200 || !me.json?.user) return null;
  return me.json;
}

async function activatePortal() {
  const role = currentRole();
  if (!role) {
    await safeLogout();
    return;
  }
  renderPortalNav(role);
  if (role === "student") {
    await renderDashboard();
    return;
  }
  openPortalCapability("dashboard");
}

function renderPortalNav(role) {
  const nav = $("portal-nav");
  nav.dataset.role = role;
  const caps = PORTAL_ROUTES[role] ?? [];
  nav.innerHTML = caps
    .map((c) => `<button type="button" class="nav-item" data-portal-cap="${esc(c)}">${esc(PORTAL_CAP_TITLES[c] ?? c)}</button>`)
    .join("");
  nav.classList.remove("hidden");
  nav.querySelectorAll("[data-portal-cap]").forEach((b) =>
    b.addEventListener("click", () => openPortalCapability(b.dataset.portalCap)));
}

function openPortalCapability(cap) {
  const role = currentRole();
  if (!role) {
    show("view-login");
    return;
  }
  if (cap === "dashboard" && role !== "student" && role !== "parent") {
    renderStaffDashboard(role);
    return;
  }
  if (cap === "dashboard" && role === "student") {
    renderDashboard();
    return;
  }
  if (role === "teacher" && (cap === "students" || cap === "reports")) {
    renderTeacherReports();
    return;
  }
  if (role === "parent" && ["dashboard", "children", "progress", "reports"].includes(cap)) {
    renderParentDashboard();
    return;
  }
  if (role === "student" && ["wallet", "messages"].includes(cap)) {
    renderEngagementView(cap);
    return;
  }
  if (role === "teacher" && ["attendance", "ratings"].includes(cap)) {
    renderEngagementView(cap);
    return;
  }
  if (role === "parent" && cap === "communication") {
    renderEngagementView("communication");
    return;
  }
  if (role === "teacher" && ["passages", "lessons", "exercises", "analytics", "voice-qa"].includes(cap)) {
    renderEngineView(cap);
    return;
  }
  if (role === "principal" && ["dashboard", "teachers", "students", "classes", "analytics", "reports"].includes(cap)) {
    renderPrincipalView(cap);
    return;
  }
  if (role === "admin" && ["dashboard", "users", "queue", "audit", "models", "settings"].includes(cap)) {
    renderAdminView(cap);
    return;
  }
  renderPortalPlaceholder(role, cap);
}

async function renderStaffDashboard(role) {
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  $("portal-meta").textContent = `الدور (من الهوية الموثقة): ${role}` + (state.user?.email ? ` · ${state.user.email}` : "");
  show("view-portal-home");
  $("portal-capability-panel").innerHTML = `<div class="muted small">جارٍ تحميل البيانات الحقيقية…</div>`;
  const r = await api("GET", "/v1/teacher/review-queue");
  if (r.status === 401 && (await refreshIfPossible())) return renderStaffDashboard(role);
  if (r.status === 403) {
    $("portal-capability-panel").innerHTML = `<div class="error">403 — غير مصرح: هذا الدور لا يملك صلاحية هذه اللوحة (الحماية الحقيقية من الـ API وليس من الواجهة).</div>`;
    return;
  }
  if (r.status !== 200) {
    $("portal-capability-panel").innerHTML = `<div class="error">تعذر تحميل لوحة الفريق (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا تُعرض بيانات وهمية.</div>`;
    return;
  }
  const pending = Array.isArray(r.json?.pendingProposals) ? r.json.pendingProposals : [];
  const reviewItems = Array.isArray(r.json?.reviewItems) ? r.json.reviewItems : [];
  const panel = $("portal-capability-panel");
  const list = pending.map((p) => `
    <div class="item">🧩 <b>${esc(p.skill)}</b> · ${esc(p.activityType)} <span class="badge">${esc(p.status)}</span>
      <div class="muted small">طالب: <code>${esc(p.studentId)}</code> · ${esc(String(p.createdAt ?? ""))}</div>
      <button class="link" type="button" data-report-student="${esc(p.studentId)}">عرض تقرير الطالب</button></div>`).join("");
  const insights = reviewItems.map((it) => `<div class="item">💡 ${esc(it.title ?? it.skill ?? "")}<div class="muted small">${esc(it.reason ?? it.detail ?? "")}</div></div>`).join("");
  panel.innerHTML = `
    <div class="stat"><span class="muted small">المقترحات المعلقة (حقيقية من /v1/teacher/review-queue)</span><b>${pending.length}</b></div>
    ${(pending.length + reviewItems.length) === 0 ? `<div class="muted small">لا مقترحات معلقة حاليًا — قائمة حقيقية من API (لا بيانات وهمية).</div>` : `${list}${insights}`}
    <div class="muted small">التقارير: افتح تقرير أي طالب من القائمة أعلاه — بيانات حقيقية بصلاحية المعلم (PHASE-7).</div>`;
  panel.querySelectorAll("[data-report-student]").forEach((b) =>
    b.addEventListener("click", () => renderTeacherReport(b.dataset.reportStudent)));
}

function renderTeacherReports() {
  renderStaffDashboard(currentRole());
}

/* PHASE-9 (PRINCIPAL-ADMIN-CAPABILITIES) — real oversight/admin surfaces.
 * Thin-client only: every view calls the canonical /v1 API with the JWT role
 * gates proven server-side; no mock data anywhere (ACR-E5-001). */

/* PHASE-10 (ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON) — real
 * engine/content surfaces for the teacher. Thin client ONLY: every panel calls
 * the canonical /v1 surface (content library, exercises library, oversight
 * aggregates) with the real JWT; zero mock data (ACR-E5-001). The engines
 * themselves are consumed through the canonical attempts flow (P10-2/3/4). */
/* PHASE-11 (GAMIFICATION-MESSAGING-ATTENDANCE) — real engagement surfaces.
 * Thin client ONLY: every panel calls the canonical /v1 API (wallet, messages,
 * attendance, ratings) with the real JWT; zero mock data (ACR-E5-001). */
async function renderEngagementView(cap) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  let url; let meta;
  if (cap === "wallet") { url = "/v1/wallet"; meta = "المحفظة — رصيد نقاط حقيقي (PHASE-11)"; }
  else if (cap === "messages" || cap === "communication") { url = "/v1/messages"; meta = "الرسائل — محادثات حقيقية (PHASE-11)"; }
  else if (cap === "attendance") { url = "/v1/attendance"; meta = "الحضور — سجلات حقيقية (PHASE-11)"; }
  else { url = "/v1/ratings"; meta = "التقييمات — تقييمات حقيقية (PHASE-11)"; }
  $("portal-meta").textContent = meta;
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل البيانات الحقيقية…</div>`;
  const r = await api("GET", url);
  if (r.status === 401 && (await refreshIfPossible())) return renderEngagementView(cap);
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر التحميل (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  if (cap === "wallet") {
    const ledger = Array.isArray(r.json?.ledger) ? r.json.ledger : [];
    panel.innerHTML = `<div class="stat"><span class="muted small">رصيد النقاط (حقيقي من /v1/wallet)</span><b>${esc(r.json?.balance)}</b></div>`
      + (ledger.length === 0 ? `<div class="muted small">لا حركات على المحفظة بعد (سجل حقيقي — لا وهمي).</div>` : ledger.map((l) => `<div class="item">🪙 ${esc(l.delta > 0 ? "+" : "")}${esc(l.delta)} · ${esc(l.reason)} <span class="muted small">${esc(String(l.createdAt ?? ""))}</span></div>`).join(""));
    return;
  }
  if (cap === "messages" || cap === "communication") {
    const items = Array.isArray(r.json?.items) ? r.json.items : [];
    panel.innerHTML = `<div class="stat"><span class="muted small">الرسائل (حقيقي من /v1/messages)</span><b>${items.length}</b></div>`
      + (items.length === 0 ? `<div class="muted small">لا رسائل بعد (صندوق حقيقي — لا وهمي).</div>` : items.map((m) => `<div class="item">✉️ ${esc(m.fromUserId) === esc(state.user?.id) ? "➡️" : "⬅️"} ${esc(m.body)} <span class="muted small">${esc(String(m.createdAt ?? ""))}</span></div>`).join(""));
    return;
  }
  if (cap === "attendance") {
    const items = Array.isArray(r.json?.items) ? r.json.items : [];
    panel.innerHTML = `<div class="stat"><span class="muted small">سجلات الحضور (حقيقي من /v1/attendance — حسب نطاق التغطية)</span><b>${items.length}</b></div>`
      + (items.length === 0 ? `<div class="muted small">لا سجلات حضور في نطاقك بعد (قائمة حقيقية — لا وهمية).</div>` : items.map((a) => `<div class="item">🗓️ <b>${esc(a.status)}</b> · ${esc(a.sessionDate)} · طالب <code>${esc(String(a.studentId)).slice(0,8)}…</code></div>`).join(""));
    return;
  }
  const items = Array.isArray(r.json?.items) ? r.json.items : [];
  panel.innerHTML = `<div class="stat"><span class="muted small">تقييمات المعلمين (حقيقي من /v1/ratings — حسب نطاق التغطية)</span><b>${items.length}</b></div>`
    + (items.length === 0 ? `<div class="muted small">لا تقييمات في نطاقك بعد (قائمة حقيقية — لا وهمية).</div>` : items.map((x) => `<div class="item">⭐ ${"★".repeat(Number(x.score) || 0)} · ${esc(x.note ?? "")} · طالب <code>${esc(String(x.studentId)).slice(0,8)}…</code></div>`).join(""));
}

async function renderEngineView(cap) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  let base = null; let meta = "";
  if (cap === "passages") { base = "/v1/lessons?kind=PASSAGE"; meta = "المقاطع — مكتبة المحتوى الحقيقية (PHASE-10)"; }
  else if (cap === "lessons") { base = "/v1/lessons"; meta = "الدروس — مكتبة المحتوى الحقيقية (PHASE-10)"; }
  else if (cap === "exercises") { base = "/v1/exercises"; meta = "الأنشطة — المكتبة الحقيقية (PHASE-10)"; }
  else if (cap === "voice-qa") { base = "/v1/exercises?engineBinding=READING"; meta = "القراءة الصوتية — سطح المحرك غير المتزامن (PHASE-10)"; }
  else if (cap === "analytics") { base = "/v1/oversight/aggregates"; meta = "التحليلات — تجميعات إشراف حقيقية (PHASE-10)"; }
  $("portal-meta").textContent = meta;
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل البيانات الحقيقية…</div>`;
  let url = base;
  if (cap === "analytics") {
    const from = new Date(Date.now() - 30 * 864e5).toISOString();
    url = `${base}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date().toISOString())}`;
  }
  const r = await api("GET", url);
  if (r.status === 401 && (await refreshIfPossible())) return renderEngineView(cap);
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر التحميل (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  if (cap === "analytics") {
    const groups = Array.isArray(r.json?.groups) ? r.json.groups : [];
    panel.innerHTML = `<div class="stat"><span class="muted small">مجموعات الإشراف (حقيقية من /v1/oversight/aggregates — خصوصية k-Anonymity)</span><b>${groups.length}</b></div>`
      + (groups.length === 0 ? `<div class="muted small">لا مجموعات مؤهلة للعرض بعد (قمع الخصوصية يمنع المجموعات الصغيرة — بيانات حقيقية لا وهمية).</div>` : groups.map((g) => `<div class="item">📊 ${esc(g.subject ?? "—")} · ${esc(g.evidenceType ?? "—")} · متوسط ${esc(g.mean ?? "—")} · عينات ${esc(g.sampleSize)} <span class="badge">${esc(g.status)}</span></div>`).join(""));
    return;
  }
  if (cap === "exercises" || cap === "voice-qa") {
    const items = Array.isArray(r.json?.items) ? r.json.items : [];
    panel.innerHTML = `<div class="stat"><span class="muted small">${cap === "exercises" ? "الأنشطة (حقيقي من /v1/exercises)" : "أنشطة القراءة الصوتية (حقيقي من /v1/exercises?engineBinding=READING — المحرك غير المتزامن المُثبَت في P1/P2)"}</span><b>${items.length}</b></div>`
      + (items.length === 0 ? `<div class="muted small">لا أنشطة منشورة من هذا النوع بعد (قائمة حقيقية — لا وهمية).</div>` : items.map((x) => `<div class="item">🧩 ${esc(x.activityType ?? "")} · محرك <b>${esc(x.engineBinding ?? "")}</b> <span class="badge">${esc(x.status ?? "")}</span></div>`).join(""));
    return;
  }
  const items = Array.isArray(r.json?.items) ? r.json.items : [];
  panel.innerHTML = `<div class="stat"><span class="muted small">${cap === "passages" ? "المقاطع (حقيقي من /v1/lessons?kind=PASSAGE)" : "الدروس (حقيقي من /v1/lessons)"} </span><b>${items.length}</b></div>`
    + (items.length === 0 ? `<div class="muted small">لا محتوى منشورًا بعد (قائمة حقيقية — لا وهمية).</div>` : items.map((x) => `<div class="item">📖 <b>${esc(x.title ?? "")}</b> · ${esc(x.subject ?? "")} · ${esc(x.status ?? "")}</div>`).join(""));
}

async function renderPrincipalView(cap) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  if (cap === "analytics") {
    $("portal-meta").textContent = "التحليلات — تجميعات الإشراف الحقيقية (PHASE-9)";
    show("view-portal-home");
    const panel = $("portal-capability-panel");
    panel.innerHTML = `<div class="muted small">جارٍ تحميل تجميعات الإشراف الحقيقية…</div>`;
    const from = new Date(Date.now() - 30 * 864e5).toISOString();
    const to = new Date().toISOString();
    const r = await api("GET", `/v1/oversight/aggregates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (r.status === 401 && (await refreshIfPossible())) return renderPrincipalView(cap);
    if (r.status !== 200) {
      panel.innerHTML = `<div class="error">تعذر تحميل التحليلات (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
      return;
    }
    const groups = Array.isArray(r.json?.groups) ? r.json.groups : [];
    panel.innerHTML = `
      <div class="stat"><span class="muted small">مجموعات الإشراف (حقيقية من /v1/oversight/aggregates — خصوصية k-Anonymity)</span><b>${groups.length}</b></div>
      ${groups.length === 0 ? `<div class="muted small">لا مجموعات مؤهلة للعرض بعد (قمع الخصوصية يمنع المجموعات الصغيرة — بيانات حقيقية لا وهمية).</div>` : groups.map((g) => `<div class="item">📊 ${esc(g.subject ?? "—")} · ${esc(g.evidenceType ?? "—")} · متوسط ${esc(g.mean ?? "—")} · عينات ${esc(g.sampleSize)} <span class="badge">${esc(g.status)}</span></div>`).join("")}`;
    return;
  }
  if (cap === "teachers" || cap === "classes") {
    $("portal-meta").textContent = cap === "teachers" ? "المعلمون — كادر حقيقي (PHASE-9)" : "الصفوف — صفوف حقيقية (PHASE-9)";
    show("view-portal-home");
    const panel = $("portal-capability-panel");
    panel.innerHTML = `<div class="muted small">جارٍ تحميل البيانات الحقيقية…</div>`;
    const r = await api("GET", cap === "teachers" ? "/v1/admin/staff" : "/v1/admin/classes");
    if (r.status === 401 && (await refreshIfPossible())) return renderPrincipalView(cap);
    if (r.status === 403) {
      panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
      return;
    }
    if (r.status !== 200) {
      panel.innerHTML = `<div class="error">تعذر التحميل (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
      return;
    }
    if (cap === "teachers") {
      const staff = Array.isArray(r.json?.staff) ? r.json.staff : [];
      panel.innerHTML = `
        <div class="stat"><span class="muted small">أعضاء الكادر (حقيقي من /v1/admin/staff — عضويات النطاق)</span><b>${staff.length}</b></div>
        ${staff.length === 0 ? `<div class="muted small">لا عضويات كادر مسجلة بعد (قائمة حقيقية — لا وهمية).</div>` : staff.map((s) => `<div class="item">👤 <b>${esc(s.firstName)} ${esc(s.lastName)}</b> · ${esc(s.role)} · نطاق ${esc(s.scopeType)}${s.email ? ` · ${esc(s.email)}` : ""}</div>`).join("")}`;
    } else {
      const classes = Array.isArray(r.json?.classes) ? r.json.classes : [];
      panel.innerHTML = `
        <div class="stat"><span class="muted small">الصفوف (حقيقي من /v1/admin/classes)</span><b>${classes.length}</b></div>
        ${classes.length === 0 ? `<div class="muted small">لا صفوف مسجلة بعد (قائمة حقيقية — لا وهمية).</div>` : classes.map((c) => `<div class="item">🏫 <b>${esc(c.name)}</b> · ${esc(c.gradeLevel)} · طلاب: ${esc(c.studentCount)}</div>`).join("")}`;
    }
    return;
  }
  // students / reports — real review queue + student report via the canonical scope gate (PHASE-7 surface)
  $("portal-meta").textContent = "تقارير الطلاب — عبر بوابة النطاق الحقيقية (PHASE-9)";
  show("view-portal-home");
  await renderStaffDashboard(role);
}

async function renderAdminView(cap) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  if (cap === "queue") {
    renderStaffDashboard(role);
    return;
  }
  if (cap === "models" || cap === "settings") {
    renderPortalPlaceholder(role, cap);
    return;
  }
  const path = cap === "users" ? "/v1/admin/users" : "/v1/admin/audit";
  $("portal-meta").textContent = cap === "users" ? "المستخدمون — حسابات حقيقية (PHASE-9)" : "سجل التدقيق — أحداث حقيقية (PHASE-9)";
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل البيانات الحقيقية…</div>`;
  const r = await api("GET", path);
  if (r.status === 401 && (await refreshIfPossible())) return renderAdminView(cap);
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر التحميل (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  if (cap === "users") {
    const users = Array.isArray(r.json?.users) ? r.json.users : [];
    panel.innerHTML = `
      <div class="stat"><span class="muted small">الحسابات (حقيقي من /v1/admin/users)</span><b>${users.length}</b></div>
      ${users.length === 0 ? `<div class="muted small">لا حسابات بعد (قائمة حقيقية — لا وهمية).</div>` : users.map((u) => `<div class="item">🧑‍💼 <b>${esc(u.firstName)} ${esc(u.lastName)}</b> · ${esc(u.role)} · ${esc(u.email)}</div>`).join("")}`;
  } else {
    const events = Array.isArray(r.json?.events) ? r.json.events : [];
    panel.innerHTML = `
      <div class="stat"><span class="muted small">أحداث التدقيق (حقيقي من /v1/admin/audit — سجل التدقيق)</span><b>${events.length}</b></div>
      ${events.length === 0 ? `<div class="muted small">سجل التدقيق فارغ بعد (قائمة حقيقية — لا وهمية).</div>` : events.map((ev) => `<div class="item">🧾 <b>${esc(ev.action)}</b> · ${esc(ev.entity ?? "—")}${ev.actorId ? ` · <span class="muted small">${esc(String(ev.actorId)).slice(0, 8)}…</span>` : ""}</div>`).join("")}`;
  }
}

async function renderTeacherReport(studentId) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  $("portal-meta").textContent = `تقرير طالب — حقيقي عبر صلاحية المعلم (PHASE-7) · ${studentId}`;
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل التقرير الحقيقي…</div>`;
  const r = await api("GET", `/v1/students/${studentId}/dashboard`);
  if (r.status === 401 && (await refreshIfPossible())) return renderTeacherReport(studentId);
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
    return;
  }
  if (r.status === 404) {
    panel.innerHTML = `<div class="error">404 — الطالب غير موجود في نطاق مستأجرك (عزل المستأجر الحقيقي من PHASE-2).</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر تحميل التقرير (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  const d = r.json;
  const mastery = (d.mastery ?? []).map((m) => `<div class="item">🏅 <b>${esc(m.subject ?? m.skill ?? "")}</b> — ${esc(m.level)} · درجة ${esc(m.score ?? "—")}</div>`).join("");
  const recs = (d.recommendations ?? []).map((x) => `<div class="item">🔁 ${esc(x.proposedActivityType)} · ${esc(x.currentSkill)} → ${esc(x.targetSkill)}</div>`).join("");
  panel.innerHTML = `
    <div class="stat"><span class="muted small">أدلة مسجلة (حقيقية)</span><b>${d.progress?.evidenceCount ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط قوة</span><b>${d.strengths?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط ضعف</span><b>${d.weaknesses?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">فجوات</span><b>${d.gaps?.length ?? 0}</b></div>
    ${(d.mastery ?? []).length === 0 ? `<div class="muted small">لا سجلات إتقان بعد (بيانات حقيقية — لا وهمية).</div>` : mastery}
    ${recs || `<div class="muted small">لا توصيات حاليًا.</div>`}
    <div class="muted small">التوصية التالية: ${d.nextActivity ? `${esc(d.nextActivity.proposedActivityType)} — ${esc(d.nextActivity.currentSkill)} → ${esc(d.nextActivity.targetSkill)}` : "لا توصية تالية بعد"}</div>
    <button class="link" type="button" id="teacher-report-back">← عودة إلى قائمة المراجعة</button>`;
  $("teacher-report-back").addEventListener("click", () => renderStaffDashboard(role));
}

async function renderParentDashboard() {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  $("portal-meta").textContent = `الدور (من الهوية الموثقة): ${role}`;
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل بيانات الأبناء الحقيقية…</div>`;
  const r = await api("GET", "/v1/parents/children");
  if (r.status === 401 && (await refreshIfPossible())) return renderParentDashboard();
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الحماية الحقيقية من الـ API وليس من الواجهة.</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر تحميل قائمة الأبناء (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  const children = Array.isArray(r.json?.children) ? r.json.children : [];
  panel.innerHTML = `
    <div class="stat"><span class="muted small">الأبناء المرتبطون (حقيقي من /v1/parents/children — ربط ولي↔طالب)</span><b>${children.length}</b></div>
    ${children.length === 0 ? `<div class="muted small">لا أبناء مرتبطين بهذا الحساب بعد (قائمة حقيقية — لا بيانات وهمية).</div>` : children.map((ch) => `
      <div class="item" data-parent-child="${esc(ch.studentId)}">👨‍🎓 <b>${esc(ch.firstName)} ${esc(ch.lastName)}</b> <span class="muted small">${esc(ch.studentCode)}</span>
        <button class="link" type="button" data-child-report="${esc(ch.studentId)}">متابعة تقدم الابن (تقرير حقيقي)</button></div>`).join("")}
    <div class="muted small">التواصل والإشعارات: قدرات مرحلة لاحقة وفق خارطة الطريق (PHASE-11) — لا بيانات وهمية هنا.</div>`;
  panel.querySelectorAll("[data-child-report]").forEach((b) =>
    b.addEventListener("click", () => renderChildReport(b.dataset.childReport)));
}

async function renderChildReport(studentId) {
  const role = currentRole();
  $("portal-title").textContent = PORTAL_TITLES[role] ?? "البوابة";
  $("portal-meta").textContent = `متابعة تقدم الابن — تقرير حقيقي بصلاحية الولي (PHASE-8) · ${studentId}`;
  show("view-portal-home");
  const panel = $("portal-capability-panel");
  panel.innerHTML = `<div class="muted small">جارٍ تحميل التقرير الحقيقي…</div>`;
  const r = await api("GET", `/v1/parents/children/${studentId}/dashboard`);
  if (r.status === 401 && (await refreshIfPossible())) return renderChildReport(studentId);
  if (r.status === 403) {
    panel.innerHTML = `<div class="error">403 — غير مصرح: الربط ولي↔طالب هو الحد الحقيقي (API) وليس الواجهة.</div>`;
    return;
  }
  if (r.status === 404) {
    panel.innerHTML = `<div class="error">404 — الطالب غير موجود في نطاق مستأجرك (عزل المستأجر الحقيقي من PHASE-2).</div>`;
    return;
  }
  if (r.status !== 200) {
    panel.innerHTML = `<div class="error">تعذر تحميل تقرير الابن (${r.status}): ${esc(r.json?.error?.message ?? r.json?.error ?? "")} — لا بيانات وهمية.</div>`;
    return;
  }
  const d = r.json;
  const mastery = (d.mastery ?? []).map((m) => `<div class="item">🏅 <b>${esc(m.subject ?? m.skill ?? "")}</b> — ${esc(m.level)} · درجة ${esc(m.score ?? "—")}</div>`).join("");
  const recs = (d.recommendations ?? []).map((x) => `<div class="item">🔁 ${esc(x.proposedActivityType)} · ${esc(x.currentSkill)} → ${esc(x.targetSkill)}</div>`).join("");
  panel.innerHTML = `
    <div class="stat"><span class="muted small">أدلة مسجلة (حقيقية)</span><b>${d.progress?.evidenceCount ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط قوة</span><b>${d.strengths?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط ضعف</span><b>${d.weaknesses?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">فجوات</span><b>${d.gaps?.length ?? 0}</b></div>
    ${(d.mastery ?? []).length === 0 ? `<div class="muted small">لا سجلات إتقان بعد (بيانات حقيقية — لا وهمية).</div>` : mastery}
    ${recs || `<div class="muted small">لا توصيات حاليًا.</div>`}
    <div class="muted small">التوصية التالية: ${d.nextActivity ? `${esc(d.nextActivity.proposedActivityType)} — ${esc(d.nextActivity.currentSkill)} → ${esc(d.nextActivity.targetSkill)}` : "لا توصية تالية بعد"}</div>
    <button class="link" type="button" id="parent-report-back">← عودة إلى الأبناء</button>`;
  $("parent-report-back").addEventListener("click", () => renderParentDashboard());
}

function renderPortalPlaceholder(role, cap) {
  const phase = (PORTAL_CAP_PHASE[role] ?? {})[cap] ?? "مرحلة لاحقة معتمدة";
  $("portal-placeholder-title").textContent = `${PORTAL_CAP_TITLES[cap] ?? cap} — ${PORTAL_TITLES[role] ?? ""}`;
  $("portal-placeholder-phase").textContent = `القدرة موثقة في V1 وسيُبنى تنفيذها في ${phase} وفق MASTER ROADMAP. لا توجد بيانات وهمية هنا (ACR-E5-001).`;
  show("view-portal-placeholder");
}

async function renderDashboard() {
  if (state.authMode !== "student") {
    show("view-dashboard");
    return;
  }
  show("view-dashboard");
  $("dash-meta").textContent = `سياق المستأجر: ${state.tenantId}`;
  const d = await api("GET", `/v1/students/${state.studentId}/dashboard`);
  if (d.status === 401 && await refreshIfPossible()) return renderDashboard();
  if (d.status !== 200 || !d.json?.student) {
    $("dash-progress").innerHTML = `<div class="error">تعذر تحميل لوحة الطالب (${d.status}): ${esc(d.json?.error?.message ?? d.json?.error ?? "")} — لا تُعرض بيانات وهمية.</div>`;
    return;
  }
  const dash = d.json;
  $("dash-progress").innerHTML = `
    <div class="stat"><span class="muted small">أدلة مسجلة</span><b>${dash.progress?.evidenceCount ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط قوة</span><b>${dash.strengths?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">نقاط ضعف</span><b>${dash.weaknesses?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">فجوات</span><b>${dash.gaps?.length ?? 0}</b></div>
    <div class="stat"><span class="muted small">توصيات</span><b>${dash.recommendations?.length ?? 0}</b></div>`;
  renderNext(dash.nextActivity);
  renderRecommendations(dash.recommendations ?? []);
  await renderLessons(dash);
  renderSkills("dash-strengths", dash.strengths ?? []);
  renderSkills("dash-weaknesses", dash.weaknesses ?? []);
  $("dash-gaps").innerHTML = (dash.gaps?.length ?? 0) === 0
    ? `<div class="muted small">لا فجوات مسجلة حاليًا (من نموذج المتعلم الحقيقي).</div>`
    : dash.gaps.map((g) => `<div class="item">📐 <b>${esc(g.subject)}</b> / ${esc(g.skill)} <span class="badge insufficient">فجوة</span><div class="muted small">${esc(g.reason ?? "")}</div></div>`).join("");
  $("dash-mastery").innerHTML = (dash.mastery?.length ?? 0) === 0
    ? `<div class="muted small">لا سجلات إتقان بعد — تُكتب من المحركات الحقيقية عند إتمام تحليل القراءة.</div>`
    : dash.mastery.map((m) => `<div class="item">🏅 <b>${esc(m.subject ?? m.skill ?? "")}</b> — مستوى <b>${esc(m.level)}</b> · درجة ${esc(m.score ?? "—")} · محاولات ${esc(m.attempts ?? "—")} <div class="muted small">${esc(m.trend ?? "")} · آخر تحديث ${esc(m.updatedAt ?? "")}</div></div>`).join("");
  $("dash-recent").innerHTML = (dash.recentActivities?.length ?? 0) === 0
    ? `<div class="muted small">لا محاولات سابقة.</div>`
    : dash.recentActivities.map((a) => `<div class="item">📝 محاولة #${a.attemptNumber} — حالة <b>${esc(a.state)}</b> <span class="muted small">${esc(a.submittedAt ?? a.startedAt ?? "")}</span></div>`).join("");
  renderModel(dash.skills ?? []);
}

function renderNext(next) {
  $("dash-next").innerHTML = !next
    ? `<div class="muted small">لا توصية تالية بعد — تحتاج أدلة كافية (تُشتق توصيتك من أدلتك الحقيقية عبر النظام).</div>`
    : `<div class="item">🎯 <b>${esc(next.proposedActivityType)}</b> — من ${esc(next.currentSkill)} نحو ${esc(next.targetSkill)} <span class="badge">${esc(next.currentDimension)}</span>
       <div class="muted small">السبب: ${esc(next.reason ?? "")}</div>
       <div class="muted small">معيار إعادة التقييم: ${esc(next.reassessmentCriteria ?? "")} · ثقة ${esc(next.confidence ?? "")}${next.requiresTeacherApproval ? ' · <b>بحاجة موافقة معلم</b>' : ""}</div></div>`;
}

function renderRecommendations(recs) {
  $("dash-recommendations").innerHTML = recs.length === 0
    ? `<div class="muted small">لا توصيات بعد.</div>`
    : recs.map((r) => `<div class="item">🔁 <b>${esc(r.proposedActivityType)}</b> · ${esc(r.currentSkill)} → ${esc(r.targetSkill)} <span class="muted small">(${esc(r.source ?? "")}${r.requiresTeacherApproval ? " · بحاجة موافقة معلم" : ""})</span></div>`).join("");
}

function renderSkills(elId, skills) {
  $(elId).innerHTML = skills.length === 0
    ? `<div class="muted small">لا شيء بعد.</div>`
    : skills.map((s) => `<div class="item">${esc(s.subject)} / <b>${esc(s.skill)}</b> <span class="badge ${esc(s.level)}">${esc(s.level)}</span> <span class="muted small">${esc(s.trend ?? "")}</span></div>`).join("");
}

function renderModel(skills) {
  $("dash-model").innerHTML = skills.length === 0
    ? `<div class="muted small">نموذج المتعلم فارغ — يُبنى لحظيًا من أدلتك الحقيقية.</div>`
    : `<table><thead><tr><th>المادة</th><th>المهارة</th><th>البعد</th><th>المستوى</th><th>الاتجاه</th><th>الثقة</th><th>عدد الأدلة</th></tr></thead><tbody>` +
      skills.map((s) => `<tr><td>${esc(s.subject)}</td><td>${esc(s.skill)}</td><td>${esc(s.dimension)}</td><td><span class="badge ${esc(s.level)}">${esc(s.level)}</span></td><td>${esc(s.trend ?? "")}</td><td>${esc(s.confidence ?? "")}</td><td>${esc(s.sampleCount ?? "")}</td></tr>`).join("") +
      `</tbody></table>`;
}

async function renderLessons() {
  const l = await api("GET", "/v1/lessons");
  if (l.status !== 200 || !Array.isArray(l.json?.items)) {
    $("dash-lessons").innerHTML = `<div class="notice">تعذر تحميل الدروس (${l.status}) — ميزة الدروس غير متاحة الآن، ولا تُعرض بدائل وهمية.</div>`;
    return;
  }
  $("dash-lessons").innerHTML = l.json.items.length === 0
    ? `<div class="muted small">لا دروس منشورة في مستأجرك بعد.</div>`
    : l.json.items.map((c) => `<div class="item"><span class="title">${esc(c.title)}</span> <span class="muted small">${esc(c.curriculum?.subject ?? "")} · صف ${esc(c.curriculum?.gradeLevel ?? "")}</span>
        <button class="primary" data-open-lesson="${esc(c.id)}">فتح الدرس</button></div>`).join("");
  document.querySelectorAll("[data-open-lesson]").forEach((b) =>
    b.addEventListener("click", () => openLesson(b.dataset.openLesson)));
}

async function openLesson(lessonId) {
  const l = await api("GET", `/v1/lessons/${lessonId}`);
  if (l.status !== 200 || !l.json?.lesson) {
    alert(`تعذر فتح الدرس (${l.status})`);
    return;
  }
  state.currentLesson = lessonId;
  $("lesson-title").textContent = l.json.lesson.title;
  $("lesson-meta").textContent = `${l.json.lesson.curriculum?.subject ?? ""} · ${l.json.lesson.language ?? ""} · إصدار ${l.json.lesson.version}`;
  const exs = l.json.exercises ?? [];
  $("lesson-exercises").innerHTML = exs.length === 0
    ? `<div class="muted small">لا أنشطة منشورة مرتبطة بهذا الدرس بعد.</div>`
    : exs.map((x) => {
        const meta = x.metadata ?? null;
        const q = meta?.question ?? meta?.expression ?? meta?.expectedText ?? meta?.passageText ?? null;
        const voice = x.expectedResponse?.type === "VOICE";
        return `<div class="item" data-exercise='${esc(JSON.stringify({ id: x.exerciseId, engine: x.engineBinding, type: x.expectedResponse?.type, metadata: meta }))}'>
          <span class="title">${voice ? "🎤 نشاط قراءة (صوتي)" : "✏️ نشاط " + esc(x.engineBinding)}</span>
          <span class="badge">${esc(x.expectedResponse?.type ?? "")}</span>
          ${q !== null ? `<div class="title" style="margin-top:.4rem">${voice ? "نص القراءة" : "السؤال"}: ${esc(q)}</div>` : `<div class="notice">لا يوجد نص منشور لهذا النشاط بعد — لن تُعرض بيانات مصطنعة.</div>`}
          ${voice ? `<div class="notice">هذه المرحلة تفعّل اختيار ملف صوتي من المتصفح، طلب presign، الرفع، ثم إرسال المحاولة إلى المسار الحقيقي غير المتزامن.</div>` : ""}
          <button class="primary" data-start-attempt="${esc(x.exerciseId)}">${voice ? "بدء النشاط الصوتي" : "بدء النشاط"}</button>
        </div>`;
      }).join("");
  document.querySelectorAll("[data-start-attempt]").forEach((b) =>
    b.addEventListener("click", () => {
      const box = b.closest("[data-exercise]");
      startAttempt(JSON.parse(box.dataset.exercise));
    }));
  show("view-lesson");
}

async function startAttempt(ex) {
  state.currentExercise = ex;
  state.submitted = false;
  clearVoiceUploadUi();
  $("activity-title").textContent = `نشاط ${ex.engine}`;
  $("activity-meta").textContent = `تمرين ${ex.id}`;
  const meta = ex.metadata ?? {};
  const q = meta.question ?? meta.expression ?? voiceExpectedText(meta) ?? null;
  $("activity-body").innerHTML = isVoiceExercise(ex)
    ? renderVoicePrompt(meta)
    : (q !== null
      ? `<div class="item title">السؤال: ${esc(q)}</div>`
      : `<div class="notice">لا نص سؤال مُحاور في هذا التمرين — أدخل إجابتك وفق تعليمات معلمك.</div>`);
  $("activity-answer").value = "";
  $("activity-error").classList.add("hidden");
  $("activity-notice").classList.add("hidden");
  $("result-card").classList.add("hidden");
  $("activity-form").classList.remove("hidden");
  renderActivityMode(ex);
  show("view-activity");

  const r = await api("POST", "/v1/attempts", {
    idempotencyKey: uuid(),
    body: { activityId: ex.id, exerciseId: ex.id, attemptNumber: 1 },
  });
  if (r.status !== 201 && r.status !== 200) {
    $("activity-error").textContent = `تعذر بدء المحاولة (${r.status}): ${esc(r.json?.error ?? "")}`;
    $("activity-error").classList.remove("hidden");
    return;
  }
  state.attemptId = r.json.attempt.id;
  state.attemptStartedAt = Date.now();
  $("activity-notice").textContent = isVoiceExercise(ex)
    ? `المحاولة بدأت (${r.json.attempt.state}). اختر ملفك الصوتي ثم أرسل.`
    : `المحاولة بدأت (${r.json.attempt.state}). أجب ثم أرسل.`;
  $("activity-notice").classList.remove("hidden");
}

$("activity-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitAttempt();
});

async function submitAttempt() {
  if (!state.attemptId || state.submitted) return;
  const ex = state.currentExercise;
  const errEl = $("activity-error");
  errEl.classList.add("hidden");

  let engineInput;
  const meta = ex.metadata ?? {};
  if (isVoiceExercise(ex)) {
    try {
      engineInput = await prepareVoiceEngineInput(ex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "UPLOAD_FAILED");
      if (msg === "AUDIO_FILE_REQUIRED") errEl.textContent = "اختر ملفًا صوتيًا أولًا.";
      else if (msg === "VOICE_METADATA_MISSING") errEl.textContent = "هذا النشاط الصوتي ينقصه passageId أو sessionId في metadata المنشورة.";
      else errEl.textContent = `تعذر تجهيز الرفع الصوتي: ${msg}`;
      errEl.classList.remove("hidden");
      return;
    }
  } else {
    const answer = $("activity-answer").value.trim();
    if (!answer) {
      errEl.textContent = "أدخل إجابتك أولًا.";
      errEl.classList.remove("hidden");
      return;
    }
    engineInput = ex.engine === "NUMERACY"
      ? { task: { expression: String(meta.expression ?? meta.question ?? ""), domain: String(meta.domain ?? "arithmetic"), expectedAnswer: String(meta.expectedAnswer ?? ""), digitSet: String(meta.digitSet ?? "arabic") }, response: { finalAnswer: answer } }
      : { finalAnswer: answer };
  }

  state.submitted = true;
  $("activity-submit").disabled = true;
  const dur = Date.now() - (state.attemptStartedAt ?? Date.now());
  const r = await api("POST", `/v1/attempts/${state.attemptId}/submit`, {
    body: { durationMs: dur, engineInput },
  });
  if (r.status !== 200) {
    state.submitted = false;
    $("activity-submit").disabled = false;
    errEl.textContent = `تعذر إرسال المحاولة (${r.status}): ${esc(r.json?.error ?? "")}`;
    errEl.classList.remove("hidden");
    return;
  }
  $("activity-form").classList.add("hidden");
  $("activity-notice").classList.add("hidden");
  renderResult(r.json);
}

function renderResult(attempt) {
  $("result-card").classList.remove("hidden");
  const voiceMsg = isVoiceExercise(state.currentExercise)
    ? `<div class="notice">تم ربط ملف القراءة بالمحاولة وإرسالها إلى المسار غير المتزامن. حالة التحليل الحقيقية ستظهر لاحقًا في اللوحة عند اكتمال العامل.</div>`
    : "";
  $("activity-result").innerHTML = `
    <div class="item">حالة المحاولة: <b>${esc(attempt.state)}</b>${attempt.evidenceRef ? ` · <span class="muted small">دليل مسجل: ${esc(attempt.evidenceRef)}</span>` : ""}</div>
    ${voiceMsg}
    ${attempt.state === "EVIDENCE_RECORDED"
      ? `<div class="item">تم تقييم محاولتك وتسجيل الدليل في النظام. تفاصيل التقييم تُعرض في لوحتك عبر نموذج المتعلم الحقيقي.</div>`
      : attempt.state === "SUBMITTED"
        ? `<div class="notice">أُرسلت المحاولة إلى مسار التحليل الحقيقي. النتيجة ستُسجل عبر العامل ثم تظهر في لوحتك.</div>`
        : `<div class="notice">حالة المحاولة: ${esc(attempt.state)} — انتظر التحديث أو أعد التحميل.</div>`}`;
  $("result-actions").innerHTML = `
    <button class="primary" id="go-dash">عرض لوحتي</button>
    <button class="primary" id="retry-activity" style="background:#5a7fb5">إعادة النشاط</button>`;
  $("go-dash").addEventListener("click", () => renderDashboard());
  $("retry-activity").addEventListener("click", () => {
    state.attemptId = null;
    state.submitted = false;
    $("result-card").classList.add("hidden");
    startAttempt(state.currentExercise);
  });
}

(async function bootstrap() {
  showLoginMode("student");
  const hasSession = loadSession();
  if (!hasSession) {
    show("view-login");
    return;
  }
  if (state.authMode !== "student" && !(await refreshIfPossible())) {
    await safeLogout();
    return;
  }
  syncHeader();
  // PHASE-3: the role is ALWAYS re-verified from the authenticated identity —
  // the server derives it from the JWT via GET /v1/auth/me (reused endpoint).
  // The cached session copy is never trusted as the role source by itself.
  const me = await fetchVerifiedIdentity();
  if (!me) {
    await safeLogout();
    return;
  }
  state.user = me.user ?? state.user;
  if (state.authMode === "student" && !state.studentId && me.studentContext?.studentId) {
    state.studentId = me.studentContext.studentId;
  }
  persistSession();
  syncHeader();
  await activatePortal();
})();
