(function () {
  const PASSWORD = "dealer2026";
  const MAX_STACK = 20000;
  const TIME_LIMIT = 15;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor("#0f172a");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#0f172a");
  }

  const screens = {
    login: document.getElementById("screen-login"),
    menu: document.getElementById("screen-menu"),
    trainerMenu: document.getElementById("screen-trainer-menu"),
    trainer: document.getElementById("screen-trainer"),
    tests: document.getElementById("screen-tests"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.add("hidden"));
    screens[name].classList.remove("hidden");
  }

  const passwordInput = document.getElementById("password-input");
  const loginError = document.getElementById("login-error");
  const livesEl = document.getElementById("lives");
  const timerEl = document.getElementById("timer");
  const taskTextEl = document.getElementById("task-text");
  const questionTextEl = document.getElementById("question-text");
  const questionMetaEl = document.getElementById("question-meta");
  const answerInput = document.getElementById("answer-input");
  const feedbackEl = document.getElementById("feedback");
  const btnCheck = document.getElementById("btn-check");
  const btnNext = document.getElementById("btn-next");
  const gameOverEl = document.getElementById("game-over");
  const finalScoreEl = document.getElementById("final-score");
  const testQuestionEl = document.getElementById("test-question");
  const testOptionsEl = document.getElementById("test-options");
  const testFeedbackEl = document.getElementById("test-feedback");
  const testQuizEl = document.getElementById("test-quiz");
  const testResultEl = document.getElementById("test-result");
  const testScoreEl = document.getElementById("test-score");
  const testProgressLabel = document.getElementById("test-progress-label");
  const testProgressFill = document.getElementById("test-progress-fill");
  const testProgressWrap = document.getElementById("test-progress-wrap");

  let timedMode = false;
  let lives = 2;
  let questionNumber = 1;
  let solvedCount = 0;
  let currentTask = null;
  let answered = false;
  let gameOver = false;
  let timerId = null;
  let autoNextId = null;
  let testAdvanceId = null;
  let timeLeft = TIME_LIMIT;
  let testIndex = 0;
  let testScore = 0;
  let testLocked = false;

  function replayClass(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    timerEl.classList.remove("running");
  }

  function stopPending() {
    stopTimer();
    if (autoNextId) {
      clearTimeout(autoNextId);
      autoNextId = null;
    }
    if (testAdvanceId) {
      clearTimeout(testAdvanceId);
      testAdvanceId = null;
    }
  }

  function renderLives() {
    const hearts = livesEl.querySelectorAll(".heart");
    hearts.forEach((heart, i) => {
      if (i < lives) {
        heart.textContent = "❤️";
        heart.classList.remove("lost");
      } else {
        heart.textContent = "💔";
        heart.classList.add("lost");
      }
    });
  }

  function resetGame() {
    stopPending();
    timedMode = false;
    lives = 2;
    questionNumber = 1;
    solvedCount = 0;
    currentTask = null;
    answered = false;
    gameOver = false;
    timeLeft = TIME_LIMIT;

    answerInput.value = "";
    answerInput.disabled = false;
    answerInput.classList.remove("flash-ok", "flash-bad", "shake");
    feedbackEl.classList.add("hidden");
    feedbackEl.classList.remove("ok", "bad");
    btnCheck.classList.remove("hidden");
    btnNext.classList.add("hidden");
    gameOverEl.classList.add("hidden");
    timerEl.classList.add("hidden");
    timerEl.classList.remove("warn", "running");
    questionMetaEl.textContent = "Вопрос 1";
    taskTextEl.textContent = "";
    questionTextEl.textContent = "";
    renderLives();

    testIndex = 0;
    testScore = 0;
    testLocked = false;
    testQuizEl.classList.remove("hidden");
    testResultEl.classList.add("hidden");
    testProgressWrap.classList.remove("hidden");
    testFeedbackEl.classList.add("hidden");
    testFeedbackEl.classList.remove("ok", "bad");
    testOptionsEl.innerHTML = "";
    testQuestionEl.textContent = "";
    testScoreEl.textContent = "";
    testProgressLabel.textContent = "Вопрос 1 из 5";
    testProgressFill.style.width = "20%";
  }

  function goToMenu() {
    resetGame();
    showScreen("menu");
  }

  function tryLogin() {
    if (passwordInput.value === PASSWORD) {
      loginError.classList.add("hidden");
      passwordInput.classList.remove("flash-bad", "shake");
      passwordInput.value = "";
      resetGame();
      showScreen("menu");
    } else {
      loginError.classList.remove("hidden");
      replayClass(passwordInput, "flash-bad");
      replayClass(passwordInput, "shake");
    }
  }

  document.getElementById("login-btn").addEventListener("click", tryLogin);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryLogin();
  });

  document.getElementById("btn-trainer").addEventListener("click", () => {
    resetGame();
    showScreen("trainerMenu");
  });
  document.getElementById("btn-tests").addEventListener("click", startTests);
  document.getElementById("btn-trainer-back").addEventListener("click", goToMenu);
  document.getElementById("btn-trainer-to-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-over-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-tests-back").addEventListener("click", goToMenu);
  document.getElementById("btn-test-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-test-retry").addEventListener("click", startTests);
  document.getElementById("btn-support").addEventListener("click", () => {
    const url = "https://t.me/nazar_petr";
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  });

  document.getElementById("btn-mode-timed").addEventListener("click", () => startTrainer(true));
  document.getElementById("btn-mode-untimed").addEventListener("click", () => startTrainer(false));
  document.getElementById("btn-check").addEventListener("click", checkAnswer);
  document.getElementById("btn-next").addEventListener("click", () => nextQuestion(false));
  document.getElementById("answer-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !btnCheck.classList.contains("hidden")) {
      checkAnswer();
    }
  });

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function randMultiple(min, max) {
    const a = Math.ceil(min / 100);
    const b = Math.floor(max / 100);
    return randInt(a, b) * 100;
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function formatMoney(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function calculatePots(bets) {
    const amounts = bets.filter((b) => b > 0).sort((a, b) => a - b);
    const unique = [...new Set(amounts)];
    const pots = [];
    let prev = 0;
    unique.forEach((level) => {
      const contributors = amounts.filter((b) => b >= level).length;
      pots.push((level - prev) * contributors);
      prev = level;
    });
    return { main: pots[0] || 0, sides: pots.slice(1) };
  }

  function generateEasyBets() {
    const small = randMultiple(100, 4000);
    const big = randMultiple(small + 100, Math.min(MAX_STACK, small + 8000));
    return shuffle([big, big, small]);
  }

  function generateMediumBets() {
    const n = randInt(4, 7);
    const small = randMultiple(100, 5000);
    const big = randMultiple(small + 100, Math.min(MAX_STACK, small + 10000));
    const bets = [small];
    for (let i = 1; i < n; i++) bets.push(big);
    return shuffle(bets);
  }

  function generateHardBets() {
    const nLevels = Math.random() < 0.45 ? 4 : 3;
    const levels = [];
    let current = randMultiple(100, 2500);
    levels.push(current);
    for (let i = 1; i < nLevels; i++) {
      current = randMultiple(current + 100, Math.min(MAX_STACK, current + 4500));
      levels.push(current);
    }

    const bets = [];
    for (let i = 0; i < nLevels - 1; i++) {
      const count = randInt(1, 2);
      for (let j = 0; j < count; j++) bets.push(levels[i]);
    }
    const topCount = randInt(2, 4);
    for (let j = 0; j < topCount; j++) bets.push(levels[nLevels - 1]);
    return shuffle(bets);
  }

  function describeBets(bets) {
    const max = Math.max(...bets);
    return bets
      .map((bet, i) => {
        const tag = bet < max ? " (All-in)" : "";
        return `Игрок ${i + 1}: ${formatMoney(bet)}${tag}`;
      })
      .join("\n");
  }

  function buildQuestion() {
    const level = questionNumber;
    let bets;
    let ask;

    if (level <= 5) {
      bets = generateEasyBets();
      ask = "main";
    } else if (level <= 10) {
      bets = generateMediumBets();
      ask = Math.random() < 0.5 ? "main" : "side1";
    } else {
      bets = generateHardBets();
      ask = Math.random() < 0.5 ? "side1" : "side2";
    }

    const pots = calculatePots(bets);
    let prompt;
    let answer;

    if (ask === "main") {
      prompt = "Каков размер ОСНОВНОГО банка (Main Pot)?";
      answer = pots.main;
    } else if (ask === "side1") {
      prompt = "Каков размер Сайд-пота (Side Pot 1)?";
      answer = pots.sides[0] || 0;
    } else {
      prompt = "Сколько составляет Второй сайд-пот (Side Pot 2)?";
      if (pots.sides.length < 2) {
        prompt = "Размер Side Pot 1?";
        answer = pots.sides[0] || 0;
      } else {
        answer = pots.sides[1];
      }
    }

    return { bets, pots, prompt, answer, level };
  }

  function startTimer() {
    stopTimer();
    const valueEl = timerEl.querySelector(".timer-value");
    if (!timedMode) {
      timerEl.classList.add("hidden");
      return;
    }
    timeLeft = TIME_LIMIT;
    timerEl.classList.remove("hidden", "warn");
    if (valueEl) valueEl.textContent = String(timeLeft);
    void timerEl.offsetWidth;
    timerEl.classList.add("running");
    timerId = setInterval(() => {
      timeLeft -= 1;
      if (valueEl) valueEl.textContent = String(Math.max(timeLeft, 0));
      if (timeLeft <= 5) timerEl.classList.add("warn");
      if (timeLeft <= 0) onTimeout();
    }, 1000);
  }

  function setPlayingUi() {
    answered = false;
    gameOver = false;
    answerInput.value = "";
    answerInput.disabled = false;
    answerInput.classList.remove("flash-ok", "flash-bad", "shake");
    feedbackEl.classList.add("hidden");
    btnCheck.classList.remove("hidden");
    btnNext.classList.add("hidden");
    gameOverEl.classList.add("hidden");
  }

  function startTrainer(timed) {
    resetGame();
    timedMode = timed;
    showScreen("trainer");
    nextQuestion(true);
  }

  function nextQuestion(isStart) {
    if (gameOver) return;
    if (isStart !== true) {
      questionNumber += 1;
    }
    currentTask = buildQuestion();
    setPlayingUi();
    questionMetaEl.textContent = `Вопрос ${questionNumber}`;
    taskTextEl.textContent = describeBets(currentTask.bets);
    questionTextEl.textContent = currentTask.prompt;
    startTimer();
    answerInput.focus();
  }

  function applyError(message) {
    lives -= 1;
    renderLives();
    feedbackEl.classList.remove("hidden", "ok");
    feedbackEl.classList.add("bad");
    feedbackEl.textContent = message;

    if (lives <= 0) {
      endGame();
      return false;
    }
    return true;
  }

  function endGame() {
    gameOver = true;
    stopPending();
    answered = true;
    answerInput.disabled = true;
    btnCheck.classList.add("hidden");
    btnNext.classList.add("hidden");
    gameOverEl.classList.remove("hidden");
    finalScoreEl.textContent = `Пройдено вопросов: ${solvedCount}`;
  }

  function onTimeout() {
    stopTimer();
    if (answered || gameOver) return;
    answered = true;
    replayClass(answerInput, "flash-bad");
    replayClass(answerInput, "shake");
    const stillAlive = applyError(
      `Время вышло! Правильный ответ: ${formatMoney(currentTask.answer)}`
    );
    answerInput.disabled = true;
    btnCheck.classList.add("hidden");
    if (stillAlive) {
      autoNextId = setTimeout(() => nextQuestion(false), 1200);
    }
  }

  function checkAnswer() {
    if (answered || gameOver) return;
    const raw = answerInput.value.trim();
    if (raw === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;

    stopTimer();
    answered = true;
    answerInput.disabled = true;
    btnCheck.classList.add("hidden");

    if (value === currentTask.answer) {
      solvedCount += 1;
      replayClass(answerInput, "flash-ok");
      feedbackEl.classList.remove("hidden", "bad");
      feedbackEl.classList.add("ok");
      feedbackEl.textContent = "Верно!";
      btnNext.classList.remove("hidden");
    } else {
      replayClass(answerInput, "flash-bad");
      replayClass(answerInput, "shake");
      const stillAlive = applyError(`Неверно. Правильный ответ: ${formatMoney(currentTask.answer)}`);
      if (stillAlive) btnNext.classList.remove("hidden");
    }
  }

  const TEST_QUESTIONS = [
    {
      q: "Какая комбинация бьёт сет (три одинаковые карты)?",
      options: ["Две пары", "Стрит", "Старший туз", "Пара королей"],
      correct: 1,
    },
    {
      q: "Два игрока вскрылись с одинаковыми комбинациями одинаковой силы. Что делает дилер?",
      options: [
        "Отдаёт весь банк игроку слева от баттона",
        "Делит банк поровну (split pot)",
        "Банк сгорает и остаётся в мёртвом блайнде",
        "Победителя определяет кикер дилера",
      ],
      correct: 1,
    },
    {
      q: "Игрок ушёл в олл-ин меньшим стеком, остальные уравняли большую ставку. Может ли олл-ин игрок претендовать на сайд-пот?",
      options: [
        "Да, на весь банк стола",
        "Нет, только на основной банк (main pot)",
        "Да, если у него лучшая рука",
        "Только если он на баттоне",
      ],
      correct: 1,
    },
    {
      q: "После флопа кто первым действует, если все блайнды ещё в раздаче?",
      options: [
        "Баттон",
        "Игрок слева от баттона (малый блайнд)",
        "Большой блайнд",
        "Игрок с самым большим стеком",
      ],
      correct: 1,
    },
    {
      q: "Какая обязанность дилера при подсчёте банков с несколькими олл-инами?",
      options: [
        "Сначала собрать сайд-поты, потом основной банк",
        "Сначала выделить основной банк по минимальной ставке, затем сайд-поты по возрастанию",
        "Смешать все фишки в один банк",
        "Отдать банк последнему, кто поставил",
      ],
      correct: 1,
    },
  ];

  function startTests() {
    resetGame();
    showScreen("tests");
    renderTest();
  }

  function renderTest() {
    const item = TEST_QUESTIONS[testIndex];
    testLocked = false;
    testFeedbackEl.classList.add("hidden");
    testProgressLabel.textContent = `Вопрос ${testIndex + 1} из ${TEST_QUESTIONS.length}`;
    testProgressFill.style.width = `${((testIndex + 1) / TEST_QUESTIONS.length) * 100}%`;
    testQuestionEl.textContent = item.q;
    testOptionsEl.innerHTML = "";
    item.options.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary option";
      btn.textContent = text;
      btn.addEventListener("click", () => selectTestOption(i, btn));
      testOptionsEl.appendChild(btn);
    });
  }

  function selectTestOption(index, clickedBtn) {
    if (testLocked) return;
    testLocked = true;
    const item = TEST_QUESTIONS[testIndex];
    const buttons = [...testOptionsEl.querySelectorAll(".option")];
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === item.correct) btn.classList.add("correct");
    });
    if (index === item.correct) {
      testScore += 1;
      testFeedbackEl.classList.remove("hidden", "bad");
      testFeedbackEl.classList.add("ok");
      testFeedbackEl.textContent = "Верно!";
    } else {
      clickedBtn.classList.add("wrong");
      testFeedbackEl.classList.remove("hidden", "ok");
      testFeedbackEl.classList.add("bad");
      testFeedbackEl.textContent = "Неверно";
    }
    testAdvanceId = setTimeout(() => {
      testIndex += 1;
      if (testIndex >= TEST_QUESTIONS.length) showTestResult();
      else renderTest();
    }, 900);
  }

  function showTestResult() {
    testQuizEl.classList.add("hidden");
    testProgressWrap.classList.add("hidden");
    testResultEl.classList.remove("hidden");
    testScoreEl.textContent = `Вы ответили правильно на ${testScore} из ${TEST_QUESTIONS.length} вопросов`;
  }
})();
