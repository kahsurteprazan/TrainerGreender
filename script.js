(function () {
  const PASSWORD = "dealer2026";
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
    exam: document.getElementById("screen-exam"),
    trainerMenu: document.getElementById("screen-trainer-menu"),
    difficulty: document.getElementById("screen-difficulty"),
    trainer: document.getElementById("screen-trainer"),
    winnerMenu: document.getElementById("screen-winner-menu"),
    winnerGame: document.getElementById("screen-winner-game"),
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
  const winnerLivesEl = document.getElementById("winner-lives");
  const winnerTimerEl = document.getElementById("winner-timer");
  const winnerBoardEl = document.getElementById("winner-board");
  const winnerPlayersEl = document.getElementById("winner-players");
  const winnerRoundEl = document.getElementById("winner-round");
  const winnerFeedbackEl = document.getElementById("winner-feedback");
  const winnerGameOverEl = document.getElementById("winner-game-over");
  const winnerFinalScoreEl = document.getElementById("winner-final-score");

  let timedMode = false;
  let difficulty = null;
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
  let currentPotIndex = 0;
  let correctAnswers = [];
  let winnerTimedMode = false;
  let winnerLives = 2;
  let winnerRound = 1;
  let winnerDeal = null;
  let winnerSelected = new Set();
  let winnerAnswered = false;
  let winnerGameOver = false;
  let winnerTimerId = null;
  let winnerAutoNextId = null;
  let winnerTimeLeft = 5;

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
    stopWinnerTimer();
    if (winnerAutoNextId) {
      clearTimeout(winnerAutoNextId);
      winnerAutoNextId = null;
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

  function resetGameState() {
    stopPending();
    difficulty = null;
    lives = 2;
    questionNumber = 1;
    solvedCount = 0;
    currentTask = null;
    answered = false;
    gameOver = false;
    timeLeft = TIME_LIMIT;
    currentPotIndex = 0;
    correctAnswers = [];

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

  function resetGame() {
    timedMode = false;
    resetGameState();
  }

  function stopWinnerTimer() {
    if (winnerTimerId) {
      clearInterval(winnerTimerId);
      winnerTimerId = null;
    }
    if (winnerTimerEl) winnerTimerEl.classList.remove("running");
  }

  function renderWinnerLives() {
    const hearts = winnerLivesEl.querySelectorAll(".heart");
    hearts.forEach((heart, i) => {
      if (i < winnerLives) {
        heart.textContent = "❤️";
        heart.classList.remove("lost");
      } else {
        heart.textContent = "💔";
        heart.classList.add("lost");
      }
    });
  }

  function resetWinnerGame() {
    stopWinnerTimer();
    if (winnerAutoNextId) {
      clearTimeout(winnerAutoNextId);
      winnerAutoNextId = null;
    }
    winnerTimedMode = false;
    winnerLives = 2;
    winnerRound = 1;
    winnerDeal = null;
    winnerSelected = new Set();
    winnerAnswered = false;
    winnerGameOver = false;
    winnerTimeLeft = 5;
    renderWinnerLives();
    winnerTimerEl.classList.add("hidden");
    winnerTimerEl.classList.remove("warn", "running");
    winnerTimerEl.querySelector(".timer-value").textContent = "5";
    winnerBoardEl.innerHTML = "";
    winnerPlayersEl.innerHTML = "";
    winnerFeedbackEl.classList.add("hidden");
    winnerFeedbackEl.classList.remove("ok", "bad");
    winnerGameOverEl.classList.add("hidden");
    winnerFinalScoreEl.textContent = "";
  }

  function goToMenu() {
    resetGame();
    resetWinnerGame();
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
    resetWinnerGame();
    showScreen("trainerMenu");
  });
  document.getElementById("btn-winner-game").addEventListener("click", () => {
    resetGame();
    resetWinnerGame();
    showScreen("winnerMenu");
  });
  document.getElementById("btn-tests").addEventListener("click", startTests);
  document.getElementById("btn-exam").addEventListener("click", () => {
    resetGame();
    showScreen("exam");
  });
  document.getElementById("btn-exam-back").addEventListener("click", goToMenu);
  document.getElementById("btn-exam-close").addEventListener("click", goToMenu);
  document.getElementById("btn-trainer-back").addEventListener("click", goToMenu);
  document.getElementById("btn-difficulty-back").addEventListener("click", () => {
    resetGame();
    showScreen("trainerMenu");
  });
  document.getElementById("btn-trainer-to-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-over-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-winner-menu-back").addEventListener("click", goToMenu);
  document.getElementById("btn-winner-game-back").addEventListener("click", () => {
    resetWinnerGame();
    showScreen("winnerMenu");
  });
  document.getElementById("btn-winner-over-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-tests-back").addEventListener("click", goToMenu);
  document.getElementById("btn-test-menu").addEventListener("click", goToMenu);
  document.getElementById("btn-test-retry").addEventListener("click", startTests);
  
  document.getElementById("btn-ideas").addEventListener("click", () => {
    const url = "https://docs.google.com/forms/d/e/1FAIpQLSd6r4HMWTiG2k4y9FEwqVBiSYbvA91wLoQabk5uFHffhyDS_A/viewform?usp=header";
    window.open(url, "_blank");
  });
  
  document.getElementById("btn-support").addEventListener("click", () => {
    const url = "https://t.me/nazar_petr";
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  });

  document.getElementById("btn-mode-timed").addEventListener("click", () => {
    timedMode = true;
    showScreen("difficulty");
  });
  document.getElementById("btn-mode-untimed").addEventListener("click", () => {
    timedMode = false;
    showScreen("difficulty");
  });
  document.getElementById("btn-winner-timed").addEventListener("click", () => {
    winnerTimedMode = true;
    startWinnerGame();
  });
  document.getElementById("btn-winner-untimed").addEventListener("click", () => {
    winnerTimedMode = false;
    startWinnerGame();
  });
  
  document.getElementById("btn-easy").addEventListener("click", () => startTrainer("easy"));
  document.getElementById("btn-medium").addEventListener("click", () => startTrainer("medium"));
  document.getElementById("btn-hard").addEventListener("click", () => startTrainer("hard"));
  
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
    return n.toString();
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
    const small = randMultiple(100, 1000);
    const big = randMultiple(small + 100, Math.min(2000, small + 1500));
    return shuffle([big, big, small]);
  }

  function generateMediumBets() {
    const n = randInt(4, 7);
    const small = randMultiple(100, 5000);
    const big = randMultiple(Math.max(small + 100, 10000), Math.min(30000, 15000));
    const bets = [small];
    for (let i = 1; i < n; i++) bets.push(big);
    return shuffle(bets);
  }

  function generateHardBets() {
    const nLevels = randInt(2, 4);
    const levels = [];
    let current = randMultiple(15000, 25000);
    levels.push(current);
    for (let i = 1; i < nLevels; i++) {
      current = randMultiple(current + 1000, Math.min(100000, current + 30000));
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
    let bets;
    let pots;
    let questions = [];

    if (difficulty === "easy") {
      bets = generateEasyBets();
      pots = calculatePots(bets);
      questions.push({
        prompt: "Введите размер Основного банка (Main Pot):",
        answer: pots.main,
      });
    } else if (difficulty === "medium") {
      bets = generateMediumBets();
      pots = calculatePots(bets);
      const askMain = Math.random() < 0.5;
      if (askMain) {
        questions.push({
          prompt: "Введите размер Основного банка (Main Pot):",
          answer: pots.main,
        });
      } else {
        questions.push({
          prompt: "Введите размер Первого Сайд-пота (Side Pot 1):",
          answer: pots.sides[0] || 0,
        });
      }
    } else if (difficulty === "hard") {
      bets = generateHardBets();
      pots = calculatePots(bets);
      questions.push({
        prompt: "Введите размер Основного банка (Main Pot):",
        answer: pots.main,
      });
      for (let i = 0; i < pots.sides.length; i++) {
        questions.push({
          prompt: `Введите размер Сайд-пота ${i + 1}:`,
          answer: pots.sides[i],
        });
      }
    }

    return { bets, pots, questions, level: questionNumber };
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

  function startTrainer(selectedDifficulty) {
    resetGameState();
    difficulty = selectedDifficulty;
    showScreen("trainer");
    nextQuestion(true);
  }

  function updateQuestionPrompt() {
    const question = currentTask.questions[currentPotIndex];
    questionTextEl.textContent = question.prompt;
  }

  function nextQuestion(isStart) {
    if (gameOver) return;
    if (isStart !== true) {
      questionNumber += 1;
      currentPotIndex = 0;
    }
    currentTask = buildQuestion();
    correctAnswers = currentTask.questions.map((q) => q.answer);
    currentPotIndex = 0;
    setPlayingUi();
    questionMetaEl.textContent = `Вопрос ${questionNumber}`;
    taskTextEl.textContent = describeBets(currentTask.bets);
    updateQuestionPrompt();
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
    const expectedAnswer = currentTask.questions[currentPotIndex].answer;
    const stillAlive = applyError(`Время вышло! Правильный ответ: ${formatMoney(expectedAnswer)}`);
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

    const expectedAnswer = currentTask.questions[currentPotIndex].answer;

    if (value === expectedAnswer) {
      currentPotIndex += 1;
      if (currentPotIndex >= currentTask.questions.length) {
        solvedCount += 1;
        replayClass(answerInput, "flash-ok");
        feedbackEl.classList.remove("hidden", "bad");
        feedbackEl.classList.add("ok");
        feedbackEl.textContent = "Верно! Все потов посчитаны.";
        btnNext.classList.remove("hidden");
      } else {
        replayClass(answerInput, "flash-ok");
        feedbackEl.classList.remove("hidden", "bad");
        feedbackEl.classList.add("ok");
        feedbackEl.textContent = "Верно! Следующий пот:";
        answered = false;
        answerInput.disabled = false;
        answerInput.value = "";
        answerInput.classList.remove("flash-ok", "flash-bad");
        feedbackEl.classList.add("hidden");
        btnCheck.classList.remove("hidden");
        updateQuestionPrompt();
        startTimer();
        answerInput.focus();
      }
    } else {
      replayClass(answerInput, "flash-bad");
      replayClass(answerInput, "shake");
      const stillAlive = applyError("Неверно!");
      if (stillAlive) {
        answered = false;
        answerInput.disabled = false;
        answerInput.value = "";
        answerInput.classList.remove("flash-bad", "shake");
        feedbackEl.classList.add("hidden");
        btnCheck.classList.remove("hidden");
        startTimer();
        answerInput.focus();
      }
    }
  }

  const WINNER_RANKS = [
    { label: "2", value: 2, image: "2" },
    { label: "3", value: 3, image: "3" },
    { label: "4", value: 4, image: "4" },
    { label: "5", value: 5, image: "5" },
    { label: "6", value: 6, image: "6" },
    { label: "7", value: 7, image: "7" },
    { label: "8", value: 8, image: "8" },
    { label: "9", value: 9, image: "9" },
    { label: "10", value: 10, image: "10" },
    { label: "J", value: 11, image: "J" },
    { label: "Q", value: 12, image: "Q" },
    { label: "K", value: 13, image: "K" },
    { label: "A", value: 14, image: "A" },
  ];
  const WINNER_SUITS = ["clubs", "diamonds", "hearts", "spades"];

  function winnerCardImage(card) {
    const rankImage = card.rank >= 11 ? card.label : String(card.rank);
    const heartAceName = card.rank === 14 && card.suit === "hearts" ? "A__hearts.png" : `${rankImage}_${card.suit}.png`;
    return `images/cards/${heartAceName}`;
  }

  function createWinnerDeck() {
    const deck = [];
    WINNER_RANKS.forEach((rank) => {
      WINNER_SUITS.forEach((suit) => {
        deck.push({ rank: rank.value, label: rank.label, suit, id: `${rank.value}_${suit}` });
      });
    });
    return deck;
  }

  function evaluateFiveCards(cards) {
    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    const counts = {};
    ranks.forEach((rank) => {
      counts[rank] = (counts[rank] || 0) + 1;
    });
    const groups = Object.keys(counts)
      .map(Number)
      .sort((a, b) => counts[b] - counts[a] || b - a);
    const isFlush = cards.every((card) => card.suit === cards[0].suit);
    const uniqueRanks = [...new Set(ranks)];
    let straightHigh = 0;
    if (uniqueRanks.length === 5) {
      if (uniqueRanks[0] - uniqueRanks[4] === 4) straightHigh = uniqueRanks[0];
      else if (uniqueRanks.join(",") === "14,5,4,3,2") straightHigh = 5;
    }

    if (isFlush && straightHigh) return [8, straightHigh];
    if (groups.length === 2 && counts[groups[0]] === 4) return [7, groups[0], groups[1]];
    if (groups.length === 2 && counts[groups[0]] === 3) return [6, groups[0], groups[1]];
    if (isFlush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (groups.length === 3 && counts[groups[0]] === 3) {
      return [3, groups[0], ...groups.slice(1).sort((a, b) => b - a)];
    }
    if (groups.length === 3 && counts[groups[0]] === 2 && counts[groups[1]] === 2) {
      return [2, Math.max(groups[0], groups[1]), Math.min(groups[0], groups[1]), groups[2]];
    }
    if (groups.length === 4 && counts[groups[0]] === 2) {
      return [1, groups[0], ...groups.slice(1).sort((a, b) => b - a)];
    }
    return [0, ...ranks];
  }

  function compareWinnerScores(a, b) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  function combinations(cards, size, start, result, output) {
    if (result.length === size) {
      output.push(result.slice());
      return;
    }
    for (let i = start; i <= cards.length - (size - result.length); i += 1) {
      result.push(cards[i]);
      combinations(cards, size, i + 1, result, output);
      result.pop();
    }
  }

  function bestWinnerHand(cards) {
    const hands = [];
    combinations(cards, 5, 0, [], hands);
    return hands.reduce((best, hand) => {
      const score = evaluateFiveCards(hand);
      if (!best || compareWinnerScores(score, best.score) > 0) return { score, cards: hand };
      return best;
    }, null);
  }

  function createWinnerDeal() {
    const deck = shuffle(createWinnerDeck());
    const playerCount = randInt(2, 5);
    const players = [];
    for (let i = 0; i < playerCount; i += 1) {
      players.push({ name: `Игрок ${i + 1}`, cards: [deck.pop(), deck.pop()] });
    }
    const board = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    players.forEach((player) => {
      player.hand = bestWinnerHand(player.cards.concat(board));
    });
    const bestScore = players.reduce((best, player) => (
      !best || compareWinnerScores(player.hand.score, best) > 0 ? player.hand.score : best
    ), null);
    const winners = players
      .map((player, index) => (compareWinnerScores(player.hand.score, bestScore) === 0 ? index : -1))
      .filter((index) => index >= 0);
    return { players, board, winners };
  }

  function makeWinnerCardImage(card) {
    const image = document.createElement("img");
    image.className = "winner-card-image";
    image.src = winnerCardImage(card);
    image.alt = `${card.label} ${card.suit}`;
    return image;
  }

  function renderWinnerDeal() {
    winnerBoardEl.innerHTML = "";
    winnerPlayersEl.innerHTML = "";
    winnerDeal.board.forEach((card) => winnerBoardEl.appendChild(makeWinnerCardImage(card)));
    winnerDeal.players.forEach((player, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "winner-player";
      button.dataset.playerIndex = String(index);
      button.setAttribute("aria-label", `Выбрать ${player.name}`);
      const name = document.createElement("span");
      name.className = "winner-player-name";
      name.textContent = player.name;
      const cards = document.createElement("span");
      cards.className = "winner-cards";
      player.cards.forEach((card) => cards.appendChild(makeWinnerCardImage(card)));
      button.appendChild(name);
      button.appendChild(cards);
      button.addEventListener("click", () => selectWinner(index, button));
      winnerPlayersEl.appendChild(button);
    });
  }

  function startWinnerTimer() {
    stopWinnerTimer();
    if (!winnerTimedMode) {
      winnerTimerEl.classList.add("hidden");
      return;
    }
    winnerTimeLeft = 5;
    const valueEl = winnerTimerEl.querySelector(".timer-value");
    valueEl.textContent = "5";
    winnerTimerEl.classList.remove("hidden", "warn");
    void winnerTimerEl.offsetWidth;
    winnerTimerEl.classList.add("running");
    winnerTimerId = setInterval(() => {
      winnerTimeLeft -= 1;
      valueEl.textContent = String(Math.max(winnerTimeLeft, 0));
      if (winnerTimeLeft <= 2) winnerTimerEl.classList.add("warn");
      if (winnerTimeLeft <= 0) onWinnerTimeout();
    }, 1000);
  }

  function winnerNames() {
    return winnerDeal.winners.map((index) => winnerDeal.players[index].name).join(", ");
  }

  function winnerTitle() {
    return winnerDeal.winners.length > 1 ? "Победители" : "Победитель";
  }

  function revealWinnerButtons(clickedButton, wrong) {
    const buttons = [...winnerPlayersEl.querySelectorAll(".winner-player")];
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (winnerDeal.winners.includes(index)) button.classList.add("correct");
    });
    if (wrong && clickedButton) clickedButton.classList.add("wrong");
  }

  function scheduleWinnerNext() {
    winnerAutoNextId = setTimeout(() => {
      winnerAutoNextId = null;
      nextWinnerDeal();
    }, 2500);
  }

  function finishWinnerSuccess() {
    winnerAnswered = true;
    stopWinnerTimer();
    revealWinnerButtons();
    winnerFeedbackEl.classList.remove("hidden", "bad");
    winnerFeedbackEl.classList.add("ok");
    winnerFeedbackEl.textContent = `Верно! ${winnerTitle()}: ${winnerNames()}`;
    scheduleWinnerNext();
  }

  function finishWinnerError(message, clickedButton) {
    winnerAnswered = true;
    stopWinnerTimer();
    winnerLives -= 1;
    renderWinnerLives();
    revealWinnerButtons(clickedButton, Boolean(clickedButton));
    winnerFeedbackEl.classList.remove("hidden", "ok");
    winnerFeedbackEl.classList.add("bad");
    winnerFeedbackEl.textContent = `${message} ${winnerTitle()}: ${winnerNames()}`;
    if (winnerLives <= 0) {
      winnerGameOver = true;
      winnerGameOverEl.classList.remove("hidden");
      winnerFinalScoreEl.textContent = `Правильных раздач: ${winnerRound - 1}`;
    } else {
      scheduleWinnerNext();
    }
  }

  function selectWinner(index, button) {
    if (winnerAnswered || winnerGameOver || winnerSelected.has(index)) return;
    winnerSelected.add(index);
    button.classList.add("selected");
    if (!winnerDeal.winners.includes(index)) {
      finishWinnerError("Ошибка.", button);
      return;
    }
    if (winnerDeal.winners.every((winnerIndex) => winnerSelected.has(winnerIndex))) {
      finishWinnerSuccess();
    }
  }

  function onWinnerTimeout() {
    if (winnerAnswered || winnerGameOver) return;
    finishWinnerError("Время вышло.");
  }

  function nextWinnerDeal() {
    if (winnerGameOver) return;
    winnerRound += 1;
    winnerDeal = createWinnerDeal();
    winnerSelected = new Set();
    winnerAnswered = false;
    winnerRoundEl.textContent = `Раздача ${winnerRound}`;
    winnerFeedbackEl.classList.add("hidden");
    winnerFeedbackEl.classList.remove("ok", "bad");
    winnerFeedbackEl.textContent = "";
    renderWinnerDeal();
    startWinnerTimer();
  }

  function startWinnerGame() {
    const mode = winnerTimedMode;
    resetWinnerGame();
    winnerTimedMode = mode;
    winnerGameOver = false;
    showScreen("winnerGame");
    winnerDeal = createWinnerDeal();
    winnerRoundEl.textContent = "Раздача 1";
    renderWinnerDeal();
    startWinnerTimer();
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
