const state = {
  allQuestions: [],
  pool: [],
  currentIndex: 0,
  records: new Map()
};

const refs = {
  qtypeSelect: document.getElementById("qtypeSelect"),
  subjectSelect: document.getElementById("subjectSelect"),
  randomToggle: document.getElementById("randomToggle"),
  resetBtn: document.getElementById("resetBtn"),
  stats: document.getElementById("stats"),
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
    wrap.innerHTML = `
      <input
        type="${multi ? "checkbox" : "radio"}"
        name="optionAnswer"
        value="${escapeHtml(opt.key)}"
        ${checked ? "checked" : ""}
      />
      <span>${escapeHtml(opt.key)}. ${escapeHtml(opt.text)}</span>
    `;
    wrap.addEventListener("click", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const input = wrap.querySelector('input[name="optionAnswer"]');
      if (input) input.click();
    });
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

function submitAnswer() {
  const q = getCurrentQuestion();
  if (!q) return;

  if (state.records.has(q.id)) {
    alert("这题你已经提交过了，可点下一题或上一题。");
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
}

function prevQuestion() {
  if (state.currentIndex <= 0) return;
  state.currentIndex -= 1;
  renderQuestion();
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
}

function bindEvents() {
  refs.qtypeSelect.addEventListener("change", resetQuiz);
  refs.subjectSelect.addEventListener("change", resetQuiz);
  refs.randomToggle.addEventListener("change", resetQuiz);
  refs.resetBtn.addEventListener("click", resetQuiz);
  refs.prevBtn.addEventListener("click", prevQuestion);
  refs.submitBtn.addEventListener("click", submitAnswer);
  refs.nextBtn.addEventListener("click", nextQuestion);
}

async function init() {
  try {
    const resp = await fetch("./data/questions.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.allQuestions = await resp.json();
    bindEvents();
    resetQuiz();
  } catch (err) {
    refs.questionWrap.classList.add("hidden");
    refs.emptyWrap.classList.remove("hidden");
    refs.emptyWrap.textContent = `题库加载失败：${err.message}`;
  }
}

init();
