const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = {
  screen: 'home',
  mode: 'parallel',
  scene: 'plan',
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
  chunks: [],
  timer: null,
  seconds: 60,
  effect: 'normale',
  pack: null,
  localRecordingReady: false
};
const SERVER_URL =
  location.hostname === 'localhost'
    ? 'ws://localhost:10000'
    : 'wss://riffroomserver.onrender.com';

let socket = null;

function connectSocket() {
  socket = new WebSocket(SERVER_URL);

  socket.addEventListener('open', () => {
    state.connected = true;
    console.log('🟢 Connesso al server');
    updateConnectionStatus();
  });

  socket.addEventListener('close', () => {
    state.connected = false;
    updateConnectionStatus();
    console.log('🔴 Connessione chiusa');
  });

  socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerMessage(data);
    } catch (error) {
      console.error('Messaggio server non valido:', error);
    }
  });
}

function send(type, data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    toast('Connessione al server non disponibile');
    return;
  }

  socket.send(JSON.stringify({
    type,
    ...data
  }));
}

function updateConnectionStatus() {
  const dot = document.querySelector('.status-dot');
  const label = document.querySelector('.status-text');

  if (dot) {
    dot.style.background = state.connected ? '#6ee7a8' : '#ff6b6b';
  }

  if (label) {
    label.textContent = state.connected
      ? 'online'
      : 'disconnesso';
  }
}
function syncLobbyControls() {
  const isHost = state.playerId === state.hostId;

  const startButton = $('#start-round');

  if (startButton) {
    startButton.disabled = !isHost;
    startButton.textContent = isHost
      ? 'Inizia partita'
      : 'In attesa dell’host…';
  }
}
function handleServerMessage(data) {
  console.log('📨 SERVER:', data);

  switch (data.type) {
    case 'CONNECTED':
      console.log('Server WebSocket pronto');
      break;

    case 'ROOM_CREATED':
      handleRoomCreated(data);
      break;

    case 'ROOM_JOINED':
      handleRoomJoined(data);
      break;

    case 'ROOM_STATE':
      handleRoomState(data);
      break;

    case 'GAME_STARTED':
      handleGameStarted(data);
      break;

    case 'ERROR':
      toast(data.message || 'Errore del server');
      console.error('Server error:', data);
      break;

    default:
      console.log('Evento server non gestito:', data.type);
  }
}
function handleRoomCreated(data) {
  state.room = data.roomCode;
  state.playerId = data.playerId;
  state.hostId = data.hostId;

  $('#room-code-label').textContent = data.roomCode;

  renderPlayers();
  go('lobby');
}

function handleRoomJoined(data) {
  state.room = data.roomCode;
  state.playerId = data.playerId;
  state.hostId = data.hostId;

  $('#room-code-label').textContent = data.roomCode;

  renderPlayers();
  go('lobby');
}

function handleRoomState(data) {
  if (data.roomCode) {
    state.room = data.roomCode;
  }

  if (data.hostId) {
    state.hostId = data.hostId;
  }

  if (Array.isArray(data.players)) {
    state.players = data.players;
  }

  if (data.mode) {
    state.mode = data.mode;
  }

  if (data.scene) {
    state.scene = data.scene;
  }

  if (data.phase) {
    state.phase = data.phase;
  }

  $('#room-code-label').textContent = state.room;

  renderPlayers();
}

connectSocket();

let lines = [
  ['MILO', '“Ok, ascoltami bene. Ho un piano.”'],
  ['DOT', '“Dimmi che non c’entra un secchio.”'],
  ['MILO', '“Tecnicamente… c’entrano due secchi.”']
];

