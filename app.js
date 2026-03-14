const state = {
  allQuestions: [],
  pool: [],
  currentIndex: 0,
  records: new Map(),
  bankSignature: "",
  wrongOnlyMode: false,
  highWrongMode: false,
  wrongStats: new Map(),
  quizReady: false
};

const STORAGE_KEY = "quiz_site_progress_v1";
const HIGH_WRONG_THRESHOLD = 2;

const refs = {
  appMain: document.getElementById("appMain"),
  qtypeSelect: document.getElementById("qtypeSelect"),
  subjectSelect: document.getElementById("subjectSelect"),
  randomToggle: document.getElementById("randomToggle"),
  resetBtn: document.getElementById("resetBtn"),
  clearProgressBtn: document.getElementById("clearProgressBtn"),
  refreshBankBtn: document.getElementById("refreshBankBtn"),
  wrongOnlyBtn: document.getElementById("wrongOnlyBtn"),
  highWrongBtn: document.getElementById("highWrongBtn"),
  exportWrongBtn: document.getElementById("exportWrongBtn"),
  exportHighWrongBtn: document.getElementById("exportHighWrongBtn"),
  clearHighWrongBtn: document.getElementById("clearHighWrongBtn"),
  analyzeWrongBtn: document.getElementById("analyzeWrongBtn"),
  stats: document.getElementById("stats"),
  infoBar: document.getElementById("infoBar"),
  analysisBox: document.getElementById("analysisBox"),
  questionWrap: document.getElementById("questionWrap"),
  emptyWrap: document.getElementById("emptyWrap"),
  meta: document.getElementById("meta"),
  stem: document.getElementById("stem"),
  optionArea: document.getElementById("optionArea"),
  textAnswerArea: document.getElementById("textAnswerArea"),
  textAnswerInput: document.getElementById("textAnswerInput"),
  prevBtn: document.getElementById("prevBtn"),
  submitBtn: document.getElementById("submitBtn"),
  nextBtn: document.getElementById("nextBtn"),
  resultBox: document.getElementById("resultBox")
};

function isReviewMode() {
  return state.wrongOnlyMode || state.highWrongMode;
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function computeBankSignature(questions) {
  let hash = 5381;
  for (const q of questions) {
    const token = `${q.id}|${q.qtype}|${q.subject}|${q.answer}|${(q.stem || "").slice(0, 24)}`;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 33) ^ token.charCodeAt(i);
    }
  }
  return `${questions.length}-${(hash >>> 0).toString(16)}`;
}

function readJsonStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (_err) {
    return null;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setInfo(message = "", isError = false) {
  if (!message) {
    refs.infoBar.classList.add("hidden");
    refs.infoBar.textContent = "";
    return;
  }
  refs.infoBar.classList.remove("hidden");
  refs.infoBar.textContent = message;
  refs.infoBar.style.color = isError ? "#c62828" : "";
}

function formatPct(numerator, denominator) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

async function fetchQuestionBank() {
  const resp = await fetch("./data/questions.json", { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function normalizeChoiceAnswer(answer) {
  const letters = (answer || "").toUpperCase().match(/[A-Z]/g);
  if (!letters || !letters.length) return (answer || "").trim().toUpperCase();
  return [...new Set(letters)].sort().join("");
}

function normalizeTextAnswer(answer) {
  return (answer || "").replace(/\s+/g, "").trim().toLowerCase();
}

function splitAlternatives(answer) {
  return (answer || "")
    .split(/[、/|；;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getCurrentQuestion() {
  return state.pool[state.currentIndex] || null;
}

function getWrongQuestionIdSet() {
  const wrongIds = new Set();
  for (const [id, record] of state.records.entries()) {
    if (!record.isCorrect) wrongIds.add(id);
  }
  return wrongIds;
}

function getHighWrongIdSet() {
  const ids = new Set();
  for (const [id, count] of state.wrongStats.entries()) {
    if (count >= HIGH_WRONG_THRESHOLD) ids.add(id);
  }
  return ids;
}

function updateWrongModeUi() {
  if (state.wrongOnlyMode) {
    refs.wrongOnlyBtn.textContent = "退出错题";
    refs.wrongOnlyBtn.classList.remove("secondary");
  } else {
    refs.wrongOnlyBtn.textContent = "只练错题";
    refs.wrongOnlyBtn.classList.add("secondary");
  }

  if (state.highWrongMode) {
    refs.highWrongBtn.textContent = "退出高频池";
    refs.highWrongBtn.classList.remove("secondary");
  } else {
    refs.highWrongBtn.textContent = "高频错题池";
    refs.highWrongBtn.classList.add("secondary");
  }
}

function updateStats() {
  const answered = state.records.size;
  const correct = [...state.records.values()].filter((r) => r.isCorrect).length;
  const accuracy = answered ? ((correct / answered) * 100).toFixed(1) : "0.0";
  const highWrongCount = getHighWrongIdSet().size;
  const modeText = state.highWrongMode ? "高频错题池" : state.wrongOnlyMode ? "只练错题" : "全部题目";
  refs.stats.innerHTML = [
    `模式 ${modeText}`,
    `题量 ${state.pool.length}`,
    `高频错题 ${highWrongCount}`,
    `已答 ${answered}`,
    `答对 ${correct}`,
    `正确率 ${accuracy}%`
  ]
    .map((s) => `<span>${s}</span>`)
    .join("");
}

function getDetailedRecords() {
  const questionMap = new Map(state.allQuestions.map((q) => [q.id, q]));
  return [...state.records.entries()]
    .map(([id, record]) => ({
      id,
      question: questionMap.get(id),
      userAnswer: record.userAnswer,
      isCorrect: record.isCorrect
    }))
    .filter((x) => x.question);
}

function buildWrongAnalysisHtml() {
  const details = getDetailedRecords();
  const answered = details.length;
  const wrongs = details.filter((d) => !d.isCorrect);
  const highWrongIds = getHighWrongIdSet();

  if (!answered && !highWrongIds.size) {
    return `
      <h3>智能分析错题集</h3>
      <div class="summary">你还没有提交过题目，先做几题再来分析。</div>
    `;
  }

  if (!wrongs.length && !highWrongIds.size) {
    return `
      <h3>智能分析错题集</h3>
      <div class="summary">已作答 ${answered} 题，当前错题为 0，继续保持。</div>
    `;
  }

  const qtypeStat = {};
  const subjectStat = {};
  const wrongOptionStat = {};

  details.forEach((d) => {
    const { qtype, subject } = d.question;
    if (!qtypeStat[qtype]) qtypeStat[qtype] = { answered: 0, wrong: 0 };
    qtypeStat[qtype].answered += 1;
    if (!d.isCorrect) qtypeStat[qtype].wrong += 1;

    if (!subjectStat[subject]) subjectStat[subject] = { answered: 0, wrong: 0 };
    subjectStat[subject].answered += 1;
    if (!d.isCorrect) subjectStat[subject].wrong += 1;

    if (!d.isCorrect && d.question.options && d.question.options.length) {
      const chosen = normalizeChoiceAnswer(d.userAnswer);
      if (chosen) {
        for (const letter of chosen) {
          wrongOptionStat[letter] = (wrongOptionStat[letter] || 0) + 1;
        }
      }
    }
  });

  const qtypeItems = Object.entries(qtypeStat)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .map(
      ([name, v]) =>
        `<li><strong>${escapeHtml(name)}</strong>：错 ${v.wrong} / ${v.answered}（${formatPct(v.wrong, v.answered)}）</li>`
    )
    .join("");

  const subjectItems = Object.entries(subjectStat)
    .sort((a, b) => b[1].wrong - a[1].wrong)
    .map(
      ([name, v]) =>
        `<li><strong>${escapeHtml(name)}</strong>：错 ${v.wrong} / ${v.answered}（${formatPct(v.wrong, v.answered)}）</li>`
    )
    .join("");

  const optionItems = Object.entries(wrongOptionStat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `<li>选项 <strong>${escapeHtml(k)}</strong>：误选/误判 ${v} 次</li>`)
    .join("");

  const mainWeak = Object.entries(qtypeStat).sort((a, b) => b[1].wrong - a[1].wrong)[0];
  const subjectWeak = Object.entries(subjectStat).sort((a, b) => b[1].wrong - a[1].wrong)[0];

  const tips = [];
  if (mainWeak && mainWeak[1].wrong > 0) {
    tips.push(`优先复盘「${mainWeak[0]}」：这是你当前错题最多的题型。`);
  }
  if (subjectWeak && subjectWeak[1].wrong > 0) {
    tips.push(`优先刷「${subjectWeak[0]}」：该科目当前错题更集中。`);
  }
  if (wrongOptionStat.B > (wrongOptionStat.A || 0) + (wrongOptionStat.D || 0)) {
    tips.push("你对中间选项存在偏好，建议先排除明显错误项再选。");
  }
  if (!tips.length) {
    tips.push("建议每次先做 20 题，再针对错题二刷一遍。");
  }

  const latestWrongs = wrongs
    .slice(-6)
    .reverse()
    .map((d) => {
      const shortStem = escapeHtml(d.question.stem.length > 45 ? `${d.question.stem.slice(0, 45)}...` : d.question.stem);
      return `<li>[${escapeHtml(d.question.qtype)}] ${shortStem}<br/>你的答案：${escapeHtml(
        d.userAnswer || "(空)"
      )}；正确答案：${escapeHtml(d.question.answer)}</li>`;
    })
    .join("");

  const highWrongRows = state.allQuestions
    .filter((q) => highWrongIds.has(q.id))
    .sort((a, b) => (state.wrongStats.get(b.id) || 0) - (state.wrongStats.get(a.id) || 0))
    .slice(0, 6)
    .map((q) => {
      const shortStem = escapeHtml(q.stem.length > 45 ? `${q.stem.slice(0, 45)}...` : q.stem);
      const cnt = state.wrongStats.get(q.id) || 0;
      return `<li>[${escapeHtml(q.qtype)}] ${shortStem}（累计错 ${cnt} 次）</li>`;
    })
    .join("");

  return `
    <h3>智能分析错题集</h3>
    <div class="summary">已答 ${answered} 题，错题 ${wrongs.length} 题，整体错误率 ${formatPct(wrongs.length, answered)}。</div>
    <div class="analysis-tip">${escapeHtml(tips.join(" "))}</div>
    <div class="analysis-grid">
      <div class="analysis-card">
        <h4>按题型错题分布</h4>
        <ol class="analysis-list">${qtypeItems}</ol>
      </div>
      <div class="analysis-card">
        <h4>按科目错题分布</h4>
        <ol class="analysis-list">${subjectItems}</ol>
      </div>
      <div class="analysis-card">
        <h4>高频误选项</h4>
        <ol class="analysis-list">${optionItems || "<li>暂无客观题误选数据</li>"}</ol>
      </div>
    </div>
    <div class="analysis-card">
      <h4>最近错题（最多 6 题）</h4>
      <ol class="analysis-list">${latestWrongs || "<li>暂无本轮错题记录</li>"}</ol>
    </div>
    <div class="analysis-card" style="margin-top:10px;">
      <h4>历史高频错题（累计）</h4>
      <ol class="analysis-list">${highWrongRows || "<li>暂无高频错题（累计错题次数未达到阈值）</li>"}</ol>
    </div>
  `;
}

function renderWrongAnalysis() {
  refs.analysisBox.innerHTML = buildWrongAnalysisHtml();
  refs.analysisBox.classList.remove("hidden");
}

function saveProgress() {
  try {
    const current = getCurrentQuestion();
    const payload = {
      bankSignature: state.bankSignature,
      qtype: refs.qtypeSelect.value,
      subject: refs.subjectSelect.value,
      randomMode: refs.randomToggle.checked,
      wrongOnlyMode: state.wrongOnlyMode,
      highWrongMode: state.highWrongMode,
      poolIds: state.pool.map((q) => q.id),
      currentQuestionId: current ? current.id : null,
      records: [...state.records.entries()].map(([id, value]) => ({
        id,
        userAnswer: value.userAnswer,
        isCorrect: !!value.isCorrect
      })),
      wrongStats: [...state.wrongStats.entries()].map(([id, count]) => ({ id, count })),
      savedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_err) {
    // 忽略存储失败（如隐私模式）
  }
}

function restoreProgress() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (_err) {
    return false;
  }
  if (!saved) return false;

  if (saved.bankSignature !== state.bankSignature) {
    setInfo("检测到题库版本变化，已启用新进度。");
    return false;
  }

  const idMap = new Map(state.allQuestions.map((q) => [q.id, q]));
  const restoredPool = (saved.poolIds || []).map((id) => idMap.get(id)).filter(Boolean);
  if (!restoredPool.length) return false;

  if (["全部", "单选题", "多选题", "判断题", "填空题"].includes(saved.qtype)) {
    refs.qtypeSelect.value = saved.qtype;
  }
  if (["全部", "科目一", "科目二"].includes(saved.subject)) {
    refs.subjectSelect.value = saved.subject;
  }
  refs.randomToggle.checked = !!saved.randomMode;
  state.wrongOnlyMode = !!saved.wrongOnlyMode;
  state.highWrongMode = !!saved.highWrongMode;
  updateWrongModeUi();

  state.pool = restoredPool;
  state.records = new Map(
    (saved.records || [])
      .filter((item) => idMap.has(item.id))
      .map((item) => [item.id, { userAnswer: item.userAnswer || "", isCorrect: !!item.isCorrect }])
  );
  state.wrongStats = new Map(
    (saved.wrongStats || [])
      .filter((item) => idMap.has(item.id))
      .map((item) => [item.id, Math.max(0, Number(item.count) || 0)])
  );

  const index = state.pool.findIndex((q) => q.id === saved.currentQuestionId);
  state.currentIndex = index >= 0 ? index : 0;

  refs.questionWrap.classList.toggle("hidden", state.pool.length === 0);
  refs.emptyWrap.classList.toggle("hidden", state.pool.length > 0);

  if (state.pool.length > 0) {
    renderQuestion();
    updateStats();
    setInfo("已恢复上次练习进度。");
    return true;
  }
  return false;
}

function setResult(text, isCorrect) {
  if (!text) {
    refs.resultBox.className = "result card hidden";
    refs.resultBox.textContent = "";
    return;
  }
  refs.resultBox.className = `result card ${isCorrect ? "ok" : "bad"}`;
  refs.resultBox.textContent = text;
  // 提交后确保答案解析立即进入可视区
  refs.resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderOptions(question, record) {
  refs.optionArea.innerHTML = "";
  refs.textAnswerInput.value = "";

  const hasOptions = question.options && question.options.length > 0;
  if (!hasOptions) {
    refs.textAnswerArea.classList.remove("hidden");
    if (record && !isReviewMode()) refs.textAnswerInput.value = record.userAnswer || "";
    return;
  }

  refs.textAnswerArea.classList.add("hidden");
  const list = document.createElement("div");
  list.className = "option-list";
  const multi = question.qtype === "多选题";

  question.options.forEach((opt) => {
    const wrap = document.createElement("div");
    wrap.className = "option-item";
    const checked = record ? normalizeChoiceAnswer(record.userAnswer).includes(opt.key) : false;
    const disabled = !!record && !isReviewMode();
    wrap.innerHTML = `
      <input
        type="${multi ? "checkbox" : "radio"}"
        name="optionAnswer"
        value="${escapeHtml(opt.key)}"
        ${checked ? "checked" : ""}
        ${disabled ? "disabled" : ""}
      />
      <span>${escapeHtml(opt.key)}. ${escapeHtml(opt.text)}</span>
    `;
    wrap.addEventListener("click", (e) => {
      const input = wrap.querySelector('input[name="optionAnswer"]');
      if (!input || input.disabled) return;

      if (e.target instanceof HTMLInputElement) {
        if (!multi) {
          setTimeout(() => submitAnswer({ silentIfSubmitted: true }), 0);
        }
        return;
      }

      if (multi) {
        input.click();
        return;
      }

      input.checked = true;
      setTimeout(() => submitAnswer({ silentIfSubmitted: true }), 0);
    });

    // 单选/判断题：点选后立即判题
    if (!multi && !record) {
      const input = wrap.querySelector('input[name="optionAnswer"]');
      if (input) {
        input.addEventListener("change", () => submitAnswer({ silentIfSubmitted: true }));
      }
    }
    list.appendChild(wrap);
  });
  refs.optionArea.appendChild(list);
}

function renderQuestion() {
  const q = getCurrentQuestion();
  if (!q) return;

  const record = state.records.get(q.id);
  refs.meta.textContent = `第 ${state.currentIndex + 1} / ${state.pool.length} 题 · ${q.qtype} · ${q.subject}`;
  refs.stem.textContent = q.stem;
  renderOptions(q, record);

  if (record && !isReviewMode()) {
    const text = `${record.isCorrect ? "回答正确" : "回答错误"}。标准答案：${q.answer}`;
    setResult(text, record.isCorrect);
  } else {
    setResult("", false);
  }

  refs.prevBtn.disabled = state.currentIndex === 0;
}

function applyFilters() {
  const qtype = refs.qtypeSelect.value;
  const subject = refs.subjectSelect.value;
  let base = state.allQuestions;
  if (state.highWrongMode) {
    const highWrongIds = getHighWrongIdSet();
    base = state.allQuestions.filter((q) => highWrongIds.has(q.id));
  } else if (state.wrongOnlyMode) {
    const wrongIds = getWrongQuestionIdSet();
    base = state.allQuestions.filter((q) => wrongIds.has(q.id));
  }

  let pool = base.filter((q) => {
    const qtypeOk = qtype === "全部" || q.qtype === qtype;
    const subjectOk = subject === "全部" || q.subject === subject;
    return qtypeOk && subjectOk;
  });

  if (refs.randomToggle.checked) pool = shuffle(pool);
  state.pool = pool;
}

function resetQuiz() {
  state.wrongOnlyMode = false;
  state.highWrongMode = false;
  updateWrongModeUi();
  applyFilters();
  state.currentIndex = 0;
  state.records = new Map();

  const hasData = state.pool.length > 0;
  refs.questionWrap.classList.toggle("hidden", !hasData);
  refs.emptyWrap.classList.toggle("hidden", hasData);

  if (hasData) renderQuestion();
  updateStats();
  setInfo("进度已重置。");
  saveProgress();
}

function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
  state.wrongStats = new Map();
  resetQuiz();
  refs.analysisBox.classList.add("hidden");
  setInfo("已清空历史进度。");
}

function toggleWrongOnlyMode() {
  if (state.highWrongMode) {
    state.highWrongMode = false;
  }
  if (!state.wrongOnlyMode) {
    const wrongCount = getWrongQuestionIdSet().size;
    if (!wrongCount) {
      setInfo("当前没有错题，先做题后再开启只练错题。");
      return;
    }
    state.wrongOnlyMode = true;
    updateWrongModeUi();
    applyFilters();
    state.currentIndex = 0;
    const hasData = state.pool.length > 0;
    refs.questionWrap.classList.toggle("hidden", !hasData);
    refs.emptyWrap.classList.toggle("hidden", hasData);
    if (hasData) renderQuestion();
    updateStats();
    saveProgress();
    setInfo(`已进入只练错题模式，共 ${state.pool.length} 题。`);
    return;
  }

  state.wrongOnlyMode = false;
  updateWrongModeUi();
  applyFilters();
  state.currentIndex = 0;
  const hasData = state.pool.length > 0;
  refs.questionWrap.classList.toggle("hidden", !hasData);
  refs.emptyWrap.classList.toggle("hidden", hasData);
  if (hasData) renderQuestion();
  updateStats();
  saveProgress();
  setInfo("已退出只练错题模式。");
}

function toggleHighWrongMode() {
  if (state.wrongOnlyMode) {
    state.wrongOnlyMode = false;
  }

  if (!state.highWrongMode) {
    const highCount = getHighWrongIdSet().size;
    if (!highCount) {
      setInfo(`当前没有高频错题（阈值 >= ${HIGH_WRONG_THRESHOLD} 次）。`);
      return;
    }
    state.highWrongMode = true;
    updateWrongModeUi();
    applyFilters();
    state.currentIndex = 0;
    const hasData = state.pool.length > 0;
    refs.questionWrap.classList.toggle("hidden", !hasData);
    refs.emptyWrap.classList.toggle("hidden", hasData);
    if (hasData) renderQuestion();
    updateStats();
    saveProgress();
    setInfo(`已进入高频错题池，共 ${state.pool.length} 题。`);
    return;
  }

  state.highWrongMode = false;
  updateWrongModeUi();
  applyFilters();
  state.currentIndex = 0;
  const hasData = state.pool.length > 0;
  refs.questionWrap.classList.toggle("hidden", !hasData);
  refs.emptyWrap.classList.toggle("hidden", hasData);
  if (hasData) renderQuestion();
  updateStats();
  saveProgress();
  setInfo("已退出高频错题池。");
}

function exportHighWrongPool() {
  const ids = getHighWrongIdSet();
  if (!ids.size) {
    setInfo(`当前没有高频错题（阈值 >= ${HIGH_WRONG_THRESHOLD} 次）。`);
    return;
  }

  const rows = state.allQuestions
    .filter((q) => ids.has(q.id))
    .map((q) => ({
      id: q.id,
      qtype: q.qtype,
      subject: q.subject,
      wrongCount: state.wrongStats.get(q.id) || 0,
      stem: q.stem,
      options: q.options,
      answer: q.answer
    }));

  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  a.href = url;
  a.download = `high-wrong-pool-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setInfo(`已导出高频错题 ${rows.length} 题。`);
}

function exportWrongPool() {
  const ids = getWrongQuestionIdSet();
  if (!ids.size) {
    setInfo("当前没有错题可导出。");
    return;
  }

  const rows = state.allQuestions
    .filter((q) => ids.has(q.id))
    .map((q) => {
      const record = state.records.get(q.id) || { userAnswer: "", isCorrect: false };
      return {
        id: q.id,
        qtype: q.qtype,
        subject: q.subject,
        wrongCount: state.wrongStats.get(q.id) || 0,
        userAnswer: record.userAnswer || "",
        stem: q.stem,
        options: q.options,
        answer: q.answer
      };
    });

  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  a.href = url;
  a.download = `wrong-questions-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setInfo(`已导出错题 ${rows.length} 题。`);
}

function clearHighWrongPool() {
  const ids = getHighWrongIdSet();
  if (!ids.size) {
    setInfo("高频错题池已为空。");
    return;
  }
  for (const id of ids) {
    state.wrongStats.delete(id);
  }

  if (state.highWrongMode) {
    state.highWrongMode = false;
  }

  updateWrongModeUi();
  applyFilters();
  state.currentIndex = 0;
  const hasData = state.pool.length > 0;
  refs.questionWrap.classList.toggle("hidden", !hasData);
  refs.emptyWrap.classList.toggle("hidden", hasData);
  if (hasData) renderQuestion();
  updateStats();
  saveProgress();
  setInfo("已清空高频错题池。");
}

async function refreshQuestionBank() {
  setInfo("正在检查题库更新...");
  try {
    const latest = await fetchQuestionBank();
    const latestSig = computeBankSignature(latest);

    if (latestSig === state.bankSignature) {
      setInfo("题库已是最新版本。");
      return;
    }

    const confirmed = confirm("检测到题库更新，更新后将清空当前进度，是否继续？");
    if (!confirmed) {
      setInfo("已取消更新。");
      return;
    }

    state.allQuestions = latest;
    state.bankSignature = latestSig;
    state.wrongStats = new Map();
    localStorage.removeItem(STORAGE_KEY);
    resetQuiz();
    setInfo("题库已更新到最新版本。");
  } catch (err) {
    setInfo(`检查更新失败：${err.message}`, true);
  }
}

function getUserAnswer(question) {
  const hasOptions = question.options && question.options.length > 0;
  if (!hasOptions) return refs.textAnswerInput.value.trim();

  const inputs = [...document.querySelectorAll('input[name="optionAnswer"]')];
  if (question.qtype === "多选题") {
    return inputs
      .filter((el) => el.checked)
      .map((el) => el.value)
      .sort()
      .join("");
  }
  const selected = inputs.find((el) => el.checked);
  return selected ? selected.value : "";
}

function checkAnswer(question, userAnswer) {
  const hasOptions = question.options && question.options.length > 0;
  if (hasOptions) {
    return normalizeChoiceAnswer(userAnswer) === normalizeChoiceAnswer(question.answer);
  }
  const user = normalizeTextAnswer(userAnswer);
  const alternatives = splitAlternatives(question.answer).map((v) => normalizeTextAnswer(v));
  return alternatives.includes(user);
}

function submitAnswer(options = {}) {
  const { silentIfSubmitted = false } = options;
  const q = getCurrentQuestion();
  if (!q) return;

  if (state.records.has(q.id) && !isReviewMode()) {
    if (!silentIfSubmitted) {
      alert("这题你已经提交过了，可点下一题或上一题。");
    }
    return;
  }

  const userAnswer = getUserAnswer(q);
  if (!userAnswer) {
    alert("请先作答。");
    return;
  }

  const isCorrect = checkAnswer(q, userAnswer);
  state.records.set(q.id, { userAnswer, isCorrect });
  if (!isCorrect) {
    state.wrongStats.set(q.id, (state.wrongStats.get(q.id) || 0) + 1);
  }
  setResult(`${isCorrect ? "回答正确" : "回答错误"}。标准答案：${q.answer}`, isCorrect);
  updateStats();
  saveProgress();
  if (!refs.analysisBox.classList.contains("hidden")) {
    renderWrongAnalysis();
  }
}

function prevQuestion() {
  if (state.currentIndex <= 0) return;
  state.currentIndex -= 1;
  renderQuestion();
  saveProgress();
}

function nextQuestion() {
  if (state.currentIndex >= state.pool.length - 1) {
    const answered = state.records.size;
    const correct = [...state.records.values()].filter((r) => r.isCorrect).length;
    const accuracy = answered ? ((correct / answered) * 100).toFixed(1) : "0.0";
    alert(`本轮结束\n已答：${answered} 题\n答对：${correct} 题\n正确率：${accuracy}%`);
    return;
  }
  state.currentIndex += 1;
  renderQuestion();
  saveProgress();
}

function bindQuizEvents() {
  refs.qtypeSelect.addEventListener("change", resetQuiz);
  refs.subjectSelect.addEventListener("change", resetQuiz);
  refs.randomToggle.addEventListener("change", resetQuiz);
  refs.resetBtn.addEventListener("click", resetQuiz);
  refs.clearProgressBtn.addEventListener("click", () => {
    const ok = confirm("确认清空本地历史进度吗？");
    if (ok) clearProgress();
  });
  refs.refreshBankBtn.addEventListener("click", refreshQuestionBank);
  refs.wrongOnlyBtn.addEventListener("click", toggleWrongOnlyMode);
  refs.highWrongBtn.addEventListener("click", toggleHighWrongMode);
  refs.exportWrongBtn.addEventListener("click", exportWrongPool);
  refs.exportHighWrongBtn.addEventListener("click", exportHighWrongPool);
  refs.clearHighWrongBtn.addEventListener("click", () => {
    const ok = confirm(`确认清空高频错题池（错题次数 >= ${HIGH_WRONG_THRESHOLD}）吗？`);
    if (ok) clearHighWrongPool();
  });
  refs.analyzeWrongBtn.addEventListener("click", renderWrongAnalysis);
  refs.prevBtn.addEventListener("click", prevQuestion);
  refs.submitBtn.addEventListener("click", submitAnswer);
  refs.nextBtn.addEventListener("click", nextQuestion);
}

async function ensureQuizReady() {
  if (state.quizReady) return;
  state.allQuestions = await fetchQuestionBank();
  state.bankSignature = computeBankSignature(state.allQuestions);
  bindQuizEvents();
  const restored = restoreProgress();
  if (!restored) {
    resetQuiz();
    setInfo("已开启新进度。");
  }
  state.quizReady = true;
}

async function init() {
  try {
    await ensureQuizReady();
  } catch (err) {
    setInfo(`初始化失败：${err.message}`, true);
  }
}

init();
