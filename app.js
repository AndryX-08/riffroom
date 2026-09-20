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
  recordingStream: null,
  reviewAudio: null
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

  socket.send(
    JSON.stringify({
      type,
      ...payload
    })
  );

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

function isHost() {
  return Boolean(
    state.playerId &&
    state.hostId &&
    state.playerId === state.hostId
  );
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
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (error) {
      console.error('Messaggio server non valido:', error);
    }
  });

  return socket;
}

function waitForSocketOpen(timeout = 20000) {
  return new Promise((resolve, reject) => {
    if (socket?.readyState === WebSocket.OPEN) {
      resolve(socket);
      return;
    }

    const ws =
      socket?.readyState === WebSocket.CONNECTING
        ? socket
        : connect();

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

      if (
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING
      ) {
        reject(new Error('Connessione al server chiusa.'));
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        reject(new Error('Timeout connessione al server.'));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  }).catch((error) => {
    console.error('❌ Connessione WebSocket:', error);
    toast('Il server non è raggiungibile. Riprova tra poco.');
    throw error;
  });
}

function handleServerMessage(data) {
  console.log('📡 SERVER:', data);

  switch (data.type) {
    case 'CONNECTED':
      console.log(
        '✅ Server pronto:',
        data.message || 'connesso'
      );
      break;

    case 'SCENE_LIBRARY':
      state.sceneLibrary = Array.isArray(data.scenes)
        ? data.scenes
        : [];

      renderSceneLibrary();
      break;

    case 'ROOM_CREATED':
      state.room = data.roomCode || '';
      state.playerId = data.playerId || null;
      state.hostId = data.hostId || state.playerId || null;

      updateRoomCode();
      go('lobby');
      break;

    case 'ROOM_JOINED':
      state.room = data.roomCode || '';
      state.playerId = data.playerId || null;
      state.hostId = data.hostId || null;

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
      }
      break;

    case 'VOTE_UPDATE':
      console.log('🗳️ Voti aggiornati:', data.results);
      break;

    case 'RESULTS':
      handleResults(data);
      break;

    case 'ERROR':
      console.error('❌ Server:', data.message);
      toast(data.message || 'Errore del server.');
      break;

    case 'PONG':
      break;

    default:
      console.log(
        'Evento server non gestito:',
        data
      );
  }
}

function handleRoomState(data) {
  state.room = data.roomCode || state.room;
  state.players = Array.isArray(data.players)
    ? data.players
    : [];

  state.hostId = data.hostId || state.hostId;

  if (data.mode) {
    state.mode = data.mode;
  }

  if (data.scene) {
    state.scene = data.scene;
  }

  if (data.sceneData) {
    state.sceneData = data.sceneData;
  }

  if (data.phase) {
    state.phase = data.phase;
  }

  renderPlayers();
  renderSceneLibrary();
  updateRoomCode();
  updateModeUI();
}