function go(screen) { $$('.screen').forEach((el) => el.classList.toggle('screen-active', el.dataset.screen === screen)); state.screen = screen; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2300); }
function setSelected(selector, attr, value) { $$(selector).forEach((el) => el.classList.toggle('selected', el.dataset[attr] === value)); }
function renderPlayers() {
  const container =
    $('#players-list') ||
    $('.players-list') ||
    document.querySelector('[data-players]');

  if (!container) {
    console.warn('Container giocatori non trovato');
    return;
  }

  container.innerHTML = '';

  state.players.forEach(player => {
    const card = document.createElement('div');

    card.className = 'player-card';

    if (player.id === state.playerId) {
      card.classList.add('player-me');
    }

    card.innerHTML = `
      <div
        class="player-avatar"
        style="background:${player.color || '#ffd45c'}"
      >
        ${player.emoji || '🎤'}
      </div>

      <div class="player-info">
        <strong>${escapeHtml(player.name)}</strong>
        ${player.host ? '<span class="player-host">HOST</span>' : ''}
      </div>

      <div class="player-status">
        <span class="status-dot-small ${
          player.connected ? 'online' : 'offline'
        }"></span>
      </div>
    `;

    container.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function renderLines() { $('#line-list').innerHTML = lines.map((l, i) => `<button class="line-item ${i === state.line ? 'active' : ''} ${state.recordings[i] ? 'done' : ''}" data-line="${i}"><span class="line-number">${state.recordings[i] ? '✓' : `0${i + 1}`}</span><span>${l[1]}</span></button>`).join(''); $$('.line-item').forEach((el) => el.addEventListener('click', () => { state.line = Number(el.dataset.line); renderLines(); updateLine(); })); $('#line-count').textContent = `${state.line + 1} / ${lines.length}`; }
function updateLine() { $('#speaker-tag').textContent = lines[state.line][0]; $('#line-text').textContent = lines[state.line][1]; $('#meter-label').textContent = state.recordings[state.line] ? 'registrata' : '—'; if ($('#waveform')) renderWaveform(); }
function startTimer() { clearInterval(state.timer); state.seconds = 60; $('#round-timer').textContent = '01:00'; state.timer = setInterval(() => { state.seconds--; const m = String(Math.floor(state.seconds / 60)).padStart(2, '0'); const s = String(state.seconds % 60).padStart(2, '0'); $('#round-timer').textContent = `${m}:${s}`; if (state.seconds <= 0) { clearInterval(state.timer); toast('Tempo scaduto: si va al playback!'); finishRecording(); } }, 1000); }
function renderVotes() { const names = state.players.map((p) => p.name); if (!names.includes('PixelPazzo')) names.push('PixelPazzo'); $('#vote-options').innerHTML = names.map((n, i) => `<label class="vote-option ${i === 0 ? 'selected' : ''}"><input type="radio" name="vote" value="${n}" ${i === 0 ? 'checked' : ''}/><span>${n}${i === 0 ? ' · la tua versione' : ''}</span></label>`).join(''); $$('.vote-option').forEach((el) => el.addEventListener('click', () => { $$('.vote-option').forEach((v) => v.classList.remove('selected')); el.classList.add('selected'); })); $('#take-total').textContent = Math.max(state.players.length, 3); }

$$('[data-go]').forEach((el) => el.addEventListener('click', () => go(el.dataset.go)));
$$('.mode-option').forEach((el) => el.addEventListener('click', () => { state.mode = el.dataset.mode; setSelected('.mode-option', 'mode', state.mode); }));
$$('.scene-option').forEach((el) => el.addEventListener('click', () => { state.scene = el.dataset.scene; setSelected('.scene-option', 'scene', state.scene); }));
$('#create-room').addEventListener('click', () => {
  const name = $('#host-name').value.trim() || 'Host';

  send('CREATE_ROOM', {
    name,
    mode: state.mode,
    scene: state.scene
  });
});
$('#copy-code').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.room); } catch {} toast(`Codice ${state.room} copiato!`); });
$('#join-room').addEventListener('click', () => {
  const name = $('#join-name').value.trim() || 'Voce Misteriosa';
  const roomCode = $('#room-code').value.trim().toUpperCase();

  if (!roomCode) {
    toast('Inserisci il codice della stanza');
    return;
  }

  send('JOIN_ROOM', {
    name,
    roomCode
  });
});
$('#start-round').addEventListener('click', () => {
  if (state.playerId !== state.hostId) {
    toast('Solo l’host può iniziare la partita');
    return;
  }

  send('START_ROUND');
});

