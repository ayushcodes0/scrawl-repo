const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const WORDS = require('./words');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

const LIMITS = {
  players: [2, 12], drawTime: [15, 240], rounds: [1, 10], wordCount: [1, 5], hints: [0, 5],
};
const CHOOSE_TIME = 15;
const TURN_END_DELAY = 5000;
const GAME_END_DELAY = 10000;
const MAX_OPS = 5000;
const MAX_POINTS_PER_MSG = 200;

const rooms = new Map();

// ---------- helpers ----------
const clamp = (n, [lo, hi], d) => (Number.isFinite(+n) ? Math.min(hi, Math.max(lo, Math.round(+n))) : d);
const str = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const newCode = () => { let c; do { c = crypto.randomBytes(4).toString('base64url').slice(0, 6); } while (rooms.has(c)); return c; };

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function sanitizeAvatar(a) {
  const o = a && typeof a === 'object' ? a : {};
  return { color: clamp(o.color, [0, 17], 0), eyes: clamp(o.eyes, [0, 11], 0), mouth: clamp(o.mouth, [0, 11], 0), extra: clamp(o.extra, [0, 7], 0) };
}

function defaultSettings() {
  return { maxPlayers: 8, drawTime: 80, rounds: 3, wordCount: 3, hints: 2, customWords: [], customOnly: false };
}

function createRoom(isPrivate) {
  const room = {
    code: newCode(), isPrivate, hostId: null, players: new Map(), settings: defaultSettings(),
    state: 'lobby', round: 0, queue: [], drawerId: null, word: null, wordOptions: [], revealed: [],
    hintsGiven: 0, deadline: 0, timer: null, tick: null, ops: [], guessOrder: [], kickVotes: new Map(),
    usedWords: new Set(),
  };
  rooms.set(room.code, room);
  return room;
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, guessed: p.guessed };
}

function roomSnapshot(room, forId) {
  const isDrawer = forId === room.drawerId;
  return {
    code: room.code, isPrivate: room.isPrivate, hostId: room.hostId, settings: { ...room.settings, customWords: room.settings.customWords.join(', ') },
    state: room.state, round: room.round, drawerId: room.drawerId,
    players: [...room.players.values()].map(publicPlayer),
    hint: room.word ? (isDrawer ? room.word : hintFor(room)) : null,
    timeLeft: room.deadline ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)) : 0,
    ops: room.ops,
  };
}

function hintFor(room) {
  return [...room.word].map((ch, i) => (ch === ' ' || ch === '-' ? ch : room.revealed[i] ? ch : '_')).join('');
}

function broadcastPlayers(room) {
  io.to(room.code).emit('players', { players: [...room.players.values()].map(publicPlayer), hostId: room.hostId, drawerId: room.drawerId });
}

function system(room, text, kind = 'info', to = room.code) {
  io.to(to).emit('chat', { system: true, kind, text });
}

function clearTimers(room) {
  clearTimeout(room.timer); clearInterval(room.tick);
  room.timer = null; room.tick = null;
}

function wordPool(room) {
  const custom = room.settings.customWords;
  if (room.settings.customOnly && custom.length >= room.settings.wordCount) return custom;
  return custom.length ? [...custom, ...WORDS] : WORDS;
}

// ---------- game flow ----------
function startGame(room) {
  if (room.players.size < 2) return;
  for (const p of room.players.values()) { p.score = 0; p.guessed = false; }
  room.round = 0; room.usedWords.clear();
  io.to(room.code).emit('gameStart');
  nextRound(room);
}

function nextRound(room) {
  room.round += 1;
  if (room.round > room.settings.rounds) return endGame(room);
  room.queue = [...room.players.keys()];
  io.to(room.code).emit('round', { round: room.round, rounds: room.settings.rounds });
  nextTurn(room);
}

function nextTurn(room) {
  clearTimers(room);
  if (room.players.size < 2) return backToLobby(room, 'Not enough players to continue.');
  while (room.queue.length && !room.players.has(room.queue[0])) room.queue.shift();
  if (!room.queue.length) return nextRound(room);
  room.drawerId = room.queue.shift();
  room.word = null; room.ops = []; room.guessOrder = []; room.revealed = []; room.hintsGiven = 0;
  for (const p of room.players.values()) { p.guessed = false; p.turnScore = 0; }
  const pool = wordPool(room).filter((w) => !room.usedWords.has(w));
  room.wordOptions = shuffle([...(pool.length >= room.settings.wordCount ? pool : wordPool(room))]).slice(0, room.settings.wordCount);
  room.state = 'choosing';
  room.deadline = Date.now() + CHOOSE_TIME * 1000;
  const drawer = room.players.get(room.drawerId);
  io.to(room.code).emit('choosing', { drawerId: room.drawerId, name: drawer.name, time: CHOOSE_TIME, round: room.round });
  io.to(room.drawerId).emit('chooseWord', { words: room.wordOptions, time: CHOOSE_TIME });
  broadcastPlayers(room);
  room.timer = setTimeout(() => chooseWord(room, room.drawerId, room.wordOptions[0]), CHOOSE_TIME * 1000);
}

