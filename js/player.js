const AudioPlayer = (() => {
  const audioEl = document.getElementById('audio-el');
  const btnPlay = document.getElementById('btn-audio-play');
  const btnRew = document.getElementById('btn-audio-rew');
  const btnFwd = document.getElementById('btn-audio-fwd');
  const seekEl = document.getElementById('audio-seek');
  const timeEl = document.getElementById('audio-time');
  const labelEl = document.getElementById('audio-track-label');
  const speedEl = document.getElementById('audio-speed');
  const loopEl = document.getElementById('audio-loop');
  const autoNextEl = document.getElementById('audio-auto-next');
  const barEl = document.getElementById('audio-bar');

  let currentSrc = '';
  let onTrackEndCallback = null;

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateUI() {
    btnPlay.textContent = audioEl.paused ? '▶ Phát' : '❚❚ Dừng';
    const cur = audioEl.currentTime || 0;
    const dur = audioEl.duration || 0;
    timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
    seekEl.value = dur > 0 ? Math.round((cur / dur) * 100) : 0;
  }

  function loadTrack(testId, filename, label, autoPlay = false) {
    if (!filename) {
      barEl.classList.add('hidden');
      stop();
      return;
    }
    barEl.classList.remove('hidden');
    labelEl.textContent = label || '';
    const nextSrc = `assets/audio/test${testId}/${filename}`;
    if (currentSrc !== nextSrc) {
      currentSrc = nextSrc;
      audioEl.src = nextSrc;
      audioEl.playbackRate = parseFloat(speedEl.value) || 1;
    }
    if (autoPlay) {
      audioEl.play().catch(() => {});
    }
    updateUI();
  }

  function togglePlay() {
    if (!currentSrc) return;
    if (audioEl.paused) {
      audioEl.play().catch(() => {});
    } else {
      audioEl.pause();
    }
    updateUI();
  }

  function stop() {
    audioEl.pause();
    currentSrc = '';
    audioEl.removeAttribute('src');
    updateUI();
  }

  function setOnEnded(cb) {
    onTrackEndCallback = cb;
  }

  btnPlay.addEventListener('click', togglePlay);
  btnRew.addEventListener('click', () => {
    if (audioEl.src) audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
  });
  btnFwd.addEventListener('click', () => {
    if (audioEl.src && audioEl.duration) {
      audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 5);
    }
  });
  seekEl.addEventListener('input', () => {
    if (audioEl.duration) {
      audioEl.currentTime = (parseFloat(seekEl.value) / 100) * audioEl.duration;
    }
  });
  speedEl.addEventListener('change', () => {
    audioEl.playbackRate = parseFloat(speedEl.value) || 1;
  });
  loopEl.addEventListener('change', () => {
    audioEl.loop = loopEl.checked;
  });

  audioEl.addEventListener('timeupdate', updateUI);
  audioEl.addEventListener('loadedmetadata', updateUI);
  audioEl.addEventListener('play', updateUI);
  audioEl.addEventListener('pause', updateUI);
  audioEl.addEventListener('ended', () => {
    updateUI();
    if (autoNextEl.checked && typeof onTrackEndCallback === 'function') {
      onTrackEndCallback();
    }
  });

  return { loadTrack, togglePlay, stop, setOnEnded };
})();
