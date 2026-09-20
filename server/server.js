import http from 'http';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 6;

const rooms = new Map();
const clients = new Map();

const emojis = ['🦊', '🐙', '🐸', '🐼', '🐵', '🐯'];
const colors = ['#ffd45c', '#bba7ff', '#a9e4bb', '#ff9f9f', '#7dd3fc', '#f9a8d4'];

function generateId() {
  return crypto.randomUUID();
}

function normalizeRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateRoomCode() {
  let code;

  do {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const raw = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    );

    code = `${raw.slice(0, 3).join('')}-${raw.slice(3).join('')}`;
  } while (rooms.has(code));

  return code;
}

function findRoomByCode(value) {
  const normalized = normalizeRoomCode(value);

  for (const [code, room] of rooms) {
    if (normalizeRoomCode(code) === normalized) {
      return room;
    }
  }

  return null;
}

function send(ws, type, data = {}) {
  if (!ws || ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    type,
    ...data
  }));
}

function broadcast(room, type, data = {}) {
  for (const player of room.players) {
    send(player.ws, type, data);
  }
}

function serializeRoom(room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    mode: room.mode,
    scene: room.scene,
    phase: room.phase,
    players: room.players.map(player => ({
      id: player.id,
      name: player.name,
      emoji: player.emoji,
      color: player.color,
      host: player.id === room.hostId,
      connected: player.ws.readyState === 1
    }))
  };
}

function broadcastRoomState(room) {
  broadcast(room, 'ROOM_STATE', serializeRoom(room));
}

function getRoomForSocket(ws) {
  const client = clients.get(ws);

  if (!client?.roomCode) {
    return null;
  }

  return rooms.get(client.roomCode) || null;
}

function getPlayerForSocket(ws) {
  const client = clients.get(ws);

  if (!client) {
    return null;
  }

  const room = rooms.get(client.roomCode);

  if (!room) {
    return null;
  }

  return room.players.find(player => player.id === client.playerId) || null;
}

function isHost(ws, room) {
  const player = getPlayerForSocket(ws);
  return !!player && player.id === room.hostId;
}

function createPlayer(name, ws) {
  return {
    id: generateId(),
    name: String(name || 'Giocatore').trim().slice(0, 30) || 'Giocatore',
    emoji: emojis[0],
    color: colors[0],
    ws,
    recordings: {},
    votes: {}
  };
}

function handleCreateRoom(ws, data) {
  if (clients.has(ws)) {
    send(ws, 'ERROR', {
      message: 'Questo client è già associato a una stanza.'
    });
    return;
  }

  const name = String(data.name || 'Host').trim() || 'Host';
  const code = generateRoomCode();

  const player = createPlayer(name, ws);

  const room = {
    code,
    hostId: player.id,
    mode: data.mode === 'roles' ? 'roles' : 'parallel',
    scene: String(data.scene || 'plan'),
    phase: 'LOBBY',
    players: [player],
    createdAt: Date.now()
  };

  rooms.set(code, room);

  clients.set(ws, {
    roomCode: code,
    playerId: player.id
  });

  send(ws, 'ROOM_CREATED', {
    roomCode: code,
    playerId: player.id,
    hostId: player.id
  });

  broadcastRoomState(room);

  console.log(`Room created: ${code} by ${name}`);
}

function handleJoinRoom(ws, data) {
  if (clients.has(ws)) {
    send(ws, 'ERROR', {
      message: 'Questo client è già associato a una stanza.'
    });
    return;
  }

  const requestedCode = String(data.roomCode || '');
  const normalizedCode = normalizeRoomCode(requestedCode);
  const name = String(data.name || 'Giocatore').trim() || 'Giocatore';

  console.log(
    `Join request: "${requestedCode}" -> "${normalizedCode}". Rooms:`,
    [...rooms.keys()]
  );

  const room = findRoomByCode(normalizedCode);

  if (!room) {
    send(ws, 'ERROR', {
      message: `Stanza non trovata. Codice ricevuto: ${requestedCode || '(vuoto)'}`
    });

    console.log(
      `Join failed: "${requestedCode}" -> "${normalizedCode}" does not match any room`
    );

    return;
  }

  if (room.phase !== 'LOBBY') {
    send(ws, 'ERROR', {
      message: 'La partita è già iniziata.'
    });
    return;
  }

  if (room.players.length >= MAX_PLAYERS) {
    send(ws, 'ERROR', {
      message: 'La stanza è piena.'
    });
    return;
  }

  const player = createPlayer(name, ws);

  const index = room.players.length;
  player.emoji = emojis[index % emojis.length];
  player.color = colors[index % colors.length];

  room.players.push(player);

  clients.set(ws, {
    roomCode: room.code,
    playerId: player.id
  });

  send(ws, 'ROOM_JOINED', {
    roomCode: room.code,
    playerId: player.id,
    hostId: room.hostId
  });

  broadcastRoomState(room);

  console.log(`${name} joined ${room.code}`);
}

function handleSetMode(ws, data) {
  const room = getRoomForSocket(ws);

  if (!room || !isHost(ws, room)) {
    return;
  }

  if (room.phase !== 'LOBBY') {
    return;
  }

  room.mode = data.mode === 'roles' ? 'roles' : 'parallel';

  broadcastRoomState(room);
}