async function beginRecording() {
  if (state.recorder || state.recordingRequest) return;
  state.recordingRequest = true; state.chunks = [];
  $('#record-button').classList.add('recording'); $('#record-label').textContent = 'registrando… clicca per fermare'; $('#mic-status').textContent = 'richiesta microfono…';
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    state.recordingRequest = false; state.recorder = { simulated: true }; $('#mic-status').textContent = 'microfono non disponibile'; return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordingRequest = false; state.recorder = new MediaRecorder(stream);
    state.recorder.ondataavailable = (event) => { if (event.data.size) state.chunks.push(event.data); };
    state.recorder.onstop = () => { state.recordings[state.line] = URL.createObjectURL(new Blob(state.chunks, { type: state.recorder.mimeType || 'audio/webm' })); stream.getTracks().forEach((track) => track.stop()); state.recorder = null; afterLine(); };
    state.recorder.start(); $('#mic-status').textContent = 'microfono attivo · parla';
  } catch (error) {
    state.recordingRequest = false; state.recorder = null; $('#record-button').classList.remove('recording'); $('#record-label').textContent = 'microfono bloccato'; $('#mic-status').textContent = 'permesso microfono negato'; toast('Consenti il microfono al browser e riprova.');
  }
}
function stopRecording() { if (state.recordingRequest) { toast('Attendi il permesso microfono, poi clicca di nuovo per fermare.'); return; } if (!state.recorder) return; $('#record-button').classList.remove('recording'); $('#record-label').textContent = 'clicca per registrare'; $('#mic-status').textContent = 'microfono pronto'; if (state.recorder.stop && !state.recorder.simulated) state.recorder.stop(); else { state.recorder = null; state.recordings[state.line] = true; afterLine(); } }
function afterLine() { renderLines(); updateLine(); if (state.line < lines.length - 1) { state.line++; renderLines(); updateLine(); toast('Take salvata · prossima battuta'); } else { $('#finish-recording').classList.remove('hidden'); toast('Tutte le battute sono pronte!'); } }
$('#record-button').addEventListener('click', () => { if (state.recorder && !state.recordingRequest) stopRecording(); else beginRecording(); }); $('#finish-recording').addEventListener('click', finishRecording);
function finishRecording() { clearInterval(state.timer); renderVotes(); $('#take-index').textContent = '1'; $('#playback-badge').textContent = `LA TAKE DI ${state.players[0].name.toUpperCase()}`; $('#winner-name').textContent = state.players[0].name; go('playback'); }
$('#effect-button').addEventListener('click', () => { const effects = ['normale', 'eco', 'robot', 'mostro']; state.effect = effects[(effects.indexOf(state.effect) + 1) % effects.length]; $('#effect-button').textContent = `✨ effetto: ${state.effect}`; toast(`Effetto ${state.effect} selezionato per la battuta`); });
$('#replay-line').addEventListener('click', () => toast('La scena riparte… immagina il silenzio drammatico.'));
$('#play-take').addEventListener('click', () => { $('#play-take').textContent = 'Ⅱ'; $('#playback-stage').classList.add('is-playing'); let progress = 0; const timer = setInterval(() => { progress += 4; $('#track-fill').style.width = `${progress}%`; $('#play-time').textContent = `00:${String(Math.floor(progress / 3.6)).padStart(2, '0')}`; if (progress >= 100) { clearInterval(timer); $('#play-take').textContent = '▶'; $('#playback-stage').classList.remove('is-playing'); } }, 120); });
$('#next-take').addEventListener('click', () => { state.take++; if (state.take > Math.max(state.players.length, 3)) { state.take = 1; } $('#take-index').textContent = state.take; $('#playback-badge').textContent = state.take === 1 ? `LA TAKE DI ${state.players[0].name.toUpperCase()}` : `LA TAKE DI ${state.players[state.take - 1]?.name?.toUpperCase() || 'PIXELPAZZO'}`; $('#track-fill').style.width = '0%'; });
$('#submit-vote').addEventListener('click', () => { toast('Voto registrato!'); setTimeout(() => go('results'), 500); }); $('#play-again').addEventListener('click', () => { state.take = 1; state.line = 0; state.recordings = {}; renderLines(); updateLine(); startTimer(); go('record'); });
renderPlayers(); renderLines(); updateLine();