function chooseWord(room, id, word) {
  if (room.state !== 'choosing' || id !== room.drawerId || !room.wordOptions.includes(word)) return;
  clearTimers(room);
  room.word = word; room.usedWords.add(word);
  room.revealed = [...word].map(() => false);
  room.state = 'drawing';
  room.deadline = Date.now() + room.settings.drawTime * 1000;
  const drawer = room.players.get(room.drawerId);
  for (const sid of room.players.keys()) {
    io.to(sid).emit('drawing', {
      drawerId: room.drawerId, name: drawer.name, time: room.settings.drawTime,
      hint: sid === room.drawerId ? word : hintFor(room), lengths: word.split(' ').map((w) => w.length),
    });
  }
  system(room, `${drawer.name} is drawing now!`, 'drawer');
  const total = room.settings.drawTime;
  const hintTimes = Array.from({ length: room.settings.hints }, (_, i) => Math.floor((total * (i + 1)) / (room.settings.hints + 1)));
  room.tick = setInterval(() => {
    const left = Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
    const elapsed = total - left;
    const letters = [...room.word].filter((c) => c !== ' ' && c !== '-').length;
    if (room.hintsGiven < hintTimes.length && elapsed >= hintTimes[room.hintsGiven] && room.hintsGiven < letters - 1) {
      room.hintsGiven += 1;
      const hidden = room.revealed.map((r, i) => (!r && room.word[i] !== ' ' && room.word[i] !== '-' ? i : -1)).filter((i) => i >= 0);
      if (hidden.length > 1) {
        room.revealed[hidden[Math.floor(Math.random() * hidden.length)]] = true;
        for (const p of room.players.values()) if (p.id !== room.drawerId && !p.guessed) io.to(p.id).emit('hint', hintFor(room));
      }
    }
    if (left <= 0) endTurn(room, 'Time is up!');
  }, 1000);
}

function endTurn(room, reason) {
  if (room.state !== 'drawing' && room.state !== 'choosing') return;
  clearTimers(room);
  const word = room.word;
  room.state = 'turnEnd';
  room.deadline = 0;
  const drawer = room.players.get(room.drawerId);
  if (drawer && room.guessOrder.length) {
    const others = room.players.size - 1;
    drawer.turnScore = Math.round((200 * room.guessOrder.length) / Math.max(1, others) + 20 * room.guessOrder.length);
    drawer.score += drawer.turnScore;
  }
  const results = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, gained: p.turnScore || 0 })).sort((a, b) => b.gained - a.gained);
  io.to(room.code).emit('turnEnd', { word, reason, results });
  if (word) system(room, `The word was '${word}'`, 'word');
  room.word = null;
  broadcastPlayers(room);
  room.timer = setTimeout(() => nextTurn(room), TURN_END_DELAY);
}

function endGame(room) {
  clearTimers(room);
  room.state = 'gameEnd';
  room.drawerId = null;
  const ranking = [...room.players.values()].map(publicPlayer).sort((a, b) => b.score - a.score);
  io.to(room.code).emit('gameEnd', { ranking });
  room.timer = setTimeout(() => backToLobby(room), GAME_END_DELAY);
}

function backToLobby(room, msg) {
  clearTimers(room);
  room.state = 'lobby'; room.drawerId = null; room.word = null; room.ops = []; room.round = 0; room.deadline = 0;
  for (const p of room.players.values()) { p.guessed = false; }
  io.to(room.code).emit('lobby', roomSnapshot(room));
  if (msg) system(room, msg, 'warn');
  // Public rooms restart on their own once enough people are present.
  if (!room.isPrivate) maybeAutoStart(room);
}

function maybeAutoStart(room) {
  if (room.isPrivate || room.state !== 'lobby' || room.players.size < 2 || room.timer) return;
  system(room, 'Game starting in 5 seconds…', 'info');
  room.timer = setTimeout(() => { room.timer = null; if (room.state === 'lobby' && room.players.size >= 2) startGame(room); }, 5000);
}

