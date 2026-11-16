const Storage = (() => {
  const KEY = 'ma_toeic_2026_v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { draft: null, history: [], mistakes: {}, notes: {}, learnedVocab: [], targetScore: 650 };
      const parsed = JSON.parse(raw);
      return {
        draft: parsed.draft || null,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        mistakes: parsed.mistakes || {},
        notes: parsed.notes || {},
        learnedVocab: Array.isArray(parsed.learnedVocab) ? parsed.learnedVocab : [],
        targetScore: parsed.targetScore || 650,
      };
    } catch {
      return { draft: null, history: [], mistakes: {}, notes: {}, learnedVocab: [], targetScore: 650 };
    }
  }

  function saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function getDraft() {
    return loadAll().draft;
  }

  function saveDraft(draft) {
    const data = loadAll();
    data.draft = draft;
    saveAll(data);
  }

  function clearDraft() {
    const data = loadAll();
    data.draft = null;
    saveAll(data);
  }

  function addHistory(entry) {
    const data = loadAll();
    data.history.unshift(entry);
    if (data.history.length > 50) data.history = data.history.slice(0, 50);
    saveAll(data);
  }

  function clearHistory() {
    const data = loadAll();
    data.history = [];
    saveAll(data);
  }

  function recordMistakes(testId, qList, userAnswers, correctAnswers) {
    const data = loadAll();
    qList.forEach((q) => {
      const ua = userAnswers[q];
      const ca = correctAnswers[q - 1];
      const k = `${testId}_${q}`;
      if (ua && ua !== ca) {
        const prev = data.mistakes[k] || { testId, q, wrongCount: 0 };
        data.mistakes[k] = {
          testId,
          q,
          wrongCount: prev.wrongCount + 1,
          lastUserAns: ua,
          updatedAt: Date.now(),
        };
      }
    });
    saveAll(data);
  }

  function removeMistake(testId, q) {
    const data = loadAll();
    delete data.mistakes[`${testId}_${q}`];
    saveAll(data);
  }

  function getMistakes() {
    return Object.values(loadAll().mistakes).sort((a, b) => Number(a.testId) - Number(b.testId) || a.q - b.q);
  }

  function getNote(testId, q) {
    return loadAll().notes[`${testId}_${q}`] || '';
  }

  function saveNote(testId, q, text) {
    const data = loadAll();
    const k = `${testId}_${q}`;
    if (text.trim()) {
      data.notes[k] = text.trim();
    } else {
      delete data.notes[k];
    }
    saveAll(data);
  }

  function getAllNotes() {
    return loadAll().notes;
  }

  function getLearnedVocab() {
    return loadAll().learnedVocab;
  }

  function toggleLearnedVocab(id) {
    const data = loadAll();
    const idx = data.learnedVocab.indexOf(id);
    if (idx >= 0) data.learnedVocab.splice(idx, 1);
    else data.learnedVocab.push(id);
    saveAll(data);
    return data.learnedVocab;
  }

  function getTargetScore() {
    return loadAll().targetScore || 650;
  }

  function setTargetScore(val) {
    const data = loadAll();
    data.targetScore = Number(val) || 650;
    saveAll(data);
  }

  function exportJson() {
    return JSON.stringify(loadAll(), null, 2);
  }

  function importJson(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid JSON');
    saveAll({
      draft: parsed.draft || null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      mistakes: parsed.mistakes || {},
      notes: parsed.notes || {},
    });
  }

  return {
    loadAll,
    getDraft,
    saveDraft,
    clearDraft,
    addHistory,
    clearHistory,
    recordMistakes,
    removeMistake,
    getMistakes,
    getNote,
    saveNote,
    getAllNotes,
    getLearnedVocab,
    toggleLearnedVocab,
    getTargetScore,
    setTargetScore,
    exportJson,
    importJson,
  };
})();
