const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  screen: 'home',
  mode: 'parallel',
  scene: 'generale-hartman',
  sceneData: null,
  sceneLibrary: [],
  room: '',
  playerId: null,
  hostId: null,
  connected: false,
  phase: 'LOBBY',
  players: [],
  line: 0,
  take: 1,
  recordings: {},
  recorder: null,
  recordingRequest: false,
  chunks: [],
  timer: null,
  seconds: 60,
  effect: 'normale',
  pack: null,
  localRecordingReady: false,
  linePhase: 'LISTEN',
  lineTimer: null,
  currentRecordingUrl: null,
  recordingStream: null
};

const SERVER_URL =
  location.hostname === 'localhost'
    ? 'ws://localhost:10000'
    : 'wss://riffroomserver.onrender.com';

let socket = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const existing = $('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2500);
}

function go(screen) {
  const target = String(screen || 'home').trim();

  $$('.screen').forEach((section) => {
    section.classList.toggle(
      'screen-active',
      section.dataset.screen === target
    );
  });

  state.screen = target;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function send(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    toast('Connessione al server non disponibile.');
    return false;
  }

  socket.send(JSON.stringify({
    type,
    ...payload
  }));

  return true;
}

function formatSceneDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getLines() {
  return Array.isArray(state.pack?.lines)
    ? state.pack.lines
    : [];
}

function getCurrentLine() {
  return getLines()[state.line] || null;
}

function getLineData() {
  const line = getCurrentLine();

  if (!line) return null;

  if (Array.isArray(line)) {
    return line[2] || {};
  }

  return line;
}

function getLineSpeaker() {
  const line = getCurrentLine();

  if (!line) return 'VOCE';

  if (Array.isArray(line)) {
    return line[0] || 'VOCE';
  }

  return line.speaker || 'VOCE';
}

function getLineText() {
  const line = getCurrentLine();

  if (!line) return '';

  if (Array.isArray(line)) {
    return line[1] || '';
  }

  return line.text || '';
}

function getLineStart() {
  return Number(getLineData()?.start ?? 0);
}

function getLineEnd() {
  return Number(getLineData()?.end ?? 0);
}

function getLineDuration() {
  return Math.max(0, getLineEnd() - getLineStart());
}

function getLineKey() {
  const data = getLineData();

  return data?.id || `line-${state.line}`;
}