function handleGuess(room, player, text) {
  const guess = normalize(text);
  const answer = normalize(room.word);
  if (guess === answer) {
    player.guessed = true;
    room.guessOrder.push(player.id);
    const left = Math.max(0, (room.deadline - Date.now()) / 1000);
    const ratio = left / room.settings.drawTime;
    const orderBonus = Math.max(0, 50 - (room.guessOrder.length - 1) * 10);
    player.turnScore = Math.round(50 + 300 * ratio + orderBonus);
    player.score += player.turnScore;
    system(room, `${player.name} guessed the word!`, 'correct');
    io.to(player.id).emit('youGuessed', { word: room.word });
    broadcastPlayers(room);
    const guessers = [...room.players.values()].filter((p) => p.id !== room.drawerId);
    if (guessers.every((p) => p.guessed)) endTurn(room, 'Everybody guessed the word!');
    return;
  }
  if (answer.length > 3 && levenshtein(guess, answer) === 1) {
    io.to(player.id).emit('chat', { system: true, kind: 'close', text: `'${text}' is close!` });
  }
  io.to(room.code).emit('chat', { id: player.id, name: player.name, text });
}

// ---------- membership ----------
function findPublicRoom() {
  for (const r of rooms.values()) {
    if (!r.isPrivate && r.players.size < r.settings.maxPlayers && r.state !== 'gameEnd') return r;
  }
  return createRoom(false);
}

function joinRoom(socket, room, profile) {
  const player = { id: socket.id, name: profile.name, avatar: profile.avatar, score: 0, guessed: false, turnScore: 0, lastChat: 0, chatBurst: 0 };
  room.players.set(socket.id, player);
  if (!room.hostId) room.hostId = socket.id;
  socket.join(room.code);
  socket.data.room = room.code;
  socket.emit('joined', { you: socket.id, room: roomSnapshot(room, socket.id) });
  socket.to(room.code).emit('chat', { system: true, kind: 'join', text: `${player.name} joined the room!` });
  broadcastPlayers(room);
  // Late joiners in a running round get a turn this round.
  if (room.state !== 'lobby' && room.state !== 'gameEnd') room.queue.push(socket.id);
  maybeAutoStart(room);
}

