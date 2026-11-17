const App = (() => {
  let TESTS = {};
  let ANSWERS = {};
  let EXPLANATIONS = {};
  let ANSWER_COORDS = {};

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

  function getPageQuestions(testId, pageNum) {
    const meta = TESTS[testId];
    if (!meta || !meta.qMap) return [];
    return Object.keys(meta.qMap)
      .map(Number)
      .filter((q) => meta.qMap[String(q)].p === pageNum)
      .sort((a, b) => a - b);
  }

  function canShowAnswers() {
    return !!session && (session.isReview || session.mode === 'part' || session.isStudy);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatExplanationHtml(raw) {
    if (!raw) return '';
    return String(raw)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const safe = escapeHtml(line);
        if (/^Đáp án\s*:/i.test(safe)) {
          return `<div class="exp-line exp-line-ans">${safe.replace(/^Đáp án\s*:/i, '<strong>Đáp án:</strong>')}</div>`;
        }
        const m = safe.match(/^(•\s*[^:]{2,35}:)(.*)$/);
        if (m) {
          return `<div class="exp-line"><strong class="exp-label">${m[1]}</strong>${m[2]}</div>`;
        }
        return `<div class="exp-line">${safe}</div>`;
      })
      .join('');
  }

  function renderPageExplanations() {
    if (!session) return;
    const expContainer = document.getElementById('page-exp-container');
    const drawerEl = document.getElementById('page-exp-drawer');
    if (!canShowAnswers()) {
      session.pageExpOpen = false;
      if (expContainer) expContainer.classList.add('hidden');
      if (drawerEl) drawerEl.classList.add('hidden');
      return;
    }
    const pageQs = getPageQuestions(session.testId, session.currentPage);
    const testExp = EXPLANATIONS[session.testId] || {};
    const expQs = session.isStudy ? pageQs.filter((q) => !!testExp[String(q)]) : pageQs;

    // In Study Mode, hide the entire explanation bar/drawer if no question on this page has an explanation
    if (session.isStudy && expQs.length === 0) {
      if (expContainer) expContainer.classList.add('hidden');
      if (drawerEl) drawerEl.classList.add('hidden');
      return;
    }
    if (expContainer) expContainer.classList.remove('hidden');

    const summaryEl = document.getElementById('page-exp-summary');
    const contentEl = document.getElementById('page-exp-content');
    const toggleBtn = document.getElementById('btn-toggle-page-exp');
    const iconEl = document.getElementById('page-exp-btn-icon');
    const labelEl = document.getElementById('page-exp-btn-label');

    if (expQs.length > 0) {
      summaryEl.textContent = `Trang ${session.currentPage} · ${expQs.length} câu (${expQs[0]}–${expQs[expQs.length - 1]})`;
    } else {
      summaryEl.textContent = `Trang ${session.currentPage} · Trang hướng dẫn / đoạn văn`;
    }

    toggleBtn.classList.toggle('open', !!session.pageExpOpen);
    iconEl.textContent = session.pageExpOpen ? '▼' : '▲';
    labelEl.textContent = session.pageExpOpen
      ? 'Ẩn đáp án & Giải thích (Trang này)'
      : 'Hiện đáp án & Giải thích (Trang này)';
    drawerEl.classList.toggle('hidden', !session.pageExpOpen);

    if (!session.pageExpOpen) return;

    if (expQs.length === 0) {
      const nextQs = getPageQuestions(session.testId, session.currentPage + 1);
      const jumpHtml = nextQs.length
        ? `<button class="btn btn-primary btn-xs" id="btn-jump-next-qpage">Xem trang câu hỏi tiếp theo (Trang ${session.currentPage + 1}: Câu ${nextQs[0]}–${nextQs[nextQs.length - 1]})</button>`
        : '';
      contentEl.innerHTML = `<div class="page-exp-item"><div class="page-exp-item-body">Trang này là trang hướng dẫn hoặc đoạn văn đọc hiểu (câu hỏi nằm ở trang kế tiếp).</div>${jumpHtml ? `<div class="page-exp-lc-actions">${jumpHtml}</div>` : ''}</div>`;
      const jBtn = document.getElementById('btn-jump-next-qpage');
      if (jBtn) {
        jBtn.onclick = () => {
          session.currentPage += 1;
          renderPage();
        };
      }
      return;
    }

    const correctArr = ANSWERS[session.testId] || [];
    const notes = Storage.getAllNotes();

    contentEl.innerHTML = expQs.map((q) => {
      const ca = correctArr[q - 1] || '';
      const ua = session.userAnswers[q] || '';
      const isOk = ua === ca;
      const activeCls = q === session.currentQ ? ' active' : '';
      const statusHtml = session.isStudy
        ? ''
        : !ua
          ? `<span class="muted-text">Chưa chọn</span>`
          : isOk
            ? `<span class="status-pill ok">Bạn chọn ${ua} · Đúng</span>`
            : `<span class="status-pill err">Bạn chọn ${ua} · Sai</span>`;

      if (q <= 100) {
        const trPage = qToTranscriptPage(session.testId, q);
        return `
          <div id="exp-item-${q}" class="page-exp-item${activeCls}">
            <div class="page-exp-item-head">
              <div class="page-exp-item-title">
                <strong>Câu ${q}</strong>
                <span class="badge">Đáp án: ${ca}</span>
                ${statusHtml}
              </div>
              <button class="btn btn-outline btn-xs" data-exp-tr="${q}">Xem Transcript &amp; Dịch nghĩa (Tr. ${trPage})</button>
            </div>
          </div>
        `;
      }

      const expText = testExp[String(q)] || 'Chưa có giải thích chi tiết cho câu này.';
      const noteText = notes[`${session.testId}_${q}`] || '';
      const noteHtml = noteText ? `<div class="exp-note-line">📝 <strong>Ghi chú của bạn:</strong> ${escapeHtml(noteText)}</div>` : '';
      return `
        <div id="exp-item-${q}" class="page-exp-item${activeCls}">
          <div class="page-exp-item-head">
            <div class="page-exp-item-title">
              <strong>Câu ${q}</strong>
              <span class="badge">Đáp án: ${ca}</span>
              ${statusHtml}
            </div>
            <button class="btn btn-outline btn-xs" data-exp-note="${q}">${noteText ? 'Sửa ghi chú' : '+ Ghi chú'}</button>
          </div>
          <div class="page-exp-item-body">${formatExplanationHtml(expText)}${noteHtml}</div>
        </div>
      `;
    }).join('');
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
    const startQ = currentQ || qList[0];
    const startPart = String(getPartOfQ(startQ));
    const isStudy = mode === 'study';
    session = {
      testId,
      mode, // 'full' | 'lc' | 'rc' | 'part' | 'review' | 'study'
      modeLabel,
      qList,
      durationSec,
      remainingSec: durationSec,
      elapsedSec: 0,
      userAnswers: { ...userAnswers },
      flags: { ...flags },
      currentQ: startQ,
      expandedQ: startQ,
      currentPage: meta.qMap[String(startQ)].p,
      trPage: 1,
      isReview,
      isStudy,
      pageExpOpen: isReview,
      omrPartFilter: isStudy ? 'all' : startPart,
      reviewFilter: 'all',
    };

    document.getElementById('exam-title').textContent = `Test ${testId}`;
    document.getElementById('exam-mode-badge').textContent = isReview
      ? 'Xem lại & Đáp án'
      : isStudy
        ? 'Chế độ học'
        : modeLabel;
    document.getElementById('tr-total-num').textContent = meta.transcriptCount;

    // Default zoom: 'fit' on mobile to prevent horizontal overflow, '0.85' on desktop
    document.getElementById('select-zoom').value = window.innerWidth <= 768 ? 'fit' : '0.85';
    applyZoom();

    // Reset mobile drawer & settings state
    closeOmrDrawer();
    const paneLeft = document.querySelector('.pane-left');
    if (paneLeft) paneLeft.classList.remove('settings-open');
    const mobileSettingsBtn = document.getElementById('btn-mobile-settings');
    if (mobileSettingsBtn) {
      mobileSettingsBtn.classList.remove('active');
      mobileSettingsBtn.setAttribute('aria-expanded', 'false');
    }

    // Toggle UI controls based on mode
    const btnSubmit = document.getElementById('btn-submit-exam');
    const btnSummary = document.getElementById('btn-show-summary');
    const btnTranscript = document.getElementById('btn-toggle-transcript');
    const reviewBar = document.getElementById('review-filter-bar');
    const expContainer = document.getElementById('page-exp-container');

    document.getElementById('transcript-panel').classList.add('hidden');
    views.exam.classList.toggle('is-study', isStudy);
    if (expContainer) expContainer.classList.toggle('hidden', !canShowAnswers());
    if (isReview) {
      btnSubmit.classList.add('hidden');
      btnSummary.classList.remove('hidden');
      btnTranscript.classList.remove('hidden');
      reviewBar.classList.remove('hidden');
    } else if (isStudy) {
      btnSubmit.classList.add('hidden');
      btnSummary.classList.add('hidden');
      btnTranscript.classList.remove('hidden');
      reviewBar.classList.add('hidden');
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
      tab.classList.toggle('active', p === session.omrPartFilter);
    });

    showView('exam');
    renderPage();
    renderTranscriptPage();
    renderOMR();
    selectQuestion(session.currentQ, false);
    updateHeaderStats();

    if (!isReview && !isStudy) {
      startTimer();
    } else {
      stopTimer();
      document.getElementById('exam-timer').textContent = isStudy ? 'Chế độ học' : 'Đã nộp';
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
    if (!session || session.isReview || session.isStudy) return;
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

    // Sync Part dropdown & OMR active Part tab (when not viewing 'all')
    const partAtPage = [...meta.parts].reverse().find((pt) => p >= pt.page);
    if (partAtPage) {
      const partStr = String(partAtPage.part);
      document.getElementById('select-part-jump').value = partStr;
      if (session.omrPartFilter !== 'all' && session.omrPartFilter !== partStr) {
        session.omrPartFilter = partStr;
        document.querySelectorAll('#omr-part-tabs .omr-tab').forEach((t) => {
          t.classList.toggle('active', t.dataset.part === partStr);
        });
        renderOMR();
      }
    }

    renderStudyAnswerStrip();
    renderPageAnswerCircles();
    renderPageExplanations();
  }

  function renderPageAnswerCircles() {
    const overlay = document.getElementById('page-answer-overlay');
    if (!overlay) return;
    if (!session || !session.isStudy) {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      return;
    }
    const testCoords = ANSWER_COORDS[session.testId] || {};
    const pageQs = getPageQuestions(session.testId, session.currentPage);
    const marks = [];
    pageQs.forEach((q) => {
      const c = testCoords[String(q)];
      if (!c) return;
      const activeCls = q === session.currentQ ? ' active' : '';
      marks.push(
        `<div class="ans-circle-mark${activeCls}" style="left:${c.x}%;top:${c.y}%;" data-circle-q="${q}" title="Câu ${q}: Đáp án ${c.ans}"></div>`
      );
    });
    if (!marks.length) {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      return;
    }
    overlay.innerHTML = marks.join('');
    overlay.classList.remove('hidden');
  }

  function renderStudyAnswerStrip() {
    const stripEl = document.getElementById('study-answer-strip');
    if (!stripEl) return;
    if (!session || !session.isStudy) {
      stripEl.classList.add('hidden');
      stripEl.innerHTML = '';
      return;
    }
    const pageQs = getPageQuestions(session.testId, session.currentPage);
    const testCoords = ANSWER_COORDS[session.testId] || {};
    // Only show strip for questions without direct on-page circles (e.g. Part 1 & Part 2)
    const stripQs = pageQs.filter((q) => !testCoords[String(q)]);
    if (!stripQs.length) {
      stripEl.classList.add('hidden');
      stripEl.innerHTML = '';
      return;
    }
    stripEl.classList.remove('hidden');
    const correctArr = ANSWERS[session.testId] || [];
    const pillsHtml = stripQs.map((q) => {
      const ca = correctArr[q - 1] || '';
      const activeCls = q === session.currentQ ? ' active' : '';
      return `<button type="button" class="study-ans-pill${activeCls}" data-study-q="${q}" title="Chọn câu ${q}"><span>Câu ${q}</span><span class="study-circle">${ca}</span></button>`;
    }).join('');
    stripEl.innerHTML = `<span class="study-strip-label">Đáp án trang ${session.currentPage}:</span>${pillsHtml}`;
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
    const stage = document.getElementById('page-stage');
    if (val === 'fit') {
      img.classList.add('fit');
      if (stage) stage.classList.add('fit');
      img.style.width = '';
    } else {
      img.classList.remove('fit');
      if (stage) stage.classList.remove('fit');
      img.style.width = `${Math.round(820 * parseFloat(val))}px`;
    }
  }

  function openOmrDrawer() {
    const pane = document.getElementById('pane-right');
    const backdrop = document.getElementById('mobile-omr-backdrop');
    if (pane) pane.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  function closeOmrDrawer() {
    const pane = document.getElementById('pane-right');
    const backdrop = document.getElementById('mobile-omr-backdrop');
    if (pane) pane.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
  }

  function updateMobileQuickBar() {
    if (!session) return;
    const q = session.currentQ;
    const labelEl = document.getElementById('mobile-current-q-label');
    const optsEl = document.getElementById('mobile-quick-opts');
    const flagBtn = document.getElementById('btn-mobile-q-flag');
    const prevBtn = document.getElementById('btn-mobile-q-prev');
    const nextBtn = document.getElementById('btn-mobile-q-next');
    if (!labelEl || !optsEl) return;

    labelEl.textContent = `Câu ${q}`;
    const ua = session.userAnswers[q] || '';
    const ca = (ANSWERS[session.testId] || [])[q - 1] || '';

    optsEl.querySelectorAll('[data-mobile-opt]').forEach((btn) => {
      const opt = btn.dataset.mobileOpt;
      btn.classList.toggle('hidden', q >= 7 && q <= 31 && opt === 'D');
      btn.classList.remove('selected', 'correct', 'wrong');
      if (session.isStudy) {
        if (opt === ca) btn.classList.add('correct');
      } else if (session.isReview) {
        if (opt === ca) btn.classList.add('correct');
        else if (opt === ua && ua !== ca) btn.classList.add('wrong');
      } else if (opt === ua) {
        btn.classList.add('selected');
      }
      btn.disabled = !!(session.isReview || session.isStudy);
    });

    if (flagBtn) flagBtn.classList.toggle('flagged', !!session.flags[q]);
    const idx = session.qList.indexOf(q);
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= session.qList.length - 1;
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

    // Highlight active OMR chip
    document.querySelectorAll('.omr-q-chip').forEach((chip) => {
      const rq = Number(chip.dataset.q);
      chip.classList.toggle('active-q', rq === q);
      if (rq === q) {
        chip.scrollIntoView({ block: 'nearest' });
      }
    });

    renderStudyAnswerStrip();
    renderPageAnswerCircles();
    updateMobileQuickBar();
    updateToolbarQControls();
  }

  function updateToolbarQControls() {
    if (!session) return;
    const labelEl = document.getElementById('toolbar-q-label');
    const prevBtn = document.getElementById('btn-prev-q');
    const nextBtn = document.getElementById('btn-next-q');
    const idx = session.qList.indexOf(session.currentQ);
    if (labelEl) labelEl.innerHTML = `<strong>Câu ${session.currentQ}</strong>`;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= session.qList.length - 1;
  }

  function stepQuestion(delta) {
    if (!session) return;
    const idx = session.qList.indexOf(session.currentQ);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= session.qList.length) return;
    const nextQ = session.qList[nextIdx];
    session.expandedQ = nextQ;
    renderOMR();
    selectQuestion(nextQ, false);
  }

  // ================= OMR SHEET (COLLAPSED GRID + INLINE EXPAND) =================
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
      listEl.innerHTML = '<div class="empty-cell" style="grid-column:1/-1">Không có câu hỏi nào khớp bộ lọc.</div>';
      return;
    }

    const expIdx = session.expandedQ ? filteredQs.indexOf(session.expandedQ) : -1;
    const insertAfterIdx = expIdx >= 0 ? Math.min(filteredQs.length - 1, Math.floor(expIdx / 4) * 4 + 3) : -1;

    const frag = document.createDocumentFragment();
    filteredQs.forEach((q, idx) => {
      const ua = session.userAnswers[q] || '';
      const ca = correctArr[q - 1];
      const isFlagged = !!session.flags[q];

      const chip = document.createElement('button');
      chip.type = 'button';
      let cls = 'omr-q-chip';
      if (session.currentQ === q) cls += ' active-q';
      if (isFlagged) cls += ' flagged';
      if (session.isStudy) {
        cls += ' study-correct';
      } else if (session.isReview) {
        cls += ua === ca ? ' is-correct' : ' is-wrong';
      } else if (ua) {
        cls += ' answered';
      }
      chip.className = cls;
      chip.dataset.q = q;
      const chipAns = session.isStudy ? ca : ua;
      chip.innerHTML = `<span>${q}</span>${chipAns ? `<span class="omr-chip-ans">·${chipAns}</span>` : ''}${isFlagged ? '<span class="omr-chip-flag">⚑</span>' : ''}`;
      frag.appendChild(chip);

      if (idx === insertAfterIdx) {
        const eq = session.expandedQ;
        const eua = session.userAnswers[eq] || '';
        const eca = correctArr[eq - 1];
        const eFlagged = !!session.flags[eq];
        const eHasNote = !!(notes[`${session.testId}_${eq}`]);

        let optsHtml = '';
        ['A', 'B', 'C', 'D'].forEach((opt) => {
          if (eq >= 7 && eq <= 31 && opt === 'D') return;
          let ocls = 'opt-btn';
          if (session.isStudy) {
            if (opt === eca) ocls += ' correct';
          } else if (session.isReview) {
            if (opt === eca) ocls += ' correct';
            else if (opt === eua && eua !== eca) ocls += ' wrong';
          } else if (opt === eua) {
            ocls += ' selected';
          }
          optsHtml += `<button type="button" class="${ocls}" data-q="${eq}" data-opt="${opt}">${opt}</button>`;
        });

        let statusHtml = '';
        if (session.isStudy) {
          statusHtml = `<div class="omr-exp-status" style="color:var(--green);font-weight:600">Đáp án đúng: ${eca}</div>`;
        } else if (session.isReview) {
          statusHtml = eua === eca
            ? `<div class="omr-exp-status" style="color:var(--green);font-weight:600">Chính xác (${eca})</div>`
            : `<div class="omr-exp-status" style="color:var(--red);font-weight:600">Bạn chọn: ${eua || '—'} · Đáp án đúng: ${eca}</div>`;
        }

        const card = document.createElement('div');
        card.className = 'omr-expanded-card';
        card.innerHTML = `
          <div class="omr-exp-head">
            <span class="omr-exp-title">Câu ${eq}</span>
            <div class="q-actions">
              ${eq <= 100 ? `<button type="button" class="icon-btn" data-listen="${eq}" title="Nghe câu này">♪</button>` : ''}
              <button type="button" class="icon-btn${eFlagged ? ' flagged' : ''}" data-flag="${eq}" title="Cắm cờ">⚑</button>
              ${(session.isReview || session.isStudy) ? `<button type="button" class="icon-btn${eHasNote ? ' has-note' : ''}" data-note="${eq}" title="Ghi chú">✎</button>` : ''}
            </div>
          </div>
          <div class="omr-exp-opts">${optsHtml}</div>
          ${statusHtml}
        `;
        frag.appendChild(card);
      }
    });
    listEl.appendChild(frag);
    renderStudyAnswerStrip();
    renderPageAnswerCircles();
    updateMobileQuickBar();
    updateToolbarQControls();
  }

  function updateToolbarQControls() {
    if (!session) return;
    const labelEl = document.getElementById('toolbar-q-label');
    const prevBtn = document.getElementById('btn-prev-q');
    const nextBtn = document.getElementById('btn-next-q');
    const idx = session.qList.indexOf(session.currentQ);
    if (labelEl) labelEl.innerHTML = `<strong>Câu ${session.currentQ}</strong>`;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx < 0 || idx >= session.qList.length - 1;
  }

  function stepQuestion(delta) {
    if (!session) return;
    const idx = session.qList.indexOf(session.currentQ);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= session.qList.length) return;
    const nextQ = session.qList[nextIdx];
    session.expandedQ = nextQ;
    renderOMR();
    selectQuestion(nextQ, false);
  }

  function updateHeaderStats() {
    const answered = session.qList.filter((q) => !!session.userAnswers[q]).length;
    const text = session.isStudy ? `${session.qList.length} câu` : `${answered}/${session.qList.length}`;
    document.getElementById('exam-progress').textContent = text;
    const mobileProg = document.getElementById('mobile-drawer-progress');
    if (mobileProg) mobileProg.textContent = text;
    const drawerStats = document.getElementById('omr-drawer-stats');
    if (drawerStats) drawerStats.textContent = text;
  }

  function chooseAnswer(q, opt) {
    if (session.isReview || session.isStudy) return;
    session.userAnswers[q] = opt;
    session.expandedQ = q;
    persistDraft();
    updateHeaderStats();
    renderOMR();
    selectQuestion(q, false);
    if (session.pageExpOpen) renderPageExplanations();
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
    renderPageExplanations();
    updateMobileQuickBar();
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

    const studyBar = document.querySelector('.study-tabs-bar');
    if (studyBar) {
      studyBar.addEventListener('click', (e) => {
        const studyBtn = e.target.closest('[data-study]');
        if (!studyBtn) return;
        const testId = studyBtn.dataset.study;
        startSession({
          testId,
          mode: 'study',
          modeLabel: 'Chế độ học',
          qList: Array.from({ length: 200 }, (_, i) => i + 1),
          durationSec: 0,
        });
      });
    }

    document.getElementById('study-answer-strip').addEventListener('click', (e) => {
      const pill = e.target.closest('[data-study-q]');
      if (!pill || !session || !session.isStudy) return;
      const q = Number(pill.dataset.studyQ);
      session.expandedQ = q;
      renderOMR();
      selectQuestion(q, q <= 100);
    });

    document.getElementById('page-answer-overlay').addEventListener('click', (e) => {
      const mark = e.target.closest('[data-circle-q]');
      if (!mark || !session || !session.isStudy) return;
      const q = Number(mark.dataset.circleQ);
      session.expandedQ = q;
      const hasExp = !!(EXPLANATIONS[session.testId] && EXPLANATIONS[session.testId][String(q)]);
      if (hasExp) {
        session.pageExpOpen = true;
      }
      renderOMR();
      selectQuestion(q, q <= 100);
      if (hasExp) {
        renderPageExplanations();
        const item = document.getElementById(`exp-item-${q}`);
        if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    // Bottom page explanation toggle & actions
    document.getElementById('btn-toggle-page-exp').addEventListener('click', () => {
      if (!session) return;
      session.pageExpOpen = !session.pageExpOpen;
      renderPageExplanations();
    });
    document.getElementById('page-exp-content').addEventListener('click', (e) => {
      const trBtn = e.target.closest('[data-exp-tr]');
      if (trBtn) {
        const q = Number(trBtn.dataset.expTr);
        session.trPage = qToTranscriptPage(session.testId, q);
        renderTranscriptPage();
        document.getElementById('transcript-panel').classList.remove('hidden');
        return;
      }
      const noteBtn = e.target.closest('[data-exp-note]');
      if (noteBtn) {
        const q = Number(noteBtn.dataset.expNote);
        noteTarget = { testId: session.testId, q };
        document.getElementById('note-modal-title').textContent = `Ghi chú — Test ${session.testId}, Câu ${q}`;
        document.getElementById('note-textarea').value = Storage.getNote(session.testId, q);
        document.getElementById('modal-note').classList.remove('hidden');
      }
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
    document.getElementById('btn-prev-q').addEventListener('click', () => stepQuestion(-1));
    document.getElementById('btn-next-q').addEventListener('click', () => stepQuestion(1));
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

    // OMR Chip & Expanded Card interactions
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
      const chip = e.target.closest('.omr-q-chip');
      if (chip) {
        const q = Number(chip.dataset.q);
        session.expandedQ = session.expandedQ === q ? null : q;
        renderOMR();
        selectQuestion(q, false);
      }
    });

    // Mobile Settings, OMR Drawer & Quick Answer Bar
    document.getElementById('btn-mobile-settings').addEventListener('click', (e) => {
      const paneLeft = document.querySelector('.pane-left');
      if (!paneLeft) return;
      const isOpen = paneLeft.classList.toggle('settings-open');
      e.currentTarget.classList.toggle('active', isOpen);
      e.currentTarget.setAttribute('aria-expanded', String(isOpen));
    });
    document.getElementById('btn-open-omr-drawer').addEventListener('click', openOmrDrawer);
    document.getElementById('btn-close-omr-drawer').addEventListener('click', closeOmrDrawer);
    document.getElementById('mobile-omr-backdrop').addEventListener('click', closeOmrDrawer);
    document.getElementById('mobile-quick-opts').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mobile-opt]');
      if (!btn || !session || session.isReview) return;
      chooseAnswer(session.currentQ, btn.dataset.mobileOpt);
    });
    document.getElementById('btn-mobile-q-flag').addEventListener('click', () => {
      if (!session) return;
      const q = session.currentQ;
      session.flags[q] = !session.flags[q];
      if (!session.isReview) persistDraft();
      renderOMR();
      updateMobileQuickBar();
    });
    document.getElementById('btn-mobile-q-prev').addEventListener('click', () => {
      if (!session) return;
      const idx = session.qList.indexOf(session.currentQ);
      if (idx > 0) {
        const prevQ = session.qList[idx - 1];
        selectQuestion(prevQ, false);
        renderOMR();
      }
    });
    document.getElementById('btn-mobile-q-next').addEventListener('click', () => {
      if (!session) return;
      const idx = session.qList.indexOf(session.currentQ);
      if (idx >= 0 && idx < session.qList.length - 1) {
        const nextQ = session.qList[idx + 1];
        selectQuestion(nextQ, false);
        renderOMR();
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
      if (session && session.pageExpOpen) renderPageExplanations();
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
        if (idx >= 0 && idx + 1 < session.qList.length) {
          const nextQ = session.qList[idx + 1];
          session.expandedQ = nextQ;
          renderOMR();
          selectQuestion(nextQ, false);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = session.qList.indexOf(session.currentQ);
        if (idx > 0) {
          const prevQ = session.qList[idx - 1];
          session.expandedQ = prevQ;
          renderOMR();
          selectQuestion(prevQ, false);
        }
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
      const [tRes, aRes, eRes, cRes] = await Promise.all([
        fetch('data/tests.json'),
        fetch('data/answers.json'),
        fetch('data/explanations.json').catch(() => null),
        fetch('data/answer_coords.json').catch(() => null),
      ]);
      TESTS = await tRes.json();
      ANSWERS = await aRes.json();
      if (eRes && eRes.ok) {
        EXPLANATIONS = await eRes.json();
      }
      if (cRes && cRes.ok) {
        ANSWER_COORDS = await cRes.json();
      }
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
