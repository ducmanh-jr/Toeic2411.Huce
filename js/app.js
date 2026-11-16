const App = (() => {
  let TESTS = {};
  let ANSWERS = {};

  // Active session state
  let session = null;
  let timerInterval = null;
  let noteTarget = null;

  // DOM refs
  const views = {
    dashboard: document.getElementById('view-dashboard'),
    vocab: document.getElementById('view-vocab'),
    grammar: document.getElementById('view-grammar'),
    mistakes: document.getElementById('view-mistakes'),
    exam: document.getElementById('view-exam'),
  };

  function showView(name) {
    Object.values(views).forEach((v) => v.classList.remove('active'));
    views[name].classList.add('active');
    if (name !== 'exam') {
      AudioPlayer.stop();
      stopTimer();
    }
  }

  // MA Raw to Scaled Score conversion
  function estimateScaled(raw, isListening) {
    if (raw <= 0) return 5;
    if (raw >= 100) return 495;
    let val;
    if (isListening) {
      if (raw >= 96) val = 495;
      else if (raw >= 91) val = 470 + (raw - 90) * 5;
      else if (raw >= 81) val = 420 + (raw - 80) * 5;
      else if (raw >= 71) val = 365 + (raw - 70) * 5.5;
      else if (raw >= 51) val = 260 + (raw - 50) * 5.2;
      else if (raw >= 31) val = 150 + (raw - 30) * 5.5;
      else val = Math.max(5, raw * 5);
    } else {
      if (raw >= 97) val = 495;
      else if (raw >= 91) val = 450 + (raw - 90) * 7.5;
      else if (raw >= 81) val = 395 + (raw - 80) * 5.5;
      else if (raw >= 71) val = 335 + (raw - 70) * 6;
      else if (raw >= 51) val = 235 + (raw - 50) * 5;
      else if (raw >= 31) val = 125 + (raw - 30) * 5.5;
      else val = Math.max(5, raw * 4);
    }
    return Math.min(495, Math.max(5, Math.round(val / 5) * 5));
  }

  function fmtClock(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }

  function getPartOfQ(q) {
    if (q <= 6) return 1;
    if (q <= 31) return 2;
    if (q <= 70) return 3;
    if (q <= 100) return 4;
    if (q <= 130) return 5;
    if (q <= 146) return 6;
    return 7;
  }

  function qToTranscriptPage(testId, q) {
    if (testId === '3') {
      if (q <= 4) return 1;
      if (q <= 9) return 2;
      if (q <= 15) return 3;
      if (q <= 21) return 4;
      if (q <= 26) return 5;
      if (q <= 31) return 6;
      if (q <= 70) return Math.min(20, 7 + Math.floor((q - 32) / 3));
      return Math.min(31, 21 + Math.floor((q - 71) / 3));
    }
    // Test 4 & 5 (29 pages)
    if (q <= 6) return 2;
    if (q <= 31) return Math.min(7, 4 + Math.floor((q - 7) / 7));
    if (q <= 70) return Math.min(19, 8 + Math.floor((q - 32) / 3));
    return Math.min(29, 20 + Math.floor((q - 71) / 3));
  }

  function updateFeedbackBar(q) {
    const bar = document.getElementById('q-feedback-bar');
    if (!session || (!session.isReview && !session.checkedQs[q])) {
      bar.classList.add('hidden');
      return;
    }
    const ca = ANSWERS[session.testId][q - 1];
    const ua = session.userAnswers[q];
    const isOk = ua === ca;
    const statusText = !ua ? `Chưa chọn · Đáp án đúng: <strong>${ca}</strong>` : isOk ? `<strong style="color:var(--green)">Chính xác (${ca})</strong>` : `<strong style="color:var(--red)">Sai (${ua})</strong> · Đáp án đúng: <strong>${ca}</strong>`;
    const actionBtn = q <= 100
      ? `<button class="btn btn-primary btn-xs" id="btn-fb-transcript">Xem Script &amp; Giải thích</button>`
      : `<button class="btn btn-outline btn-xs" id="btn-fb-note">Ghi chú câu ${q}</button>`;

    bar.innerHTML = `<div>Câu <strong>${q}</strong>: ${statusText}</div>${actionBtn}`;
    bar.classList.remove('hidden');

    const trBtn = document.getElementById('btn-fb-transcript');
    if (trBtn) {
      trBtn.onclick = () => {
        session.trPage = qToTranscriptPage(session.testId, q);
        renderTranscriptPage();
        document.getElementById('transcript-panel').classList.remove('hidden');
      };
    }
    const nBtn = document.getElementById('btn-fb-note');
    if (nBtn) {
      nBtn.onclick = () => {
        noteTarget = { testId: session.testId, q };
        document.getElementById('note-modal-title').textContent = `Ghi chú — Test ${session.testId}, Câu ${q}`;
        document.getElementById('note-textarea').value = Storage.getNote(session.testId, q);
        document.getElementById('modal-note').classList.remove('hidden');
      };
    }
  }

  // ================= DASHBOARD =================
  function renderDashboard() {
    const data = Storage.loadAll();
    document.getElementById('mistake-count-badge').textContent = Object.keys(data.mistakes).length;

    // Draft banner
    const draftBanner = document.getElementById('resume-banner');
    if (data.draft) {
      const answeredCount = Object.keys(data.draft.userAnswers || {}).length;
      document.getElementById('resume-info').textContent =
        `Test ${data.draft.testId} (${data.draft.modeLabel}) — Đã làm ${answeredCount}/${data.draft.qList.length} câu`;
      draftBanner.classList.remove('hidden');
    } else {
      draftBanner.classList.add('hidden');
    }

    // Test cards (neutral community exam portal)
    const container = document.getElementById('test-cards-container');
    container.innerHTML = '';
    ['3', '4', '5'].forEach((id) => {
      const meta = TESTS[id];
      const card = document.createElement('div');
      card.className = 'test-card';
      card.innerHTML = `
        <div class="test-card-head">
          <div>
            <h2>${meta.title}</h2>
            <div class="test-card-sub">${meta.subtitle}</div>
          </div>
        </div>
        <div class="test-stats">
          <div><span>Listening (Part 1–4)</span><strong>100 câu · 45'</strong></div>
          <div><span>Reading (Part 5–7)</span><strong>100 câu · 75'</strong></div>
        </div>
        <div class="test-card-actions">
          <button class="btn btn-primary" data-start="${id}" data-mode="full">Thi thử Full (200 câu · 120')</button>
          <div class="btn-row">
            <button class="btn btn-outline btn-sm" data-start="${id}" data-mode="lc">Listening (45')</button>
            <button class="btn btn-outline btn-sm" data-start="${id}" data-mode="rc">Reading (75')</button>
          </div>
          <div class="part-practice-row">
            <select class="select-sm" id="part-select-${id}">
              ${meta.parts.map((p) => `<option value="${p.part}">${p.name} (${p.start}–${p.end})</option>`).join('')}
            </select>
            <button class="btn btn-outline btn-sm" data-practice="${id}">Luyện Part</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ================= START / RESUME SESSION =================
  function startSession({ testId, mode, modeLabel, qList, durationSec, userAnswers = {}, flags = {}, currentQ = null, isReview = false }) {
    const meta = TESTS[testId];
    session = {
      testId,
      mode, // 'full' | 'lc' | 'rc' | 'part' | 'review'
      modeLabel,
      qList,
      durationSec,
      remainingSec: durationSec,
      elapsedSec: 0,
      userAnswers: { ...userAnswers },
      flags: { ...flags },
      currentQ: currentQ || qList[0],
      currentPage: meta.qMap[String(currentQ || qList[0])].p,
      trPage: 1,
      isReview,
      instantKey: mode === 'part',
      omrPartFilter: 'all',
      reviewFilter: 'all',
      checkedQs: {},
    };

    document.getElementById('exam-title').textContent = `Test ${testId}`;
    document.getElementById('exam-mode-badge').textContent = isReview ? 'Xem lại & Đáp án' : modeLabel;
    document.getElementById('tr-total-num').textContent = meta.transcriptCount;

    // Toggle UI controls based on mode
    const btnSubmit = document.getElementById('btn-submit-exam');
    const btnSummary = document.getElementById('btn-show-summary');
    const btnTranscript = document.getElementById('btn-toggle-transcript');
    const reviewBar = document.getElementById('review-filter-bar');
    const instantToggle = document.getElementById('toggle-instant-key');
    instantToggle.checked = session.instantKey;
    instantToggle.closest('label').classList.toggle('hidden', isReview);

    document.getElementById('transcript-panel').classList.add('hidden');
    if (isReview) {
      btnSubmit.classList.add('hidden');
      btnSummary.classList.remove('hidden');
      btnTranscript.classList.remove('hidden');
      reviewBar.classList.remove('hidden');
    } else {
      btnSubmit.classList.remove('hidden');
      btnSummary.classList.add('hidden');
      // Allow transcript in Practice by Part mode
      if (mode === 'part') btnTranscript.classList.remove('hidden');
      else btnTranscript.classList.add('hidden');
      reviewBar.classList.add('hidden');
    }

    // Set OMR tabs visibility
    document.querySelectorAll('#omr-part-tabs .omr-tab').forEach((tab) => {
      const p = tab.dataset.part;
      if (p === 'all') {
        tab.classList.toggle('hidden', mode === 'part');
      } else {
        const partObj = meta.parts.find((x) => x.part === Number(p));
        const hasAny = qList.some((q) => q >= partObj.start && q <= partObj.end);
        tab.classList.toggle('hidden', !hasAny);
      }
      tab.classList.toggle('active', p === 'all');
    });

    showView('exam');
    renderPage();
    renderTranscriptPage();
    renderOMR();
    selectQuestion(session.currentQ, false);
    updateHeaderStats();

    if (!isReview) {
      startTimer();
    } else {
      document.getElementById('exam-timer').textContent = 'Đã nộp';
      document.getElementById('exam-timer').classList.remove('warn');
    }
  }

  function startTimer() {
    stopTimer();
    const timerEl = document.getElementById('exam-timer');
    const updateDisplay = () => {
      if (session.durationSec > 0) {
        timerEl.textContent = fmtClock(session.remainingSec);
        timerEl.classList.toggle('warn', session.remainingSec <= 300);
      } else {
        timerEl.textContent = fmtClock(session.elapsedSec);
        timerEl.classList.remove('warn');
      }
    };
    updateDisplay();
    timerInterval = setInterval(() => {
      if (!session || session.isReview) return;
      session.elapsedSec += 1;
      if (session.durationSec > 0) {
        session.remainingSec -= 1;
        if (session.remainingSec <= 0) {
          stopTimer();
          alert('Đã hết thời gian làm bài! Hệ thống sẽ tự động nộp bài.');
          submitExam();
          return;
        }
      }
      updateDisplay();
      if (session.elapsedSec % 10 === 0) persistDraft();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function persistDraft() {
    if (!session || session.isReview) return;
    Storage.saveDraft({
      testId: session.testId,
      mode: session.mode,
      modeLabel: session.modeLabel,
      qList: session.qList,
      durationSec: session.remainingSec > 0 ? session.remainingSec : session.durationSec,
      userAnswers: session.userAnswers,
      flags: session.flags,
      currentQ: session.currentQ,
    });
  }

  const preloadedImgs = new Set();
  function preloadPage(testId, pageNum) {
    const meta = TESTS[testId];
    if (!meta || pageNum < 1 || pageNum > meta.pageCount) return;
    const src = `assets/pages/test${testId}/p${String(pageNum).padStart(2, '0')}.webp`;
    if (preloadedImgs.has(src)) return;
    preloadedImgs.add(src);
    const im = new Image();
    im.src = src;
  }

  // ================= VIEWER & AUDIO =================
  function renderPage() {
    const meta = TESTS[session.testId];
    const p = Math.max(1, Math.min(meta.pageCount, session.currentPage));
    session.currentPage = p;
    const img = document.getElementById('page-image');
    img.src = `assets/pages/test${session.testId}/p${String(p).padStart(2, '0')}.webp`;
    document.getElementById('btn-prev-page').disabled = p <= 1;
    document.getElementById('btn-next-page').disabled = p >= meta.pageCount;

    // Preload next 2 pages for instant page-turn on GitHub Pages
    preloadPage(session.testId, p + 1);
    preloadPage(session.testId, p + 2);

    // Sync Part dropdown
    const partAtPage = [...meta.parts].reverse().find((pt) => p >= pt.page);
    if (partAtPage) document.getElementById('select-part-jump').value = String(partAtPage.part);
  }

  function renderTranscriptPage() {
    const meta = TESTS[session.testId];
    const p = Math.max(1, Math.min(meta.transcriptCount, session.trPage));
    session.trPage = p;
    document.getElementById('tr-page-num').textContent = p;
    document.getElementById('transcript-image').src =
      `assets/transcript/test${session.testId}/t${String(p).padStart(2, '0')}.webp`;
    document.getElementById('btn-tr-prev').disabled = p <= 1;
    document.getElementById('btn-tr-next').disabled = p >= meta.transcriptCount;
  }

  function applyZoom() {
    const val = document.getElementById('select-zoom').value;
    const img = document.getElementById('page-image');
    if (val === 'fit') {
      img.classList.add('fit');
      img.style.width = '';
    } else {
      img.classList.remove('fit');
      img.style.width = `${Math.round(820 * parseFloat(val))}px`;
    }
  }

  function selectQuestion(q, autoPlayAudio = false) {
    session.currentQ = q;
    const meta = TESTS[session.testId];
    const info = meta.qMap[String(q)];
    if (info && info.p !== session.currentPage) {
      session.currentPage = info.p;
      renderPage();
    }

    // Audio
    if (info && info.a) {
      const label = q <= 31 ? `Q${q}` : `Q${32 + Math.floor((q - 32) / 3) * 3}-${34 + Math.floor((q - 32) / 3) * 3}`;
      AudioPlayer.loadTrack(session.testId, info.a, label, autoPlayAudio);
    } else {
      AudioPlayer.loadTrack(session.testId, null, '', false);
    }

    // Highlight active OMR row
    document.querySelectorAll('.omr-row').forEach((row) => {
      const rq = Number(row.dataset.q);
      row.classList.toggle('active-q', rq === q);
      if (rq === q) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
    updateFeedbackBar(q);
  }

  // ================= OMR SHEET =================
  function renderOMR() {
    const listEl = document.getElementById('omr-list');
    const correctArr = ANSWERS[session.testId];
    const notes = Storage.getAllNotes();
    listEl.innerHTML = '';

    const filteredQs = session.qList.filter((q) => {
      if (session.omrPartFilter !== 'all' && getPartOfQ(q) !== Number(session.omrPartFilter)) {
        return false;
      }
      if (session.isReview) {
        const ua = session.userAnswers[q];
        const ca = correctArr[q - 1];
        if (session.reviewFilter === 'wrong') return ua !== ca;
        if (session.reviewFilter === 'correct') return ua === ca;
        if (session.reviewFilter === 'flagged') return !!session.flags[q];
      }
      return true;
    });

    if (!filteredQs.length) {
      listEl.innerHTML = '<div class="empty-cell">Không có câu hỏi nào khớp bộ lọc.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    filteredQs.forEach((q) => {
      const ua = session.userAnswers[q] || '';
      const ca = correctArr[q - 1];
      const showKey = session.isReview || !!session.checkedQs[q] || (session.instantKey && !!ua);
      const isFlagged = !!session.flags[q];
      const noteText = notes[`${session.testId}_${q}`] || '';
      const hasNote = !!noteText;

      const wrap = document.createElement('div');
      wrap.className = 'omr-row-wrap';

      const row = document.createElement('div');
      row.className = `omr-row${session.currentQ === q ? ' active-q' : ''}`;
      row.dataset.q = q;

      let optsHtml = '';
      ['A', 'B', 'C', 'D'].forEach((opt) => {
        if (q >= 7 && q <= 31 && opt === 'D') return;
        let cls = 'opt-btn';
        if (showKey) {
          if (opt === ca) cls += ' correct';
          else if (opt === ua && ua !== ca) cls += ' wrong';
        } else if (opt === ua) {
          cls += ' selected';
        }
        optsHtml += `<button class="${cls}" data-q="${q}" data-opt="${opt}">${opt}</button>`;
      });

      let statusHtml = '';
      if (showKey) {
        if (ua === ca) statusHtml = '<span class="status-pill ok">Đúng</span>';
        else statusHtml = `<span class="status-pill err">${ua || '—'}→${ca}</span>`;
      }

      row.innerHTML = `
        <span class="q-num">${q}.</span>
        <div class="q-opts">${optsHtml}</div>
        <div class="q-actions">
          ${statusHtml}
          ${!session.isReview && !showKey ? `<button class="icon-btn" data-check="${q}" title="Xem đáp án câu này">Dò</button>` : ''}
          ${q <= 100 ? `<button class="icon-btn" data-listen="${q}" title="Nghe câu này">♪</button>` : ''}
          <button class="icon-btn${isFlagged ? ' flagged' : ''}" data-flag="${q}" title="Cắm cờ">⚑</button>
          ${showKey ? `<button class="icon-btn${hasNote ? ' has-note' : ''}" data-note="${q}" title="Ghi chú">✎</button>` : ''}
        </div>
      `;
      wrap.appendChild(row);

      if (showKey) {
        const exp = document.createElement('div');
        exp.className = 'omr-inline-exp';
        const label = ua === ca
          ? `<span style="color:var(--green);font-weight:600">Đúng — Đáp án (${ca})</span>`
          : `<span>Đáp án đúng: <strong>(${ca})</strong>${noteText ? ` · <em>${noteText}</em>` : ''}</span>`;
        const btn = q <= 100
          ? `<button class="btn btn-outline btn-xs" data-tr="${q}">Xem Script &amp; Giải thích</button>`
          : `<button class="btn btn-outline btn-xs" data-note="${q}">${hasNote ? 'Sửa ghi chú' : '+ Ghi chú'}</button>`;
        exp.innerHTML = `${label}${btn}`;
        wrap.appendChild(exp);
      }

      frag.appendChild(wrap);
    });
    listEl.appendChild(frag);
  }

  function updateHeaderStats() {
    const answered = session.qList.filter((q) => !!session.userAnswers[q]).length;
    document.getElementById('exam-progress').textContent = `${answered}/${session.qList.length}`;
  }

  function chooseAnswer(q, opt) {
    if (session.isReview) return;
    session.userAnswers[q] = opt;
    persistDraft();
    updateHeaderStats();

    if (session.instantKey) {
      renderOMR();
    } else {
      // Fast in-place DOM update instead of rebuilding all 200 OMR rows
      const row = document.querySelector(`.omr-row[data-q="${q}"]`);
      if (row) {
        row.querySelectorAll('.opt-btn').forEach((btn) => {
          btn.classList.toggle('selected', btn.dataset.opt === opt);
        });
      }
    }
    selectQuestion(q, false);
  }

  // ================= SUBMIT & RESULT =================
  function submitExam() {
    stopTimer();
    Storage.clearDraft();

    const correctArr = ANSWERS[session.testId];
    let lcCorrect = 0;
    let rcCorrect = 0;
    const partStats = TESTS[session.testId].parts.map((p) => ({ ...p, correct: 0, total: 0 }));

    session.qList.forEach((q) => {
      const ok = session.userAnswers[q] === correctArr[q - 1];
      if (q <= 100 && ok) lcCorrect++;
      if (q > 100 && ok) rcCorrect++;
      const ps = partStats.find((p) => q >= p.start && q <= p.end);
      if (ps) {
        ps.total++;
        if (ok) ps.correct++;
      }
    });

    const totalCorrect = lcCorrect + rcCorrect;
    const lcScaled = session.qList.some((q) => q <= 100) ? estimateScaled(lcCorrect, true) : 0;
    const rcScaled = session.qList.some((q) => q > 100) ? estimateScaled(rcCorrect, false) : 0;
    const scaledTotal = lcScaled + rcScaled;

    // Save history & mistakes
    Storage.recordMistakes(session.testId, session.qList, session.userAnswers, correctArr);
    Storage.addHistory({
      id: Date.now(),
      testId: session.testId,
      modeLabel: session.modeLabel,
      qList: session.qList,
      lcCorrect,
      rcCorrect,
      totalCorrect,
      totalQ: session.qList.length,
      scaledTotal,
      userAnswers: session.userAnswers,
      flags: session.flags,
      date: Date.now(),
    });

    session.isReview = true;
    showResultModal({ lcCorrect, rcCorrect, totalCorrect, totalQ: session.qList.length, lcScaled, rcScaled, scaledTotal, partStats });
  }

  function showResultModal({ lcCorrect, rcCorrect, totalCorrect, totalQ, lcScaled, rcScaled, scaledTotal, partStats }) {
    document.getElementById('res-lc-raw').textContent = `${lcCorrect}/100`;
    document.getElementById('res-lc-scaled').textContent = lcScaled ? `~${lcScaled} điểm` : 'Không thi';
    document.getElementById('res-rc-raw').textContent = `${rcCorrect}/100`;
    document.getElementById('res-rc-scaled').textContent = rcScaled ? `~${rcScaled} điểm` : 'Không thi';
    document.getElementById('res-total-scaled').textContent = scaledTotal;
    document.getElementById('res-total-raw').textContent = `${totalCorrect}/${totalQ} câu đúng`;

    document.getElementById('res-part-tbody').innerHTML = partStats
      .filter((p) => p.total > 0)
      .map((p) => {
        const pct = Math.round((p.correct / p.total) * 100);
        return `<tr><td>${p.name}</td><td><strong>${p.correct}/${p.total}</strong></td><td>${pct}%</td></tr>`;
      })
      .join('');

    document.getElementById('modal-result').classList.remove('hidden');
  }

  // ================= VOCAB FLASHCARD (600+ WORDS) =================
  let vocabFiltered = [];
  let vocabIdx = 0;

  function initVocabView() {
    if (typeof toeicVocabData === 'undefined') return;
    const topics = [...new Set(toeicVocabData.map((w) => w.topic))];
    const sel = document.getElementById('vocab-topic-filter');
    sel.innerHTML = '<option value="all">Tất cả chủ đề</option>' + topics.map((t) => `<option value="${t}">${t}</option>`).join('');
    filterVocab();
  }

  function filterVocab() {
    const topic = document.getElementById('vocab-topic-filter').value;
    const status = document.getElementById('vocab-status-filter').value;
    const learned = Storage.getLearnedVocab();

    vocabFiltered = toeicVocabData.filter((w) => {
      if (topic !== 'all' && w.topic !== topic) return false;
      const isLearned = learned.includes(w.id);
      if (status === 'learned' && !isLearned) return false;
      if (status === 'unlearned' && isLearned) return false;
      return true;
    });
    vocabIdx = 0;
    renderFlashcard();
  }

  function renderFlashcard() {
    const learned = Storage.getLearnedVocab();
    document.getElementById('vocab-progress-badge').textContent = `Đã thuộc: ${learned.length}/${toeicVocabData.length}`;
    const front = document.querySelector('.flashcard-front');
    const back = document.querySelector('.flashcard-back');
    front.classList.remove('hidden');
    back.classList.add('hidden');

    if (!vocabFiltered.length) {
      document.getElementById('fc-topic').textContent = 'Trống';
      document.getElementById('fc-word').textContent = 'Không có từ phù hợp';
      document.getElementById('fc-pos').textContent = '';
      document.getElementById('fc-ipa').textContent = '';
      document.getElementById('fc-counter').textContent = '0 / 0';
      return;
    }

    const w = vocabFiltered[vocabIdx];
    document.getElementById('fc-topic').textContent = w.topic;
    document.getElementById('fc-word').textContent = w.word;
    document.getElementById('fc-pos').textContent = w.pos;
    document.getElementById('fc-ipa').textContent = w.ipa;
    document.getElementById('fc-meaning-vi').textContent = w.meaning_vi;
    document.getElementById('fc-meaning-en').textContent = w.meaning_en;
    document.getElementById('fc-example-en').textContent = w.example_en;
    document.getElementById('fc-example-vi').textContent = w.example_vi;
    document.getElementById('fc-counter').textContent = `${vocabIdx + 1} / ${vocabFiltered.length}`;

    const btnLearned = document.getElementById('btn-fc-learned');
    const isLearned = learned.includes(w.id);
    btnLearned.textContent = isLearned ? '✓ Đã thuộc' : 'Đánh dấu đã thuộc';
    btnLearned.className = isLearned ? 'btn btn-primary' : 'btn btn-outline';
  }

  // ================= GRAMMAR BANK =================
  let activeGrammarId = null;

  function initGrammarView() {
    if (typeof grammarTopics === 'undefined' || !grammarTopics.length) return;
    activeGrammarId = grammarTopics[0].id;
    renderGrammarView();
  }

  function renderGrammarView() {
    const sidebar = document.getElementById('grammar-sidebar');
    sidebar.innerHTML = grammarTopics
      .map((t) => `<button class="grammar-nav-item${t.id === activeGrammarId ? ' active' : ''}" data-gid="${t.id}">${t.title}</button>`)
      .join('');

    const topic = grammarTopics.find((t) => t.id === activeGrammarId) || grammarTopics[0];
    const content = document.getElementById('grammar-content');
    content.innerHTML = `
      <h2>${topic.title}</h2>
      <div class="grammar-summary">${topic.summary}</div>
      <h3 style="font-size:14.5px;margin-bottom:10px;">Câu hỏi luyện tập nhanh</h3>
      ${topic.questions
        .map(
          (q, qi) => `
        <div class="grammar-q-card" data-gqi="${qi}">
          <div class="grammar-q-text">${qi + 1}. ${q.text}</div>
          <div class="grammar-opts">
            ${q.options.map((opt, oi) => `<button class="btn btn-outline btn-sm" data-gopt="${oi}">${opt}</button>`).join('')}
          </div>
          <div class="grammar-exp hidden"></div>
        </div>
      `
        )
        .join('')}
    `;
  }

  // ================= MISTAKE NOTEBOOK =================
  function renderMistakesView() {
    const filterTest = document.getElementById('mistake-filter-test').value;
    const mistakes = Storage.getMistakes().filter((m) => filterTest === 'all' || m.testId === filterTest);
    const notes = Storage.getAllNotes();
    const listEl = document.getElementById('mistakes-list');

    if (!mistakes.length) {
      listEl.innerHTML = '<div class="empty-cell">Chưa có câu sai nào được ghi nhận. Hãy làm bài để hệ thống tự động lưu các câu sai tại đây!</div>';
      return;
    }

    listEl.innerHTML = mistakes
      .map((m) => {
        const ca = ANSWERS[m.testId][m.q - 1];
        const note = notes[`${m.testId}_${m.q}`] || '';
        return `
          <div class="mistake-item">
            <div>
              <div class="mistake-meta">
                <span class="badge">Test ${m.testId} · Part ${getPartOfQ(m.q)}</span>
                <strong> Câu ${m.q}</strong> — Bạn chọn <span class="status-pill err">${m.lastUserAns}</span> · Đáp án đúng <span class="status-pill ok">${ca}</span>
                <span class="muted-text">(Sai ${m.wrongCount} lần)</span>
              </div>
              ${note ? `<div class="mistake-note-preview">Ghi chú: ${note}</div>` : ''}
            </div>
            <div class="toolbar-group">
              <button class="btn btn-primary btn-xs" data-open-mistake="${m.testId}:${m.q}">Xem câu này</button>
              <button class="btn btn-outline btn-xs" data-del-mistake="${m.testId}:${m.q}">Đã thuộc</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ================= EVENTS =================
  function bindEvents() {
    // Dashboard test buttons
    document.getElementById('test-cards-container').addEventListener('click', (e) => {
      const startBtn = e.target.closest('[data-start]');
      if (startBtn) {
        const testId = startBtn.dataset.start;
        const mode = startBtn.dataset.mode;
        if (mode === 'full') {
          startSession({
            testId,
            mode: 'full',
            modeLabel: 'Thi thử Full (120\')',
            qList: Array.from({ length: 200 }, (_, i) => i + 1),
            durationSec: 120 * 60,
          });
        } else if (mode === 'lc') {
          startSession({
            testId,
            mode: 'lc',
            modeLabel: 'Listening (45\')',
            qList: Array.from({ length: 100 }, (_, i) => i + 1),
            durationSec: 45 * 60,
          });
        } else if (mode === 'rc') {
          startSession({
            testId,
            mode: 'rc',
            modeLabel: 'Reading (75\')',
            qList: Array.from({ length: 100 }, (_, i) => i + 101),
            durationSec: 75 * 60,
          });
        }
        return;
      }

      const pracBtn = e.target.closest('[data-practice]');
      if (pracBtn) {
        const testId = pracBtn.dataset.practice;
        const partNum = Number(document.getElementById(`part-select-${testId}`).value);
        const partObj = TESTS[testId].parts.find((p) => p.part === partNum);
        const qList = Array.from({ length: partObj.end - partObj.start + 1 }, (_, i) => partObj.start + i);
        startSession({
          testId,
          mode: 'part',
          modeLabel: `Luyện ${partObj.name}`,
          qList,
          durationSec: 0,
        });
      }
    });

    // Resume / Discard draft
    document.getElementById('btn-resume-draft').addEventListener('click', () => {
      const d = Storage.getDraft();
      if (!d) return;
      startSession({ ...d });
    });
    document.getElementById('btn-discard-draft').addEventListener('click', () => {
      Storage.clearDraft();
      renderDashboard();
    });

    // Vocab Flashcard events
    document.getElementById('btn-open-vocab').addEventListener('click', () => {
      initVocabView();
      showView('vocab');
    });
    document.getElementById('btn-vocab-back').addEventListener('click', () => {
      renderDashboard();
      showView('dashboard');
    });
    document.getElementById('vocab-topic-filter').addEventListener('change', filterVocab);
    document.getElementById('vocab-status-filter').addEventListener('change', filterVocab);
    document.getElementById('flashcard').addEventListener('click', () => {
      document.querySelector('.flashcard-front').classList.toggle('hidden');
      document.querySelector('.flashcard-back').classList.toggle('hidden');
    });
    document.getElementById('btn-fc-prev').addEventListener('click', () => {
      if (!vocabFiltered.length) return;
      vocabIdx = (vocabIdx - 1 + vocabFiltered.length) % vocabFiltered.length;
      renderFlashcard();
    });
    document.getElementById('btn-fc-next').addEventListener('click', () => {
      if (!vocabFiltered.length) return;
      vocabIdx = (vocabIdx + 1) % vocabFiltered.length;
      renderFlashcard();
    });
    document.getElementById('btn-fc-speak').addEventListener('click', () => {
      if (!vocabFiltered.length || !('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(vocabFiltered[vocabIdx].word);
      u.lang = 'en-US';
      speechSynthesis.speak(u);
    });
    document.getElementById('btn-fc-learned').addEventListener('click', () => {
      if (!vocabFiltered.length) return;
      Storage.toggleLearnedVocab(vocabFiltered[vocabIdx].id);
      renderFlashcard();
    });

    // Grammar Bank events
    document.getElementById('btn-open-grammar').addEventListener('click', () => {
      initGrammarView();
      showView('grammar');
    });
    document.getElementById('btn-grammar-back').addEventListener('click', () => {
      renderDashboard();
      showView('dashboard');
    });
    document.getElementById('grammar-sidebar').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-gid]');
      if (!btn) return;
      activeGrammarId = btn.dataset.gid;
      renderGrammarView();
    });
    document.getElementById('grammar-content').addEventListener('click', (e) => {
      const optBtn = e.target.closest('[data-gopt]');
      if (!optBtn) return;
      const card = optBtn.closest('.grammar-q-card');
      const qi = Number(card.dataset.gqi);
      const oi = Number(optBtn.dataset.gopt);
      const topic = grammarTopics.find((t) => t.id === activeGrammarId);
      const q = topic.questions[qi];
      card.querySelectorAll('[data-gopt]').forEach((b, idx) => {
        b.classList.remove('btn-primary');
        b.style.borderColor = idx === q.answer ? 'var(--green)' : idx === oi ? 'var(--red)' : '';
        b.style.background = idx === q.answer ? 'var(--green-bg)' : idx === oi ? 'var(--red-bg)' : '';
      });
      const exp = card.querySelector('.grammar-exp');
      exp.textContent = (oi === q.answer ? 'Chính xác! ' : 'Chưa đúng. ') + q.explanation;
      exp.classList.remove('hidden');
    });

    // Instant key toggle
    document.getElementById('toggle-instant-key').addEventListener('change', (e) => {
      if (!session) return;
      session.instantKey = e.target.checked;
      renderOMR();
      updateFeedbackBar(session.currentQ);
    });

    // Dictation toggle
    document.getElementById('btn-toggle-dictation').addEventListener('click', () => {
      document.getElementById('dictation-box').classList.toggle('hidden');
    });

    // Mistake notebook
    document.getElementById('btn-open-mistakes').addEventListener('click', () => {
      renderMistakesView();
      showView('mistakes');
    });
    document.getElementById('btn-mistakes-back').addEventListener('click', () => {
      renderDashboard();
      showView('dashboard');
    });
    document.getElementById('mistake-filter-test').addEventListener('change', renderMistakesView);
    document.getElementById('mistakes-list').addEventListener('click', (e) => {
      const openBtn = e.target.closest('[data-open-mistake]');
      if (openBtn) {
        const [tid, qStr] = openBtn.dataset.openMistake.split(':');
        const q = Number(qStr);
        const partNum = getPartOfQ(q);
        const partObj = TESTS[tid].parts.find((p) => p.part === partNum);
        const qList = Array.from({ length: partObj.end - partObj.start + 1 }, (_, i) => partObj.start + i);
        startSession({
          testId: tid,
          mode: 'part',
          modeLabel: `Ôn câu sai — ${partObj.name}`,
          qList,
          durationSec: 0,
          currentQ: q,
          isReview: true,
        });
        return;
      }
      const delBtn = e.target.closest('[data-del-mistake]');
      if (delBtn) {
        const [tid, qStr] = delBtn.dataset.delMistake.split(':');
        Storage.removeMistake(tid, Number(qStr));
        renderMistakesView();
      }
    });

    // Exam header & toolbar
    document.getElementById('btn-exit-exam').addEventListener('click', () => {
      if (!session.isReview) persistDraft();
      renderDashboard();
      showView('dashboard');
    });
    document.getElementById('btn-submit-exam').addEventListener('click', () => {
      if (confirm('Bạn chắc chắn muốn nộp bài?')) submitExam();
    });
    document.getElementById('btn-show-summary').addEventListener('click', () => {
      document.getElementById('modal-result').classList.remove('hidden');
    });

    document.getElementById('btn-prev-page').addEventListener('click', () => {
      session.currentPage--;
      renderPage();
    });
    document.getElementById('btn-next-page').addEventListener('click', () => {
      session.currentPage++;
      renderPage();
    });
    document.getElementById('select-part-jump').addEventListener('change', (e) => {
      const pt = TESTS[session.testId].parts.find((p) => p.part === Number(e.target.value));
      if (pt) {
        session.currentPage = pt.page;
        renderPage();
      }
    });
    document.getElementById('select-zoom').addEventListener('change', applyZoom);

    // Transcript drawer
    document.getElementById('btn-toggle-transcript').addEventListener('click', () => {
      document.getElementById('transcript-panel').classList.toggle('hidden');
    });
    document.getElementById('btn-close-transcript').addEventListener('click', () => {
      document.getElementById('transcript-panel').classList.add('hidden');
    });
    document.getElementById('btn-tr-prev').addEventListener('click', () => {
      session.trPage--;
      renderTranscriptPage();
    });
    document.getElementById('btn-tr-next').addEventListener('click', () => {
      session.trPage++;
      renderTranscriptPage();
    });

    // OMR Tabs & Review filters
    document.getElementById('omr-part-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.omr-tab');
      if (!tab) return;
      document.querySelectorAll('#omr-part-tabs .omr-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      session.omrPartFilter = tab.dataset.part;
      renderOMR();
    });
    document.getElementById('review-filter-bar').addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      document.querySelectorAll('#review-filter-bar .filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      session.reviewFilter = chip.dataset.filter;
      renderOMR();
    });

    // OMR Row interactions
    document.getElementById('omr-list').addEventListener('click', (e) => {
      const optBtn = e.target.closest('.opt-btn');
      if (optBtn) {
        chooseAnswer(Number(optBtn.dataset.q), optBtn.dataset.opt);
        return;
      }
      const flagBtn = e.target.closest('[data-flag]');
      if (flagBtn) {
        const q = Number(flagBtn.dataset.flag);
        session.flags[q] = !session.flags[q];
        persistDraft();
        renderOMR();
        return;
      }
      const trBtn = e.target.closest('[data-tr]');
      if (trBtn) {
        const q = Number(trBtn.dataset.tr);
        session.trPage = qToTranscriptPage(session.testId, q);
        renderTranscriptPage();
        document.getElementById('transcript-panel').classList.remove('hidden');
        return;
      }
      const checkBtn = e.target.closest('[data-check]');
      if (checkBtn) {
        const q = Number(checkBtn.dataset.check);
        session.checkedQs[q] = !session.checkedQs[q];
        renderOMR();
        selectQuestion(q, false);
        return;
      }
      const listenBtn = e.target.closest('[data-listen]');
      if (listenBtn) {
        selectQuestion(Number(listenBtn.dataset.listen), true);
        return;
      }
      const noteBtn = e.target.closest('[data-note]');
      if (noteBtn) {
        const q = Number(noteBtn.dataset.note);
        noteTarget = { testId: session.testId, q };
        document.getElementById('note-modal-title').textContent = `Ghi chú — Test ${session.testId}, Câu ${q}`;
        document.getElementById('note-textarea').value = Storage.getNote(session.testId, q);
        document.getElementById('modal-note').classList.remove('hidden');
        return;
      }
      const row = e.target.closest('.omr-row');
      if (row) {
        selectQuestion(Number(row.dataset.q), false);
      }
    });

    // Result Modal
    document.getElementById('btn-close-result').addEventListener('click', () => {
      document.getElementById('modal-result').classList.add('hidden');
    });
    document.getElementById('btn-result-to-dash').addEventListener('click', () => {
      document.getElementById('modal-result').classList.add('hidden');
      renderDashboard();
      showView('dashboard');
    });
    document.getElementById('btn-result-review').addEventListener('click', () => {
      document.getElementById('modal-result').classList.add('hidden');
      startSession({
        ...session,
        mode: 'review',
        isReview: true,
      });
    });

    // Note Modal
    document.getElementById('btn-close-note').addEventListener('click', () => {
      document.getElementById('modal-note').classList.add('hidden');
    });
    document.getElementById('btn-save-note').addEventListener('click', () => {
      if (!noteTarget) return;
      Storage.saveNote(noteTarget.testId, noteTarget.q, document.getElementById('note-textarea').value);
      document.getElementById('modal-note').classList.add('hidden');
      renderOMR();
    });

    // Audio Auto-next
    AudioPlayer.setOnEnded(() => {
      if (!session) return;
      const cur = session.currentQ;
      const step = cur <= 31 ? 1 : 3;
      const nextQ = cur + step;
      if (nextQ <= 100 && session.qList.includes(nextQ)) {
        selectQuestion(nextQ, true);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!views.exam.classList.contains('active') || !session) return;
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D', '1', '2', '3', '4'].includes(key)) {
        const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        const opt = map[key] || key;
        if (!(session.currentQ >= 7 && session.currentQ <= 31 && opt === 'D')) {
          chooseAnswer(session.currentQ, opt);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = session.qList.indexOf(session.currentQ);
        if (idx >= 0 && idx + 1 < session.qList.length) selectQuestion(session.qList[idx + 1], false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = session.qList.indexOf(session.currentQ);
        if (idx > 0) selectQuestion(session.qList[idx - 1], false);
      } else if (key === 'F') {
        session.flags[session.currentQ] = !session.flags[session.currentQ];
        persistDraft();
        renderOMR();
      } else if (e.key === ' ') {
        e.preventDefault();
        AudioPlayer.togglePlay();
      }
    });
  }

  async function init() {
    try {
      const [tRes, aRes] = await Promise.all([fetch('data/tests.json'), fetch('data/answers.json')]);
      TESTS = await tRes.json();
      ANSWERS = await aRes.json();
      bindEvents();
      renderDashboard();
    } catch (err) {
      alert('Không tải được dữ liệu đề thi. Nếu mở trực tiếp file HTML, hãy chạy qua Live Server / localhost hoặc deploy lên GitHub Pages.');
      console.error(err);
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
