const state = {
  allQuestions: [],
  pool: [],
  currentIndex: 0,
  records: new Map(),
  bankSignature: ""
};

const STORAGE_KEY = "quiz_site_progress_v1";

const refs = {
  qtypeSelect: document.getElementById("qtypeSelect"),
  subjectSelect: document.getElementById("subjectSelect"),
  randomToggle: document.getElementById("randomToggle"),
  resetBtn: document.getElementById("resetBtn"),
  clearProgressBtn: document.getElementById("clearProgressBtn"),
  refreshBankBtn: document.getElementById("refreshBankBtn"),
  stats: document.getElementById("stats"),
  infoBar: document.getElementById("infoBar"),
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

function updateStats() {
  const answered = state.records.size;
  const correct = [...state.records.values()].filter((r) => r.isCorrect).length;
  const accuracy = answered ? ((correct / answered) * 100).toFixed(1) : "0.0";
  refs.stats.innerHTML = [
    `题量 ${state.pool.length}`,
    `已答 ${answered}`,
    `答对 ${correct}`,
    `正确率 ${accuracy}%`
  ]
    .map((s) => `<span>${s}</span>`)
    .join("");
}

function saveProgress() {
  try {
    const current = getCurrentQuestion();
    const payload = {
      bankSignature: state.bankSignature,
      qtype: refs.qtypeSelect.value,
      subject: refs.subjectSelect.value,
      randomMode: refs.randomToggle.checked,
      poolIds: state.pool.map((q) => q.id),
      currentQuestionId: current ? current.id : null,
      records: [...state.records.entries()].map(([id, value]) => ({
        id,
        userAnswer: value.userAnswer,
        isCorrect: !!value.isCorrect
      })),
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

  state.pool = restoredPool;
  state.records = new Map(
    (saved.records || [])
      .filter((item) => idMap.has(item.id))
      .map((item) => [item.id, { userAnswer: item.userAnswer || "", isCorrect: !!item.isCorrect }])
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
}

function renderOptions(question, record) {
  refs.optionArea.innerHTML = "";
  refs.textAnswerInput.value = "";

  const hasOptions = question.options && question.options.length > 0;
  if (!hasOptions) {
    refs.textAnswerArea.classList.remove("hidden");
    if (record) refs.textAnswerInput.value = record.userAnswer || "";
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
    const disabled = !!record;
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

  if (record) {
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
  let pool = state.allQuestions.filter((q) => {
    const qtypeOk = qtype === "全部" || q.qtype === qtype;
    const subjectOk = subject === "全部" || q.subject === subject;
    return qtypeOk && subjectOk;
  });

  if (refs.randomToggle.checked) pool = shuffle(pool);
  state.pool = pool;
}

function resetQuiz() {
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
  resetQuiz();
  setInfo("已清空历史进度。");
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

  if (state.records.has(q.id)) {
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
  setResult(`${isCorrect ? "回答正确" : "回答错误"}。标准答案：${q.answer}`, isCorrect);
  updateStats();
  saveProgress();
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

function bindEvents() {
  refs.qtypeSelect.addEventListener("change", resetQuiz);
  refs.subjectSelect.addEventListener("change", resetQuiz);
  refs.randomToggle.addEventListener("change", resetQuiz);
  refs.resetBtn.addEventListener("click", resetQuiz);
  refs.clearProgressBtn.addEventListener("click", () => {
    const ok = confirm("确认清空本地历史进度吗？");
    if (ok) clearProgress();
  });
  refs.refreshBankBtn.addEventListener("click", refreshQuestionBank);
  refs.prevBtn.addEventListener("click", prevQuestion);
  refs.submitBtn.addEventListener("click", submitAnswer);
  refs.nextBtn.addEventListener("click", nextQuestion);
}

async function init() {
  try {
    state.allQuestions = await fetchQuestionBank();
    state.bankSignature = computeBankSignature(state.allQuestions);
    bindEvents();
    const restored = restoreProgress();
    if (!restored) {
      resetQuiz();
      setInfo("已开启新进度。");
    }
  } catch (err) {
    refs.questionWrap.classList.add("hidden");
    refs.emptyWrap.classList.remove("hidden");
    refs.emptyWrap.textContent = `题库加载失败：${err.message}`;
  }
}

init();