function handleSetScene(ws, data) {
  const room = getRoomForSocket(ws);

  if (!room || !isHost(ws, room)) {
    return;
  }

  if (room.phase !== 'LOBBY') {
    return;
  }

  room.scene = String(data.scene || 'plan');

  broadcastRoomState(room);
}

function handleStartRound(ws) {
  const room = getRoomForSocket(ws);

  if (!room || !isHost(ws, room)) {
    return;
  }

  if (room.phase !== 'LOBBY') {
    return;
  }

  room.phase = 'LISTEN';
  room.startedAt = Date.now();

  room.players.forEach(player => {
    player.recordings = {};
    player.votes = {};
  });

  broadcast(room, 'GAME_STARTED', {
    roomCode: room.code,
    mode: room.mode,
    scene: room.scene,
    phase: room.phase,
    startedAt: room.startedAt
  });

  broadcastRoomState(room);

  console.log(`Game started: ${room.code}`);
}

function handlePhaseChange(ws, data) {
  const room = getRoomForSocket(ws);

  if (!room || !isHost(ws, room)) {
    return;
  }

  const allowed = [
    'LISTEN',
    'RECORDING',
    'PLAYBACK',
    'VOTING',
    'RESULTS'
  ];

  if (!allowed.includes(data.phase)) {
    return;
  }

  room.phase = data.phase;

  broadcast(room, 'PHASE_CHANGED', {
    phase: room.phase
  });

  broadcastRoomState(room);
}

function handleVote(ws, data) {
  const room = getRoomForSocket(ws);
  const player = getPlayerForSocket(ws);

  if (!room || !player) {
    return;
  }

  if (room.phase !== 'VOTING') {
    return;
  }

  const votedFor = String(data.votedFor || '');

  const target = room.players.find(p => p.id === votedFor);

  if (!target) {
    send(ws, 'ERROR', {
      message: 'Giocatore non valido.'
    });
    return;
  }

  player.votes = {
    votedFor
  };

  const results = {};

  for (const p of room.players) {
    results[p.id] = 0;
  }

  for (const p of room.players) {
    if (
      p.votes?.votedFor &&
      results[p.votes.votedFor] !== undefined
    ) {
      results[p.votes.votedFor]++;
    }
  }

  broadcast(room, 'VOTE_UPDATE', {
    results
  });

  const allVoted = room.players.every(
    p => p.votes?.votedFor
  );

  if (allVoted) {
    room.phase = 'RESULTS';

    const ranking = room.players
      .map(player => ({
        id: player.id,
        name: player.name,
        emoji: player.emoji,
        color: player.color,
        votes: results[player.id] || 0
      }))
      .sort((a, b) => b.votes - a.votes);

    broadcast(room, 'RESULTS', {
      ranking
    });

    broadcastRoomState(room);
  }
}

function handlePing(ws) {
  send(ws, 'PONG', {
    time: Date.now()
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json'
    });

    res.end(JSON.stringify({
      status: 'ok',
      service: 'dub-together-server',
      rooms: rooms.size
    }));

    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });

  res.end('Dub Together server is running');
});

const wss = new WebSocketServer({
  server
});

wss.on('connection', ws => {
  console.log('Client connected');

  send(ws, 'CONNECTED', {
    message: 'Connected to Dub Together server'
  });

  ws.on('message', message => {
    try {
      const data = JSON.parse(message.toString());

      console.log('WS message:', data.type, data);

      switch (data.type) {
        case 'CREATE_ROOM':
          handleCreateRoom(ws, data);
          break;

        case 'JOIN_ROOM':
          handleJoinRoom(ws, data);
          break;

        case 'SET_MODE':
          handleSetMode(ws, data);
          break;

        case 'SET_SCENE':
          handleSetScene(ws, data);
          break;

        case 'START_ROUND':
          handleStartRound(ws);
          break;

        case 'SET_PHASE':
          handlePhaseChange(ws, data);
          break;

        case 'SUBMIT_VOTE':
          handleVote(ws, data);
          break;

        case 'PING':
          handlePing(ws);
          break;

        default:
          send(ws, 'ERROR', {
            message: `Evento sconosciuto: ${data.type}`
          });
      }
    } catch (error) {
      console.error('Message error:', error);

      send(ws, 'ERROR', {
        message: 'Messaggio non valido.'
      });
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);

    if (!client) {
      return;
    }

    const room = rooms.get(client.roomCode);

    if (!room) {
      clients.delete(ws);
      return;
    }

    const playerIndex = room.players.findIndex(
      player => player.id === client.playerId
    );

    if (playerIndex !== -1) {
      const player = room.players[playerIndex];

      room.players.splice(playerIndex, 1);

      console.log(`${player.name} left ${room.code}`);

      if (room.players.length === 0) {
        rooms.delete(room.code);
        console.log(`Room deleted: ${room.code}`);
      } else {
        if (room.hostId === player.id) {
          room.hostId = room.players[0].id;
        }

        broadcastRoomState(room);
      }
    }

    clients.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dub Together server listening on port ${PORT}`);
});