function updateRoomCode() {
  const label = $('#room-code-label');

  if (label) {
    label.textContent = state.room || '------';
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
      const host =
        player.id === state.hostId ||
        player.host === true;

      return `
        <div class="player-row">
          <div
            class="player-avatar"
            ${player.color ? `style="background:${escapeHtml(player.color)}"` : ''}
          >
            ${escapeHtml(
              (player.name || `Giocatore ${index + 1}`)
                .slice(0, 1)
                .toUpperCase()
            )}
          </div>

          <div class="player-name">
            ${escapeHtml(
              player.name || `Giocatore ${index + 1}`
            )}
          </div>

          ${
            host
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

  const scenes = Array.isArray(state.sceneLibrary)
    ? state.sceneLibrary
    : [];

  if (!scenes.length) {
    container.innerHTML = `
      <div class="empty-state">
        nessuna scena disponibile
      </div>
    `;
    return;
  }

  container.innerHTML = scenes
    .map((item) => {
      const selected =
        item.id === state.scene;

      return `
        <button
          class="scene-option ${selected ? 'selected' : ''}"
          data-scene="${escapeHtml(item.id)}"
          type="button"
        >
          <div class="scene-option-main">
            <strong>
              ${escapeHtml(item.title || item.id)}
            </strong>

            <span>
              ${escapeHtml(item.category || 'scena')}
            </span>
          </div>

          <span class="scene-duration">
            ${formatSceneDuration(item.duration)}
          </span>
        </button>
      `;
    })
    .join('');

  container
    .querySelectorAll('.scene-option')
    .forEach((button) => {
      button.addEventListener('click', () => {
        selectScene(button.dataset.scene);
      });
    });
}

function selectScene(sceneId) {
  if (!sceneId) return;

  if (!isHost()) {
    toast('Solo l’host può scegliere la scena.');
    return;
  }

  const selectedScene =
    state.sceneLibrary.find(
      (item) => item.id === sceneId
    );

  if (!selectedScene) {
    toast('Scena non disponibile.');
    return;
  }

  state.scene = selectedScene.id;
  state.sceneData = selectedScene;

  renderSceneLibrary();

  send('SET_SCENE', {
    scene: selectedScene.id
  });

  console.log(
    '➡️ SET_SCENE',
    selectedScene.id
  );
}

function updateModeUI() {
  $$('.mode-option').forEach((button) => {
    button.classList.toggle(
      'selected',
      button.dataset.mode === state.mode
    );
  });

  const label = $('#mode-label');

  if (label) {
    label.textContent =
      state.mode === 'roles'
        ? 'cast condiviso'
        : 'ognuno per sé';
  }
}

function handleGameStarted(data) {
  state.phase = data.phase || 'LISTEN';
  state.mode = data.mode || state.mode;
  state.scene = data.scene || state.scene;
  state.sceneData =
    data.sceneData || state.sceneData;

  state.line = 0;
  state.take = 1;
  state.recordings = {};
  state.localRecordingReady = false;
  state.linePhase = 'LISTEN';

  stopLineTimer();
  stopCurrentRecording();
  stopReviewAudio();
  stopTimer();

  updateModeUI();
  go('record');

  loadSharedScene()
    .then(() => {
      renderLines();
      updateLine();
      setPhase('LISTEN');
      startTimer();
      playCurrentLine();
    })
    .catch((error) => {
      console.error(
        'Errore caricamento scena:',
        error
      );

      toast(
        'Impossibile caricare la scena.'
      );
    });
}

async function loadSharedScene() {
  const scene = state.sceneData;

  if (!scene) {
    throw new Error(
      'Dati scena mancanti.'
    );
  }

  if (!scene.riffpack) {
    throw new Error(
      'RiffPack non configurato.'
    );
  }

  console.log(
    '📦 Caricamento RiffPack:',
    scene.riffpack
  );

  const response = await fetch(
    scene.riffpack,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      `RiffPack HTTP ${response.status}`
    );
  }

  state.pack = await response.json();

  if (!Array.isArray(state.pack.lines)) {
    throw new Error(
      'Il RiffPack non contiene lines.'
    );
  }

  state.pack.lines =
    state.pack.lines.map((line) => {
      if (Array.isArray(line)) {
        return line;
      }

      return [
        line.speaker || 'VOCE',
        line.text || '',
        line
      ];
    });

  console.log(
    '📦 RiffPack caricato:',
    state.pack
  );

  const video = $('#clip-video');

  if (!video) {
    throw new Error(
      'Elemento #clip-video non trovato.'
    );
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

  video.setAttribute(
    'playsinline',
    ''
  );

  video.setAttribute(
    'webkit-playsinline',
    ''
  );

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  video.src = scene.video;
  video.load();

  console.log(
    '🎥 Video:',
    video.src
  );

  await waitForVideoReady(video);

  video.pause();
  video.currentTime = 0;
  video.muted = true;

  const badge =
    $('#clip-muted-badge');

  if (badge) {
    badge.textContent =
      'originale pronto · scena sincronizzata';

    badge.hidden = false;
  }

  console.log(
    '🎬 Scena pronta:',
    scene.title
  );

  return state.pack;
}

function waitForVideoReady(
  video,
  timeout = 20000
) {
  return new Promise(
    (resolve, reject) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }

      let finished = false;

      const cleanup = () => {
        clearTimeout(timer);

        video.removeEventListener(
          'loadeddata',
          onReady
        );

        video.removeEventListener(
          'canplay',
          onReady
        );

        video.removeEventListener(
          'error',
          onError
        );
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
            new Error(
              'Errore caricamento video.'
            )
          );
        });
      };

      const timer = setTimeout(() => {
        finish(() => {
          reject(
            new Error(
              'Timeout caricamento video.'
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
    }
  );
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
    $('#line-list');

  if (!container) return;

  const lines = getLines();

  container.innerHTML = lines
    .map((line, index) => {
      const speaker =
        Array.isArray(line)
          ? line[0]
          : line.speaker;

      const text =
        Array.isArray(line)
          ? line[1]
          : line.text;

      return `
        <div
          class="line-item ${
            index === state.line
              ? 'active'
              : ''
          }"
          data-line="${index}"
        >
          <span class="line-index">
            ${index + 1}
          </span>

          <div class="line-copy">
            <strong>
              ${escapeHtml(
                speaker || 'VOCE'
              )}
            </strong>

            <span>
              ${escapeHtml(
                text || ''
              )}
            </span>
          </div>
        </div>
      `;
    })
    .join('');

  container
    .querySelectorAll('.line-item')
    .forEach((item) => {
      item.addEventListener(
        'click',
        async () => {
          const index =
            Number(item.dataset.line);

          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= lines.length
          ) {
            return;
          }

          if (
            state.recordingRequest ||
            state.linePhase === 'RECORDING'
          ) {
            return;
          }

          state.line = index;
          state.localRecordingReady =
            Boolean(
              state.recordings[
                getLineKey()
              ]
            );

          updateLine();
          await playCurrentLine();
        }
      );
    });
}

function updateLine() {
  const lines = getLines();
  const line = getCurrentLine();

  if (!line) return;

  $$('.line-item').forEach(
    (item) => {
      item.classList.toggle(
        'active',
        Number(item.dataset.line) ===
          state.line
      );
    }
  );

  const speaker =
    getLineSpeaker();

  const text =
    getLineText();

  const speakerElement =
    $('#speaker-tag');

  if (speakerElement) {
    speakerElement.textContent =
      speaker;
  }

  const textElement =
    $('#line-text');

  if (textElement) {
    textElement.textContent =
      `“${text}”`;
  }

  const count =
    $('#line-count');

  if (count) {
    count.textContent =
      `${state.line + 1} / ${lines.length}`;
  }

  const recordTitle =
    $('#record-title');

  if (
    recordTitle &&
    state.sceneData?.title
  ) {
    recordTitle.textContent =
      state.sceneData.title;
  }

  const progress =
    $('.scene-progress span');

  if (progress) {
    const percentage =
      lines.length > 1
        ? (state.line /
            (lines.length - 1)) *
          100
        : 100;

    progress.style.width =
      `${percentage}%`;
  }

  updateRecordingUI();
}

function updateRecordingUI() {
  const recordButton =
    $('#record-button');

  const finishButton =
    $('#finish-recording');

  const replayButton =
    $('#replay-line');

  const micStatus =
    $('#mic-status');

  const label =
    $('#record-label');

  const hasRecording =
    Boolean(
      state.recordings[
        getLineKey()
      ]
    );

  if (recordButton) {
    recordButton.disabled =
      state.recordingRequest ||
      state.linePhase === 'REVIEW';
  }

  if (finishButton) {
    finishButton.classList.toggle(
      'hidden',
      !hasRecording
    );
  }

  if (replayButton) {
    replayButton.disabled =
      state.recordingRequest;
  }

  if (label) {
    if (
      state.linePhase === 'RECORDING'
    ) {
      label.textContent =
        'registrazione in corso…';
    } else if (hasRecording) {
      label.textContent =
        'rifai questa battuta';
    } else {
      label.textContent =
        'registra questa battuta';
    }
  }

  if (micStatus) {
    if (
      state.linePhase === 'RECORDING'
    ) {
      micStatus.textContent =
        '🎙️ registrazione in corso';
    } else if (hasRecording) {
      micStatus.textContent =
        'registrazione pronta';
    } else {
      micStatus.textContent =
        'microfono pronto';
    }
  }
}

function setPhase(phase) {
  state.linePhase =
    String(phase || 'LISTEN')
      .toUpperCase();

  updateRecordingUI();
}

async function playCurrentLine() {
  const video =
    $('#clip-video');

  if (!video) return;

  const line =
    getLineData();

  if (!line) return;

  const start =
    getLineStart();

  const end =
    getLineEnd();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    toast(
      'Tempi della frase non validi.'
    );
    return;
  }

  stopLineTimer();
  stopCurrentRecording();
  stopReviewAudio();

  state.linePhase =
    'LISTEN';

  updateRecordingUI();

  video.hidden = false;
  video.removeAttribute('hidden');

  styleClipVideo(video);

  video.muted = false;
  video.defaultMuted = false;
  video.loop = false;

  try {
    video.currentTime = start;
  } catch {}

  const stopAtEnd = () => {
    if (
      video.currentTime >=
      end - 0.05
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

  state.lineTimer = {
    cleanup: () => {
      video.removeEventListener(
        'timeupdate',
        stopAtEnd
      );
    }
  };

  try {
    await video.play();

    console.log(
      `▶️ Ascolto frase ${
        state.line + 1
      }: ${start} → ${end}`
    );
  } catch (error) {
    console.error(
      'Errore riproduzione:',
      error
    );

    stopLineTimer();

    toast(
      'Premi di nuovo la scena per ascoltarla.'
    );
  }
}

function stopLineTimer() {
  if (state.lineTimer) {
    state.lineTimer.cleanup?.();
    state.lineTimer = null;
  }

  const video =
    $('#clip-video');

  if (video) {
    video.pause();
  }
}

async function startCurrentLineRecording() {
  const video =
    $('#clip-video');

  if (!video) return;

  const line =
    getLineData();

  if (!line) return;

  const start =
    getLineStart();

  const end =
    getLineEnd();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    toast(
      'Durata frase non valida.'
    );
    return;
  }

  if (
    !navigator.mediaDevices?.getUserMedia
  ) {
    toast(
      'Il browser non supporta il microfono.'
    );
    return;
  }

  stopLineTimer();
  stopCurrentRecording();
  stopReviewAudio();

  state.linePhase =
    'RECORDING';

  state.recordingRequest =
    true;

  state.localRecordingReady =
    false;

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
  } catch {}

  let stream;

  try {
    stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true
        });
  } catch (error) {
    console.error(
      'Microfono:',
      error
    );

    state.recordingRequest =
      false;

    state.linePhase =
      'LISTEN';

    updateRecordingUI();

    toast(
      'Devi consentire l’accesso al microfono.'
    );

    return;
  }

  state.recordingStream =
    stream;

  let recorder;

  try {
    recorder =
      new MediaRecorder(stream);
  } catch (error) {
    console.error(
      'MediaRecorder:',
      error
    );

    stopRecordingStream();

    state.recordingRequest =
      false;

    state.linePhase =
      'LISTEN';

    updateRecordingUI();

    toast(
      'Il browser non supporta la registrazione audio.'
    );

    return;
  }

  state.recorder =
    recorder;

  recorder.addEventListener(
    'dataavailable',
    (event) => {
      if (event.data?.size) {
        state.chunks.push(
          event.data
        );
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
      video.currentTime >=
      end - 0.05
    ) {
      video.pause();
      video.currentTime = start;

      video.removeEventListener(
        'timeupdate',
        stopAtEnd
      );

      if (
        recorder.state !==
        'inactive'
      ) {
        recorder.stop();
      }
    }
  };

  video.addEventListener(
    'timeupdate',
    stopAtEnd
  );

  try {
    recorder.start();

    await video.play();

    console.log(
      `🎙️ REC frase ${
        state.line + 1
      }: ${start} → ${end}`
    );
  } catch (error) {
    console.error(
      'Errore registrazione:',
      error
    );

    video.removeEventListener(
      'timeupdate',
      stopAtEnd
    );

    if (
      recorder.state !==
      'inactive'
    ) {
      recorder.stop();
    }

    stopRecordingStream();

    state.recordingRequest =
      false;

    state.linePhase =
      'LISTEN';

    updateRecordingUI();

    toast(
      'Impossibile avviare la registrazione.'
    );
  }
}

function finishCurrentRecording() {
  const key =
    getLineKey();

  if (!state.chunks.length) {
    state.recordingRequest =
      false;

    state.linePhase =
      'LISTEN';

    stopRecordingStream();
    updateRecordingUI();

    return;
  }

  const mimeType =
    state.chunks[0]?.type ||
    'audio/webm';

  const blob =
    new Blob(
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

  const url =
    URL.createObjectURL(blob);

  state.recordings[key] = {
    blob,
    url,
    take: state.take,
    line: state.line,
    duration:
      getLineDuration()
  };

  state.currentRecordingUrl =
    url;

  state.localRecordingReady =
    true;

  state.recordingRequest =
    false;

  state.linePhase =
    'REVIEW';

  state.recorder = null;

  stopRecordingStream();

  const video =
    $('#clip-video');

  if (video) {
    video.pause();
    video.muted = true;
    video.defaultMuted = true;

    try {
      video.currentTime =
        getLineStart();
    } catch {}
  }

  updateRecordingUI();

  toast(
    'Registrazione completata.'
  );
}

function stopRecordingStream() {
  if (!state.recordingStream) {
    return;
  }

  state.recordingStream
    .getTracks()
    .forEach(
      (track) => track.stop()
    );

  state.recordingStream =
    null;
}

function stopCurrentRecording() {
  stopLineTimer();

  const recorder =
    state.recorder;

  if (
    recorder &&
    recorder.state !==
      'inactive'
  ) {
    try {
      recorder.stop();
    } catch {}
  }

  state.recorder =
    null;

  state.recordingRequest =
    false;

  stopRecordingStream();
}

async function playCurrentRecording() {
  const recording =
    state.recordings[
      getLineKey()
    ];

  if (!recording?.url) {
    toast(
      'Non hai ancora registrato questa frase.'
    );
    return;
  }

  stopLineTimer();
  stopReviewAudio();

  const video =
    $('#clip-video');

  if (video) {
    video.pause();
    video.muted = true;
  }

  const audio =
    new Audio(recording.url);

  state.reviewAudio =
    audio;

  audio.addEventListener(
    'ended',
    () => {
      if (
        state.reviewAudio ===
        audio
      ) {
        state.reviewAudio =
          null;
      }
    },
    { once: true }
  );

  try {
    await audio.play();

    console.log(
      '▶️ Riascolto registrazione'
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
  if (!state.reviewAudio) {
    return;
  }

  state.reviewAudio.pause();
  state.reviewAudio.currentTime =
    0;

  state.reviewAudio =
    null;
}

function redoCurrentRecording() {
  stopReviewAudio();

  const key =
    getLineKey();

  const recording =
    state.recordings[key];

  if (recording?.url) {
    URL.revokeObjectURL(
      recording.url
    );
  }

  delete state.recordings[key];

  state.take += 1;

  state.localRecordingReady =
    false;

  state.linePhase =
    'LISTEN';

  updateLine();

  startCurrentLineRecording();
}

async function goToNextLine() {
  const currentKey =
    getLineKey();

  const recording =
    state.recordings[
      currentKey
    ];

  if (!recording) {
    toast(
      'Registra la frase prima di andare avanti.'
    );
    return;
  }

  stopReviewAudio();
  stopLineTimer();

  const lines =
    getLines();

  if (
    state.line >=
    lines.length - 1
  ) {
    finishRound();
    return;
  }

  state.line += 1;
  state.take = 1;

  state.localRecordingReady =
    false;

  state.linePhase =
    'LISTEN';

  renderLines();
  updateLine();

  await playCurrentLine();
}

function finishRound() {
  stopLineTimer();
  stopReviewAudio();
  stopCurrentRecording();
  stopTimer();

  const video =
    $('#clip-video');

  if (video) {
    video.pause();
    video.muted = true;
    video.defaultMuted = true;
  }

  state.linePhase =
    'DONE';

  updateRecordingUI();

  if (
    state.connected &&
    socket?.readyState ===
      WebSocket.OPEN
  ) {
    send('SET_PHASE', {
      phase: 'PLAYBACK'
    });
  }

  go('playback');
}

function handleResults(data) {
  console.log(
    '🏆 RISULTATI:',
    data
  );

  const ranking =
    Array.isArray(data.ranking)
      ? data.ranking
      : [];

  if (!ranking.length) {
    return;
  }

  const winner =
    $('#winner-name');

  if (winner) {
    winner.textContent =
      ranking[0]?.name ||
      'Vincitore';
  }

  const subtitle =
    $('#result-subtitle');

  if (subtitle) {
    subtitle.textContent =
      `${ranking[0]?.name || 'Il vincitore'} ha ricevuto ${
        ranking[0]?.votes || 0
      } voti.`;
  }

  go('results');
}

function startTimer() {
  stopTimer();

  state.seconds =
    Number(
      state.sceneData?.duration
    ) > 0
      ? Math.ceil(
          Number(
            state.sceneData.duration
          )
        )
      : 60;

  updateTimer();

  state.timer =
    setInterval(() => {
      state.seconds -= 1;

      updateTimer();

      if (
        state.seconds <= 0
      ) {
        stopTimer();

        if (
          state.linePhase ===
          'RECORDING'
        ) {
          stopCurrentRecording();
        }
      }
    }, 1000);
}

function stopTimer() {
  if (!state.timer) {
    return;
  }

  clearInterval(
    state.timer
  );

  state.timer =
    null;
}

function updateTimer() {
  const element =
    $('#round-timer');

  if (!element) return;

  const minutes =
    Math.floor(
      state.seconds / 60
    );

  const seconds =
    state.seconds % 60;

  element.textContent =
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function createRoom() {
  const input =
    $('#host-name');

  const name =
    input?.value?.trim() ||
    'Host';

  const ws =
    await waitForSocketOpen();

  ws.send(
    JSON.stringify({
      type: 'CREATE_ROOM',
      name,
      scene:
        state.scene ||
        'generale-hartman',
      mode:
        state.mode
    })
  );

  console.log(
    '➡️ CREATE_ROOM',
    {
      name,
      scene: state.scene,
      mode: state.mode
    }
  );
}

async function joinRoom() {
  const nameInput =
    $('#join-name');

  const codeInput =
    $('#room-code');

  const name =
    nameInput?.value?.trim() ||
    'Giocatore';

  const roomCode =
    codeInput?.value
      ?.trim()
      .toUpperCase();

  if (!roomCode) {
    toast(
      'Inserisci il codice della stanza.'
    );

    codeInput?.focus();
    return;
  }

  if (
    roomCode
      .replace(/[^A-Z0-9]/g, '')
      .length !== 6
  ) {
    toast(
      'Il codice stanza non è valido.'
    );

    codeInput?.focus();
    return;
  }

  const ws =
    await waitForSocketOpen();

  ws.send(
    JSON.stringify({
      type: 'JOIN_ROOM',
      roomCode,
      name
    })
  );

  console.log(
    '➡️ JOIN_ROOM',
    {
      roomCode,
      name
    }
  );
}

function startRound() {
  if (!isHost()) {
    toast(
      'Solo l’host può iniziare il round.'
    );
    return;
  }

  if (
    !socket ||
    socket.readyState !==
      WebSocket.OPEN
  ) {
    toast(
      'Connessione al server non pronta.'
    );
    return;
  }

  send('START_ROUND');
}

function setupNavigation() {
  $('#create-room')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      createRoom().catch(
        console.error
      );
    }
  );

  $('#join-room')?.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      joinRoom().catch(
        console.error
      );
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

      if (!state.room) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          state.room
        );

        toast(
          'Codice copiato.'
        );
      } catch {
        toast(
          `Codice stanza: ${state.room}`
        );
      }
    }
  );

  $$('[data-go]').forEach(
    (button) => {
      button.addEventListener(
        'click',
        (event) => {
          event.preventDefault();

          const target =
            button.dataset.go;

          if (target) {
            go(target);
          }
        }
      );
    }
  );

  $$('.mode-option').forEach(
    (button) => {
      button.addEventListener(
        'click',
        () => {
          const mode =
            button.dataset.mode;

          if (!mode) return;

          state.mode =
            mode;

          updateModeUI();

          if (
            state.room &&
            isHost() &&
            socket?.readyState ===
              WebSocket.OPEN
          ) {
            send(
              'SET_MODE',
              { mode }
            );
          }
        }
      );
    }
  );

  $('#record-button')?.addEventListener(
    'click',
    async () => {
      if (
        state.linePhase ===
        'REVIEW'
      ) {
        redoCurrentRecording();
        return;
      }

      await startCurrentLineRecording();
    }
  );

  $('#finish-recording')?.addEventListener(
    'click',
    async () => {
      await goToNextLine();
    }
  );

  $('#replay-line')?.addEventListener(
    'click',
    async () => {
      await playCurrentLine();
    }
  );

  $('#play-again')?.addEventListener(
    'click',
    () => {
      if (state.room && isHost()) {
        send('SET_PHASE', {
          phase: 'LISTEN'
        });
      }

      state.line = 0;
      state.take = 1;
      state.recordings = {};
      state.localRecordingReady =
        false;

      go('record');

      loadSharedScene()
        .then(() => {
          renderLines();
          updateLine();
          startTimer();
          playCurrentLine();
        })
        .catch((error) => {
          console.error(
            error
          );
          toast(
            'Impossibile ricaricare la scena.'
          );
        });
    }
  );
}

function setupVideoEvents() {
  const video =
    $('#clip-video');

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
        '🖼️ Primo frame disponibile'
      );
    }
  );

  video.addEventListener(
    'canplay',
    () => {
      console.log(
        '▶️ Video pronto'
      );
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

      const target =
        event.target;

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement
      ) {
        return;
      }

      if (
        state.linePhase ===
        'LISTEN'
      ) {
        await startCurrentLineRecording();
      } else if (
        state.linePhase ===
        'REVIEW'
      ) {
        await goToNextLine();
      }
    }
  );
}

function cleanupRecordings() {
  Object.values(
    state.recordings
  ).forEach(
    (recording) => {
      if (recording?.url) {
        URL.revokeObjectURL(
          recording.url
        );
      }
    }
  );

  state.recordings = {};
}

function initializeApp() {
  setupNavigation();
  setupVideoEvents();
  setupKeyboard();

  renderSceneLibrary();
  updateModeUI();

  connect();

  console.log(
    '🎬 RiffRoom app avviata'
  );
}

if (
  document.readyState ===
  'loading'
) {
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