// Clip locali: il browser tiene il file nel dispositivo dell'utente. La traccia originale viene silenziata durante il doppiaggio.
let localClipUrl = null;
$('#clip-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('video/')) return;
  if (localClipUrl) URL.revokeObjectURL(localClipUrl);
  localClipUrl = URL.createObjectURL(file);
  $('#clip-video').src = localClipUrl;
  $('#clip-video').muted = true;
  styleClipVideo($('#clip-video'));
  $('#clip-muted-badge').hidden = false;
  toast(`${file.name} pronto: voce originale silenziata`);
});
$('#start-round').addEventListener('click', () => {
  if (!localClipUrl) return;
  const video = $('#clip-video');
  video.hidden = false;
  video.currentTime = 0;
  video.play().catch(() => {});
});

// RiffPack: manifest JSON con media, battute, timecode e waveform di riferimento.
$('#clip-input').accept = 'video/*,.json,.riffpack,.riffpack.json';
const phaseStyle = document.createElement('style');
phaseStyle.textContent = '.phase-card{margin:0 0 16px;padding:13px;border:1px solid #eadfda;border-radius:11px;background:#fff8f2}.phase-card strong,.phase-card small{display:block}.phase-card strong{font-size:13px}.phase-card small{color:#766c89;font-size:10px;margin:3px 0 10px}.phase-actions{display:flex;gap:7px}.phase-actions button{flex:1;border:1px solid #211b3d;border-radius:8px;padding:9px 6px;background:#fff;color:#211b3d;font:800 10px Nunito;cursor:pointer}.phase-actions button.active{background:#ff6e63;color:#fff}.record-button:disabled{opacity:.4;cursor:not-allowed}#waveform{height:27px;display:flex;align-items:center;gap:2px;margin:9px 0 12px;padding:0 2px}#waveform i{display:block;flex:1;min-width:2px;background:#ff9f91;border-radius:3px;opacity:.85}';
document.head.appendChild(phaseStyle);
const phaseCard = document.createElement('div');
phaseCard.className = 'phase-card';
phaseCard.innerHTML = '<strong id="phase-title">prima ascolta la scena originale</strong><small id="phase-help">Ascolta il ritmo, le pause e l’intenzione della battuta.</small><div id="waveform" aria-label="waveform della voce originale"></div><div class="phase-actions"><button id="listen-original">▶ ascolta originale</button><button id="enter-recording" disabled>vai alla rec →</button></div>';
$('.record-panel').insertBefore(phaseCard, $('#line-list'));
const clipVideo = $('#clip-video');
const recordButton = $('#record-button');
function styleClipVideo(video) { video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1;display:block'; }
$('#record-label').textContent = 'clicca per registrare';
function setPhase(phase) {
  state.phase = phase;
  const listening = phase === 'listen';
  $('#phase-title').textContent = listening ? 'prima ascolta la scena originale' : 'ora sostituisci le voci';
  $('#phase-help').textContent = listening ? 'Ascolta il ritmo, le pause e l’intenzione della battuta.' : 'Il video è muto: premi e parla seguendo la battuta e la waveform.';
  $('#listen-original').classList.toggle('active', listening);
  $('#enter-recording').disabled = listening;
  recordButton.disabled = listening;
}
function renderWaveform() {
  const values = lines[state.line]?.[2]?.waveform || [0.18, 0.35, 0.52, 0.68, 0.4, 0.75, 0.3, 0.58, 0.42, 0.22, 0.62, 0.34, 0.7, 0.4, 0.24, 0.5];
  $('#waveform').innerHTML = values.map((value) => `<i style="height:${Math.max(12, Math.round(value * 100))}%"></i>`).join('');
}
$('#listen-original').addEventListener('click', () => {
  if (!localClipUrl) { $('#enter-recording').disabled = false; toast('Nessuna clip caricata: scena demo pronta, puoi passare alla rec.'); return; }
  clipVideo.hidden = false; clipVideo.muted = false; clipVideo.currentTime = 0; clipVideo.play().catch(() => {});
  $('#mic-status').textContent = 'stai ascoltando la voce originale';
  $('#enter-recording').disabled = false;
  toast('Scena originale in riproduzione');
});
$('#enter-recording').addEventListener('click', () => {
  if (localClipUrl) { clipVideo.pause(); clipVideo.muted = true; clipVideo.currentTime = 0; clipVideo.play().catch(() => {}); }
  setPhase('record'); startTimer(); $('#mic-status').textContent = 'video muto · microfono pronto'; toast('Ora registra seguendo la scena');
});
async function makeDemoClip() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360; const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(24); const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); let frame = 0; let raf;
  const draw = () => { frame += 1; ctx.fillStyle = '#9edcf0'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#e3ba76'; ctx.fillRect(0, 245, 640, 115); ctx.fillStyle = '#ffd45c'; ctx.beginPath(); ctx.arc(520, 75, 55, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#56bde9'; ctx.fillRect(185 + Math.sin(frame / 10) * 4, 125, 95, 120); ctx.fillStyle = '#ff6e63'; ctx.fillRect(350 - Math.sin(frame / 10) * 4, 142, 95, 103); ctx.fillStyle = '#211b3d'; ctx.font = '800 25px Nunito'; ctx.fillText('RIFFPACK DEMO', 24, 42); if (frame < 72) raf = requestAnimationFrame(draw); else recorder.stop(); };
  return new Promise((resolve) => { recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((track) => track.stop()); resolve(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))); }; recorder.start(); draw(); });
}
const originalClipHandler = $('#clip-input').onchange;
$('#clip-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file || !file.name.match(/\.(json|riffpack)$/i)) return;
  try {
    const pack = JSON.parse(await file.text());
    if (pack.format !== 'riffpack') throw new Error('Formato non valido');
    state.pack = pack;
    if (Array.isArray(pack.lines) && pack.lines.length) lines = pack.lines.map((line) => [line.speaker || 'VOCE', line.text || '', line]);
    const resolveMedia = (value) => value?.startsWith('data:') ? value : new URL(value, document.baseURI).href;
    if (pack.originalVideo) {
      const candidateUrl = resolveMedia(pack.originalVideo);
      try { const response = await fetch(candidateUrl, { method: 'HEAD' }); localClipUrl = response.ok ? candidateUrl : await makeDemoClip(); } catch { localClipUrl = await makeDemoClip(); }
      if (localClipUrl) { styleClipVideo(clipVideo); clipVideo.src = localClipUrl; clipVideo.muted = true; clipVideo.hidden = false; }
    } else {
      localClipUrl = await makeDemoClip();
      if (localClipUrl) { styleClipVideo(clipVideo); clipVideo.src = localClipUrl; clipVideo.muted = true; clipVideo.hidden = false; }
    }
    state.silentClipUrl = pack.silentVideo ? resolveMedia(pack.silentVideo) : null;
    renderLines(); updateLine(); renderWaveform();
    $('#record-title').textContent = pack.title || 'Scena dal pack';
    toast(`Pack “${pack.title || file.name}” caricato${localClipUrl ? '' : ' · aggiungi i video del pack'}`);
  } catch (error) { toast(`Pack non valido: ${error.message}`); }
});
const oldStartRound = $('#start-round');
oldStartRound.addEventListener('click', () => {
  clearInterval(state.timer); $('#round-timer').textContent = '01:00'; setPhase('listen');
  if (localClipUrl) { clipVideo.hidden = false; clipVideo.muted = true; clipVideo.currentTime = 0; clipVideo.play().catch(() => {}); }
});
function playRecordedDubs() {
  const urls = Object.values(state.recordings).filter((url) => typeof url === 'string' && url.startsWith('blob:'));
  if (!urls.length) return;
  let index = 0;
  const playNext = () => { if (index >= urls.length) return; const audio = new Audio(urls[index++]); audio.onended = playNext; audio.play().catch(() => {}); };
  playNext();
}
$('#play-take').addEventListener('click', playRecordedDubs);
$('#enter-recording').addEventListener('click', () => {
  if (!state.silentClipUrl) return;
  clipVideo.pause(); clipVideo.src = state.silentClipUrl; clipVideo.muted = false; clipVideo.currentTime = 0; clipVideo.play().catch(() => {});
});
renderWaveform();