function leaveRoom(socket) {
  const room = rooms.get(socket.data.room);
  if (!room) return;
  const player = room.players.get(socket.id);
  room.players.delete(socket.id);
  socket.leave(room.code);
  socket.data.room = null;
  for (const votes of room.kickVotes.values()) votes.delete(socket.id);
  room.kickVotes.delete(socket.id);
  if (!room.players.size) { clearTimers(room); rooms.delete(room.code); return; }
  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    system(room, `${room.players.get(room.hostId).name} is now the room owner.`, 'info');
  }
  if (player) system(room, `${player.name} left the room.`, 'leave');
  broadcastPlayers(room);
  if (room.state === 'lobby') { io.to(room.code).emit('lobby', roomSnapshot(room)); return; }
  if (room.players.size < 2 && room.state !== 'gameEnd') return backToLobby(room, 'Not enough players to continue.');
  if (socket.id === room.drawerId) endTurn(room, 'The drawer left the game.');
  else if (room.state === 'drawing') {
    const guessers = [...room.players.values()].filter((p) => p.id !== room.drawerId);
    if (guessers.length && guessers.every((p) => p.guessed)) endTurn(room, 'Everybody guessed the word!');
  }
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  const roomOf = () => rooms.get(socket.data.room);

  socket.on('play', (data = {}) => {
    if (socket.data.room) return;
    const name = str(data.name, 20) || `Guest${Math.floor(Math.random() * 900 + 100)}`;
    const profile = { name, avatar: sanitizeAvatar(data.avatar) };
    let room;
    if (data.code) {
      room = rooms.get(str(data.code, 12));
      if (!room) return socket.emit('fail', 'That room does not exist anymore.');
      if (room.players.size >= room.settings.maxPlayers) return socket.emit('fail', 'That room is full.');
    } else if (data.create) room = createRoom(true);
    else room = findPublicRoom();
    joinRoom(socket, room, profile);
  });

  socket.on('settings', (s = {}) => {
    const room = roomOf();
    if (!room || room.hostId !== socket.id || room.state !== 'lobby' || !room.isPrivate) return;
    const cur = room.settings;
    cur.maxPlayers = clamp(s.maxPlayers, LIMITS.players, cur.maxPlayers);
    cur.drawTime = clamp(s.drawTime, LIMITS.drawTime, cur.drawTime);
    cur.rounds = clamp(s.rounds, LIMITS.rounds, cur.rounds);
    cur.wordCount = clamp(s.wordCount, LIMITS.wordCount, cur.wordCount);
    cur.hints = clamp(s.hints, LIMITS.hints, cur.hints);
    cur.customOnly = !!s.customOnly;
    if (typeof s.customWords === 'string') {
      cur.customWords = [...new Set(s.customWords.split(',').map((w) => normalize(str(w, 32))).filter((w) => w.length >= 2))].slice(0, 500);
    }
    io.to(room.code).emit('settings', { ...cur, customWords: cur.customWords.join(', ') });
  });

  socket.on('start', () => {
    const room = roomOf();
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (room.players.size < 2) return socket.emit('chat', { system: true, kind: 'warn', text: 'You need at least 2 players to start.' });
    clearTimers(room);
    startGame(room);
  });

  socket.on('chooseWord', (word) => { const room = roomOf(); if (room) chooseWord(room, socket.id, word); });

  socket.on('chat', (raw) => {
    const room = roomOf();
    const text = str(raw, 100);
    if (!room || !text) return;
    const p = room.players.get(socket.id);
    const now = Date.now();
    p.chatBurst = now - p.lastChat < 1000 ? p.chatBurst + 1 : 0;
    p.lastChat = now;
    if (p.chatBurst > 4) return socket.emit('chat', { system: true, kind: 'warn', text: 'Slow down! You are sending messages too fast.' });
    if (room.state === 'drawing') {
      if (socket.id === room.drawerId || p.guessed) {
        // Drawer and players who already guessed only talk to each other.
        const msg = { id: p.id, name: p.name, text, secret: true };
        for (const q of room.players.values()) if (q.id === room.drawerId || q.guessed) io.to(q.id).emit('chat', msg);
        return;
      }
      return handleGuess(room, p, text);
    }
    io.to(room.code).emit('chat', { id: p.id, name: p.name, text });
  });

  // Drawing ops: {t:'s', c, w, p:[x,y]} start stroke, {t:'m', p:[x,y,...]} extend, {t:'f', c, p:[x,y]} fill.
  socket.on('draw', (op) => {
    const room = roomOf();
    if (!room || room.state !== 'drawing' || socket.id !== room.drawerId || !op || room.ops.length > MAX_OPS) return;
    const pts = Array.isArray(op.p) ? op.p.slice(0, MAX_POINTS_PER_MSG * 2).map((n) => clamp(n, [-50, 850], 0)) : [];
    if (pts.length < 2 || pts.length % 2) return;
    const color = typeof op.c === 'string' && /^#[0-9a-f]{6}$/i.test(op.c) ? op.c : '#000000';
    let clean;
    if (op.t === 's') clean = { t: 's', c: color, w: clamp(op.w, [1, 60], 6), p: pts };
    else if (op.t === 'm') {
      const last = room.ops[room.ops.length - 1];
      if (!last || last.t !== 's' || last.p.length > 20000) return;
      last.p.push(...pts);
      socket.to(room.code).emit('draw', { t: 'm', p: pts });
      return;
    } else if (op.t === 'f') clean = { t: 'f', c: color, p: pts.slice(0, 2) };
    else return;
    room.ops.push(clean);
    socket.to(room.code).emit('draw', clean);
  });

  socket.on('undo', () => {
    const room = roomOf();
    if (!room || room.state !== 'drawing' || socket.id !== room.drawerId) return;
    room.ops.pop();
    io.to(room.code).emit('redraw', room.ops);
  });

  socket.on('clear', () => {
    const room = roomOf();
    if (!room || room.state !== 'drawing' || socket.id !== room.drawerId) return;
    room.ops = [];
    io.to(room.code).emit('redraw', room.ops);
  });

  socket.on('rate', (like) => {
    const room = roomOf();
    if (!room || room.state !== 'drawing' || socket.id === room.drawerId) return;
    const p = room.players.get(socket.id);
    if (p.ratedTurn === room.drawerId + room.round) return;
    p.ratedTurn = room.drawerId + room.round;
    system(room, `${p.name} ${like ? 'liked' : 'disliked'} the drawing!`, like ? 'like' : 'dislike');
  });

  socket.on('voteKick', (targetId) => {
    const room = roomOf();
    if (!room || !room.players.has(targetId) || targetId === socket.id) return;
    const voter = room.players.get(socket.id);
    const target = room.players.get(targetId);
    if (room.isPrivate && room.hostId === socket.id) return kick(room, targetId, `${target.name} was kicked by the room owner.`);
    if (!room.kickVotes.has(targetId)) room.kickVotes.set(targetId, new Set());
    const votes = room.kickVotes.get(targetId);
    votes.add(socket.id);
    const needed = Math.floor((room.players.size - 1) / 2) + 1;
    system(room, `${voter.name} is voting to kick ${target.name} (${votes.size}/${needed})`, 'warn');
    if (votes.size >= needed) kick(room, targetId, `${target.name} was kicked.`);
  });

  socket.on('leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

function kick(room, id, msg) {
  const s = io.sockets.sockets.get(id);
  if (!s) return;
  s.emit('kicked');
  leaveRoom(s);
  system(room, msg, 'leave');
}

server.listen(PORT, () => console.log(`Scrawl running on http://localhost:${PORT}`));