function connect() {
  if (
    socket &&
    (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
  ) {
    return socket;
  }

  socket = new WebSocket(SERVER_URL);

  socket.addEventListener('open', () => {
    state.connected = true;

    console.log('🔌 WebSocket connesso');

    send('GET_SCENES');
  });

  socket.addEventListener('close', () => {
    state.connected = false;

    console.log('🔌 WebSocket disconnesso');

    if (state.screen !== 'home') {
      toast('Connessione persa.');
    }
  });

  socket.addEventListener('error', (error) => {
    state.connected = false;

    console.error('❌ WebSocket error:', error);

    toast('Errore di connessione al server.');
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (error) {
      console.error(
        'Messaggio server non valido:',
        error
      );
    }
  });

  return socket;
}

function handleServerMessage(data) {
  console.log('📡 SERVER:', data);

  switch (data.type) {
    case 'SCENE_LIBRARY':
      state.sceneLibrary = Array.isArray(data.scenes)
        ? data.scenes
        : [];

      renderSceneLibrary();
      break;

    case 'ROOM_CREATED':
      state.room = data.room || '';
      state.playerId = data.playerId || null;
      state.hostId = data.hostId || state.playerId || null;

      if (data.scene) {
        state.scene = data.scene;
      }

      updateRoomCode();
      go('lobby');
      break;

    case 'ROOM_JOINED':
      state.room = data.room || state.room;
      state.playerId = data.playerId || state.playerId;
      state.hostId = data.hostId || state.hostId;

      updateRoomCode();
      go('lobby');
      break;

    case 'ROOM_STATE':
      handleRoomState(data);
      break;

    case 'GAME_STARTED':
      handleGameStarted(data);
      break;

    case 'PHASE_CHANGED':
      if (data.phase) {
        state.phase = data.phase;
        setPhase(data.phase.toLowerCase());
      }
      break;

    case 'RESULTS':
      handleResults(data);
      break;

    default:
      console.log('Evento server non gestito:', data);
  }
}

function handleRoomState(data) {
  state.room = data.room || state.room;
  state.players = Array.isArray(data.players)
    ? data.players
    : [];

  state.hostId = data.hostId || state.hostId;

  if (data.scene) {
    state.scene = data.scene;
  }

  if (data.sceneData) {
    state.sceneData = data.sceneData;
  }

  renderPlayers();
  renderSceneLibrary();
  updateRoomCode();
}

function updateRoomCode() {
  const label = $('#room-code-label');

  if (label && state.room) {
    label.textContent = state.room;
  }
}

function renderPlayers() {
  const container = $('#players-list');
  if (!container) return;

  const count = $('#player-count');

  if (count) {
    count.textContent = state.players.length;
  }

  container.innerHTML = state.players
    .map((player, index) => {
      const isHost =
        player.id === state.hostId ||
        player.host === true;

      return `
        <div class="player-row">
          <div class="player-avatar">
            ${escapeHtml(
              (player.name || `Giocatore ${index + 1}`)
                .slice(0, 1)
                .toUpperCase()
            )}
          </div>
          <div class="player-name">
            ${escapeHtml(player.name || `Giocatore ${index + 1}`)}
          </div>
          ${
            isHost
              ? '<span class="player-host">host</span>'
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function renderSceneLibrary() {
  const container = $('.scene-options');

  if (!container) return;

  if (!state.sceneLibrary.length) {
    container.innerHTML = `
      <div class="empty-state">
        nessuna scena disponibile
      </div>
    `;
    return;
  }

  const isHost =
    !state.hostId ||
    state.playerId === state.hostId;

  container.innerHTML = state.sceneLibrary
    .map((scene) => {
      const selected = scene.id === state.scene;

      return `
        <button
          class="scene-option ${selected ? 'selected' : ''}"
          data-scene="${escapeHtml(scene.id)}"
          ${isHost ? '' : 'disabled'}
        >
          <span class="scene-option-title">
            ${escapeHtml(scene.title || scene.id)}
          </span>
          <small>
            ${formatSceneDuration(scene.duration)}
            · ${escapeHtml(scene.category || 'scena')}
          </small>
        </button>
      `;
    })
    .join('');

  $$('.scene-option').forEach((button) => {
    button.addEventListener('click', () => {
      if (!isHost) return;

      const sceneId = button.dataset.scene;

      state.scene = sceneId;

      $$('.scene-option').forEach((item) => {
        item.classList.toggle(
          'selected',
          item.dataset.scene === sceneId
        );
      });

      send('SELECT_SCENE', {
        room: state.room,
        scene: sceneId
      });
    });
  });
}

function handleGameStarted(data) {
  state.phase = data.phase || 'LISTEN';
  state.mode = data.mode || state.mode;
  state.scene = data.scene || state.scene;
  state.sceneData = data.sceneData || state.sceneData;
  state.line = 0;
  state.take = 1;
  state.recordings = {};
  state.localRecordingReady = false;
  state.linePhase = 'LISTEN';

  stopLineTimer();
  stopCurrentRecording();

  go('record');

  loadSharedScene()
    .then(() => {
      renderLines();
      updateLine();
      setPhase('listen');
    })
    .catch((error) => {
      console.error('Errore caricamento scena:', error);
      toast('Impossibile caricare la scena.');
    });
}

async function loadSharedScene() {
  const scene = state.sceneData;

  if (!scene) {
    throw new Error('Dati scena mancanti.');
  }

  if (!scene.riffpack) {
    throw new Error('RiffPack non configurato.');
  }

  console.log('📦 Caricamento RiffPack:', scene.riffpack);

  const response = await fetch(scene.riffpack, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      `RiffPack HTTP ${response.status}`
    );
  }

  state.pack = await response.json();

  console.log('📦 RiffPack:', state.pack);

  const lines = Array.isArray(state.pack.lines)
    ? state.pack.lines
    : [];

  state.pack.lines = lines.map((line) => {
    if (Array.isArray(line)) {
      return line;
    }

    return [
      line.speaker || 'VOCE',
      line.text || '',
      line
    ];
  });

  const video = $('#clip-video');

  if (!video) {
    throw new Error('Elemento #clip-video non trovato.');
  }

  stopLineTimer();

  video.pause();
  video.removeAttribute('src');
  video.load();

  video.preload = 'auto';
  video.loop = false;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  video.addEventListener('error', () => {
    console.error(
      '❌ Errore video:',
      video.error
    );
  });

  video.src = scene.video;

  console.log(
    '🎥 video.src impostato a:',
    video.src
  );

  video.load();

  await waitForVideoReady(video);

  video.pause();
  video.currentTime = 0;
  video.muted = true;

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  console.log('🎬 Scena pronta:', scene.title);
  console.log('✅ VIDEO CARICATO');
  console.log('src:', video.currentSrc || video.src);

  const badge = $('#clip-muted-badge');

  if (badge) {
    badge.textContent = 'originale pronto · scena sincronizzata';
    badge.hidden = false;
  }

  return state.pack;
}

function waitForVideoReady(video, timeout = 20000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }

    let finished = false;

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };

    const finish = (callback) => {
      if (finished) return;

      finished = true;
      cleanup();
      callback();
    };

    const onReady = () => {
      finish(resolve);
    };

    const onError = () => {
      finish(() => {
        reject(
          video.error ||
          new Error('Errore caricamento video.')
        );
      });
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(
          new Error(
            'Timeout durante il caricamento del video.'
          )
        );
      });
    }, timeout);

    video.addEventListener(
      'loadeddata',
      onReady
    );

    video.addEventListener(
      'canplay',
      onReady
    );

    video.addEventListener(
      'error',
      onError
    );
  });
}

function styleClipVideo(video) {
  video.style.position = 'absolute';
  video.style.inset = '0';
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  video.style.zIndex = '1';
  video.style.display = 'block';
}

function renderLines() {
  const container =
    $('#line-list') ||
    $('.line-list') ||
    $('#lines');

  if (!container) {
    renderWaveform();
    return;
  }

  const lines = getLines();

  container.innerHTML = lines
    .map((line, index) => {
      const speaker = Array.isArray(line)
        ? line[0]
        : line.speaker;

      const text = Array.isArray(line)
        ? line[1]
        : line.text;

      const active = index === state.line;

      return `
        <div
          class="line-item ${active ? 'active' : ''}"
          data-line="${index}"
        >
          <span class="line-index">${index + 1}</span>
          <div class="line-copy">
            <strong>${escapeHtml(speaker || 'VOCE')}</strong>
            <span>${escapeHtml(text || '')}</span>
          </div>
        </div>
      `;
    })
    .join('');

  renderWaveform();
}

function updateLine() {
  const lines = getLines();
  const line = getCurrentLine();

  if (!line) return;

  $$('.line-item').forEach((item) => {
    item.classList.toggle(
      'active',
      Number(item.dataset.line) === state.line
    );
  });

  const speaker = getLineSpeaker();
  const text = getLineText();

  const speakerElements = $$('#line-speaker');
  speakerElements.forEach((element) => {
    element.textContent = speaker;
  });

  const textElements = $$('#line-text');
  textElements.forEach((element) => {
    element.textContent = text;
  });

  const number = $('#line-number');

  if (number) {
    number.textContent =
      `${state.line + 1}/${lines.length}`;
  }

  const start = getLineStart();
  const end = getLineEnd();

  const timing = $('#line-timing');

  if (timing) {
    timing.textContent =
      `${start.toFixed(1)}s → ${end.toFixed(1)}s`;
  }

  renderWaveform();
  updateRecordingUI();
}

function renderWaveform() {
  const container = $('#waveform');

  if (!container) return;

  const data = getLineData();

  const fallback = [
    0.15,
    0.35,
    0.62,
    0.42,
    0.75,
    0.32,
    0.58,
    0.25,
    0.48,
    0.68,
    0.35,
    0.55
  ];

  const values =
    Array.isArray(data?.waveform) &&
    data.waveform.length
      ? data.waveform
      : fallback;

  container.innerHTML = values
    .map((value) => {
      const height =
        Math.max(
          8,
          Math.min(100, Number(value) * 100)
        );

      return `
        <span
          class="wave-bar"
          style="height:${height}%"
        ></span>
      `;
    })
    .join('');
}

function setPhase(phase) {
  state.linePhase = phase.toUpperCase();

  const phaseName =
    state.linePhase.toLowerCase();

  $$('.phase').forEach((element) => {
    element.classList.toggle(
      'active',
      element.dataset.phase === phaseName
    );
  });

  updateRecordingUI();
}

function updateRecordingUI() {
  const listenButton = $('#listen-original');
  const recordButton = $('#enter-recording');
  const replayButton = $('#replay-recording');
  const redoButton = $('#redo-recording');
  const nextButton = $('#next-line');

  const hasRecording = Boolean(
    state.recordings[getLineKey()]
  );

  if (listenButton) {
    listenButton.disabled =
      state.linePhase === 'RECORD' ||
      state.linePhase === 'RECORDING';
  }

  if (recordButton) {
    recordButton.disabled =
      state.linePhase !== 'LISTEN';
  }

  if (replayButton) {
    replayButton.disabled =
      !hasRecording ||
      state.linePhase === 'RECORD' ||
      state.linePhase === 'RECORDING';
  }

  if (redoButton) {
    redoButton.disabled =
      !hasRecording ||
      state.linePhase === 'RECORD' ||
      state.linePhase === 'RECORDING';
  }

  if (nextButton) {
    nextButton.disabled =
      !hasRecording ||
      state.linePhase === 'RECORD' ||
      state.linePhase === 'RECORDING';
  }
}

async function playCurrentLine() {
  const video = $('#clip-video');

  if (!video) return;

  const line = getLineData();

  if (!line) return;

  const start = getLineStart();
  const end = getLineEnd();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    toast('Tempi della frase non validi.');
    return;
  }

  if (end <= start) {
    toast('La durata della frase non è valida.');
    return;
  }

  stopLineTimer();

  stopCurrentRecording();

  state.linePhase = 'LISTEN';
  updateRecordingUI();

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  video.muted = false;
  video.defaultMuted = false;
  video.loop = false;

  try {
    video.currentTime = start;
  } catch (error) {
    console.warn(
      'Impossibile impostare currentTime:',
      error
    );
  }

  const stopAtEnd = () => {
    if (
      video.currentTime >= end - 0.03
    ) {
      video.pause();
      video.currentTime = start;
      stopLineTimer();
    }
  };

  video.addEventListener(
    'timeupdate',
    stopAtEnd
  );

  const cleanup = () => {
    video.removeEventListener(
      'timeupdate',
      stopAtEnd
    );
  };

  state.lineTimer = {
    cleanup
  };

  try {
    await video.play();

    console.log(
      `▶️ Ascolto frase ${state.line + 1}:`,
      start,
      '→',
      end
    );
  } catch (error) {
    cleanup();
    state.lineTimer = null;

    console.error(
      'Errore riproduzione:',
      error
    );

    toast(
      'Premi di nuovo Ascolta per avviare il video.'
    );
  }
}

function stopLineTimer() {
  if (!state.lineTimer) return;

  state.lineTimer.cleanup?.();
  state.lineTimer = null;

  const video = $('#clip-video');

  if (video) {
    video.pause();
  }
}

async function startCurrentLineRecording() {
  const video = $('#clip-video');

  if (!video) return;

  const line = getLineData();

  if (!line) return;

  const start = getLineStart();
  const end = getLineEnd();

  if (end <= start) {
    toast('Durata frase non valida.');
    return;
  }

  stopLineTimer();
  stopCurrentRecording();

  state.linePhase = 'RECORDING';
  state.localRecordingReady = false;
  state.recordingRequest = true;
  state.chunks = [];

  updateRecordingUI();

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  video.muted = true;
  video.defaultMuted = true;
  video.loop = false;

  try {
    video.currentTime = start;
  } catch (error) {
    console.warn(
      'Errore seek iniziale:',
      error
    );
  }

  let stream;

  try {
    stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });
  } catch (error) {
    console.error(
      'Microfono non disponibile:',
      error
    );

    state.linePhase = 'LISTEN';
    state.recordingRequest = false;
    updateRecordingUI();

    toast(
      'Per registrare devi consentire l’accesso al microfono.'
    );

    return;
  }

  state.recordingStream = stream;

  let recorder;

  try {
    recorder = new MediaRecorder(stream);
  } catch (error) {
    stream.getTracks().forEach(
      (track) => track.stop()
    );

    state.recordingStream = null;
    state.linePhase = 'LISTEN';
    state.recordingRequest = false;

    updateRecordingUI();

    toast(
      'Il browser non supporta la registrazione audio.'
    );

    return;
  }

  state.recorder = recorder;

  recorder.addEventListener(
    'dataavailable',
    (event) => {
      if (event.data?.size) {
        state.chunks.push(event.data);
      }
    }
  );

  recorder.addEventListener(
    'stop',
    () => {
      finishCurrentRecording();
    },
    { once: true }
  );

  const stopAtEnd = () => {
    if (
      video.currentTime >= end - 0.03
    ) {
      video.pause();
      video.currentTime = start;

      stopLineTimer();

      if (
        recorder.state !== 'inactive'
      ) {
        recorder.stop();
      }
    }
  };

  video.addEventListener(
    'timeupdate',
    stopAtEnd
  );

  state.lineTimer = {
    cleanup: () => {
      video.removeEventListener(
        'timeupdate',
        stopAtEnd
      );
    }
  };

  try {
    recorder.start();

    console.log(
      `🎙️ REC frase ${state.line + 1}:`,
      start,
      '→',
      end
    );

    await video.play();
  } catch (error) {
    console.error(
      'Errore avvio registrazione:',
      error
    );

    if (
      recorder.state !== 'inactive'
    ) {
      recorder.stop();
    }

    stopRecordingStream();

    state.linePhase = 'LISTEN';
    state.recordingRequest = false;

    updateRecordingUI();

    toast(
      'Impossibile avviare la registrazione.'
    );
  }
}

function finishCurrentRecording() {
  const key = getLineKey();

  if (!state.chunks.length) {
    state.recordingRequest = false;
    state.linePhase = 'LISTEN';
    stopRecordingStream();
    updateRecordingUI();
    return;
  }

  const mimeType =
    state.chunks[0]?.type ||
    'audio/webm';

  const blob = new Blob(
    state.chunks,
    { type: mimeType }
  );

  const oldRecording =
    state.recordings[key];

  if (oldRecording?.url) {
    URL.revokeObjectURL(
      oldRecording.url
    );
  }

  const url = URL.createObjectURL(blob);

  state.recordings[key] = {
    blob,
    url,
    take: state.take,
    line: state.line,
    duration: getLineDuration()
  };

  state.currentRecordingUrl = url;
  state.localRecordingReady = true;
  state.recordingRequest = false;

  stopRecordingStream();

  state.linePhase = 'REVIEW';

  const video = $('#clip-video');

  if (video) {
    video.pause();
    video.muted = true;
    video.currentTime = getLineStart();
  }

  updateRecordingUI();

  console.log(
    '✅ Registrazione salvata:',
    key
  );

  toast('Registrazione completata.');
}

function stopRecordingStream() {
  if (!state.recordingStream) return;

  state.recordingStream
    .getTracks()
    .forEach((track) => track.stop());

  state.recordingStream = null;
}

function stopCurrentRecording() {
  stopLineTimer();

  const recorder = state.recorder;

  if (
    recorder &&
    recorder.state !== 'inactive'
  ) {
    try {
      recorder.stop();
    } catch (error) {
      console.warn(
        'Errore stop recorder:',
        error
      );
    }
  }

  state.recorder = null;
  state.recordingRequest = false;

  stopRecordingStream();
}

async function playCurrentRecording() {
  const key = getLineKey();
  const recording = state.recordings[key];

  if (!recording?.url) {
    toast('Non hai ancora registrato questa frase.');
    return;
  }

  const video = $('#clip-video');

  if (!video) return;

  stopLineTimer();

  video.pause();
  video.muted = true;

  state.linePhase = 'REVIEW';
  updateRecordingUI();

  const audio = new Audio(
    recording.url
  );

  audio.currentTime = 0;

  state.reviewAudio = audio;

  audio.addEventListener(
    'ended',
    () => {
      state.reviewAudio = null;
      updateRecordingUI();
    },
    { once: true }
  );

  try {
    await audio.play();

    console.log(
      `▶️ Riascolto take ${recording.take}`
    );
  } catch (error) {
    console.error(
      'Errore riascolto:',
      error
    );

    toast(
      'Impossibile riprodurre la registrazione.'
    );
  }
}

function stopReviewAudio() {
  if (!state.reviewAudio) return;

  state.reviewAudio.pause();
  state.reviewAudio.currentTime = 0;
  state.reviewAudio = null;
}

function redoCurrentRecording() {
  stopReviewAudio();

  const key = getLineKey();
  const recording = state.recordings[key];

  if (recording?.url) {
    URL.revokeObjectURL(
      recording.url
    );
  }

  delete state.recordings[key];

  state.localRecordingReady = false;
  state.take += 1;
  state.linePhase = 'LISTEN';

  updateLine();
  updateRecordingUI();

  toast('Pronto per una nuova registrazione.');

  startCurrentLineRecording();
}

async function goToNextLine() {
  stopReviewAudio();
  stopLineTimer();

  const currentKey = getLineKey();

  if (!state.recordings[currentKey]) {
    toast(
      'Registra la frase prima di andare avanti.'
    );
    return;
  }

  const lines = getLines();

  if (
    state.line >= lines.length - 1
  ) {
    finishRound();
    return;
  }

  state.line += 1;
  state.take = 1;
  state.linePhase = 'LISTEN';
  state.localRecordingReady = false;

  const video = $('#clip-video');

  if (video) {
    video.pause();
    video.muted = false;
    video.defaultMuted = false;

    video.hidden = false;
    video.removeAttribute('hidden');

    styleClipVideo(video);

    try {
      video.currentTime = getLineStart();
    } catch (error) {
      console.warn(
        'Errore seek nuova frase:',
        error
      );
    }
  }

  renderLines();
  updateLine();

  console.log(
    `➡️ Frase successiva ${state.line + 1}/${lines.length}`
  );

  await playCurrentLine();
}

function finishRound() {
  stopLineTimer();
  stopReviewAudio();
  stopCurrentRecording();

  const video = $('#clip-video');

  if (video) {
    video.pause();
    video.muted = true;
  }

  state.linePhase = 'DONE';

  updateRecordingUI();

  send('ROUND_FINISHED', {
    room: state.room,
    playerId: state.playerId
  });

  go('results');
}

function handleResults(data) {
  console.log('🏆 RISULTATI:', data);

  const container =
    $('#results-list') ||
    $('.results-list');

  if (!container) return;

  const results =
    Array.isArray(data.results)
      ? data.results
      : [];

  container.innerHTML = results
    .map((result, index) => {
      return `
        <div class="result-row">
          <span>${index + 1}</span>
          <strong>
            ${escapeHtml(result.name || 'Giocatore')}
          </strong>
          <b>
            ${Number(result.score || 0)}
          </b>
        </div>
      `;
    })
    .join('');
}

function startTimer() {
  stopTimer();

  state.seconds = 60;

  updateTimer();

  state.timer = setInterval(() => {
    state.seconds -= 1;

    updateTimer();

    if (state.seconds <= 0) {
      stopTimer();

      if (
        state.linePhase === 'RECORDING'
      ) {
        stopCurrentRecording();
      }
    }
  }, 1000);
}

function stopTimer() {
  if (!state.timer) return;

  clearInterval(state.timer);
  state.timer = null;
}

function updateTimer() {
  const elements = $$('.timer');

  elements.forEach((element) => {
    element.textContent =
      `${Math.floor(state.seconds / 60)}:${String(
        state.seconds % 60
      ).padStart(2, '0')}`;
  });
}

function waitForSocketOpen(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {
      resolve(socket);
      return;
    }

    const ws = connect();

    if (!ws) {
      reject(new Error('WebSocket non disponibile.'));
      return;
    }

    const startedAt = Date.now();

    const check = () => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve(ws);
        return;
      }

      if (ws.readyState === WebSocket.CLOSED) {
        reject(new Error('WebSocket chiuso.'));
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        reject(
          new Error(
            'Timeout connessione WebSocket.'
          )
        );
        return;
      }

      setTimeout(check, 50);
    };

    check();
  });
}

async function createRoom() {
  const nameInput = $('#host-name');

  const name =
    nameInput?.value?.trim() ||
    'Host';

  if (!name) {
    toast('Inserisci il tuo nome.');
    nameInput?.focus();
    return;
  }

  try {
    console.log('🏠 Creazione stanza...', {
      name,
      scene: state.scene,
      mode: state.mode
    });

    const ws = await waitForSocketOpen();

    ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      name,
      scene: state.scene,
      mode: state.mode
    }));

    console.log('📤 CREATE_ROOM inviato');
  } catch (error) {
    console.error(
      '❌ Impossibile creare la stanza:',
      error
    );

    toast(
      'Impossibile collegarsi al server.'
    );
  }
}

async function joinRoom() {
  const nameInput = $('#join-name');
  const codeInput = $('#room-code');

  const name =
    nameInput?.value?.trim() ||
    'Giocatore';

  const room =
    codeInput?.value
      ?.trim()
      .toUpperCase();

  if (!room) {
    toast('Inserisci il codice della stanza.');
    codeInput?.focus();
    return;
  }

  if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(room)) {
    toast(
      'Il codice stanza deve essere del tipo ABC-123.'
    );
    codeInput?.focus();
    return;
  }

  try {
    console.log('🚪 Entrata nella stanza...', {
      room,
      name
    });

    const ws = await waitForSocketOpen();

    ws.send(JSON.stringify({
      type: 'JOIN_ROOM',
      room,
      name
    }));

    console.log('📤 JOIN_ROOM inviato');
  } catch (error) {
    console.error(
      '❌ Impossibile entrare nella stanza:',
      error
    );

    toast(
      'Impossibile collegarsi al server.'
    );
  }
}

function addDemoGuest() {
  if (!state.room) {
    toast('Crea prima una stanza.');
    return;
  }

  send('ADD_DEMO_GUEST', {
    room: state.room
  });
}

function startRound() {
  if (!state.room) {
    toast('Stanza non disponibile.');
    return;
  }

  if (
    state.playerId !== state.hostId
  ) {
    toast('Solo l’host può iniziare il round.');
    return;
  }

  if (!state.scene) {
    toast('Seleziona una scena.');
    return;
  }

  console.log('🎬 Avvio round:', {
    room: state.room,
    scene: state.scene,
    mode: state.mode
  });

  send('START_GAME', {
    room: state.room,
    scene: state.scene,
    mode: state.mode
  });
}

function setupNavigation() {
  $('#create-room')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      createRoom();
    }
  );

  $('#join-room')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      joinRoom();
    }
  );

  $('#add-guest')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      addDemoGuest();
    }
  );

  $('#start-round')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      startRound();
    }
  );

  $('#copy-code')?.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();

      if (!state.room) return;

      try {
        await navigator.clipboard.writeText(
          state.room
        );

        toast('Codice copiato.');
      } catch {
        toast(`Codice stanza: ${state.room}`);
      }
    }
  );

  $$('[data-go]').forEach((button) => {
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();

        const target = button.dataset.go;

        if (target) {
          go(target);
        }
      }
    );
  });

  $$('.mode-option').forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        const mode = button.dataset.mode;

        if (!mode) return;

        state.mode = mode;

        $$('.mode-option').forEach((item) => {
          item.classList.toggle(
            'selected',
            item === button
          );
        });
      }
    );
  });
}

function setupRecordingControls() {
  $('#listen-original')?.addEventListener(
    'click',
    async () => {
      await playCurrentLine();
    }
  );

  $('#enter-recording')?.addEventListener(
    'click',
    async () => {
      await startCurrentLineRecording();
    }
  );

  $('#replay-recording')?.addEventListener(
    'click',
    async () => {
      await playCurrentRecording();
    }
  );

  $('#redo-recording')?.addEventListener(
    'click',
    () => {
      redoCurrentRecording();
    }
  );

  $('#next-line')?.addEventListener(
    'click',
    async () => {
      await goToNextLine();
    }
  );
}

function setupVideoEvents() {
  const video = $('#clip-video');

  if (!video) return;

  video.addEventListener(
    'loadedmetadata',
    () => {
      console.log(
        '📐 Metadata video:',
        video.duration
      );
    }
  );

  video.addEventListener(
    'loadeddata',
    () => {
      console.log(
        '🖼️ Primo frame video disponibile'
      );
    }
  );

  video.addEventListener(
    'canplay',
    () => {
      console.log(
        '▶️ Video pronto alla riproduzione'
      );
    }
  );

  video.addEventListener(
    'ended',
    () => {
      if (
        state.linePhase === 'LISTEN'
      ) {
        video.currentTime = getLineStart();
      }
    }
  );
}

function setupKeyboard() {
  document.addEventListener(
    'keydown',
    async (event) => {
      if (
        event.key !== 'Enter' ||
        state.screen !== 'record'
      ) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (
        state.linePhase === 'LISTEN'
      ) {
        await startCurrentLineRecording();
      } else if (
        state.linePhase === 'REVIEW'
      ) {
        await goToNextLine();
      }
    }
  );
}

function cleanupRecordings() {
  Object.values(
    state.recordings
  ).forEach((recording) => {
    if (recording?.url) {
      URL.revokeObjectURL(
        recording.url
      );
    }
  });

  state.recordings = {};
}

function initializeApp() {
  setupNavigation();
  setupRecordingControls();
  setupVideoEvents();
  setupKeyboard();

  connect();

  console.log('🎬 RiffRoom app avviata');
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initializeApp,
    { once: true }
  );
} else {
  initializeApp();
}

window.addEventListener(
  'beforeunload',
  () => {
    stopLineTimer();
    stopTimer();
    stopReviewAudio();
    stopCurrentRecording();
    cleanupRecordings();
  }
);