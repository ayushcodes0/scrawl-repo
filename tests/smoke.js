// End-to-end smoke test: two players play a full 1-round private game.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const path = require('path');
const PORT = 3999;
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
const fail = (m) => { console.error('FAIL:', m); srv.kill(); process.exit(1); };
setTimeout(() => fail('timeout'), 40000);
// Buffer every event so awaits never miss packets delivered in the same batch.
const queues = new Map();
function track(s) { s.onAny((ev, d) => { const k = s; if (!queues.has(k)) queues.set(k, []); queues.get(k).push({ ev, d }); }); }
const wait = (s, ev, pred = () => true) => new Promise((r) => {
  const check = () => { const q = queues.get(s) || []; const i = q.findIndex((x) => x.ev === ev && pred(x.d)); if (i >= 0) { const [x] = q.splice(i, 1); clearInterval(t); r(x.d); } };
  const t = setInterval(check, 10); check();
});
const log = [];
srv.stdout.once('data', async () => {
  const A = io(`http://localhost:${PORT}`), B = io(`http://localhost:${PORT}`);
  track(A); track(B);
  for (const s of [A, B]) s.on('chat', (m) => log.push(m));
  A.emit('play', { name: 'Alice', avatar: { color: 3, eyes: 2, mouth: 1 }, create: true });
  const ja = await wait(A, 'joined');
  A.emit('settings', { rounds: 1, drawTime: 15, wordCount: 3, hints: 1, customWords: 'lighthouse, kite', customOnly: false, maxPlayers: 4 });
  await wait(A, 'settings');
  B.emit('play', { name: 'Bob<script>', code: ja.room.code });
  const jb = await wait(B, 'joined');
  if (jb.room.settings.rounds !== 1) fail('settings not applied');
  B.emit('start'); // non-host: should be ignored
  A.emit('start');
  const turns = [];
  for (let t = 0; t < 2; t++) {
    const choosing = await wait(A, 'choosing');
    const drawer = choosing.drawerId === A.id ? A : B, guesser = drawer === A ? B : A;
    const { words } = await wait(drawer, 'chooseWord');
    if (words.length !== 3) fail('wrong word count');
    drawer.emit('chooseWord', words[0]);
    const g = await wait(guesser, 'drawing', (d) => d.drawerId === choosing.drawerId);
    if (/[a-z]/.test(g.hint)) fail('hint leaks word: ' + g.hint);
    drawer.emit('draw', { t: 's', c: '#ff0000', w: 8, p: [10, 10] });
    drawer.emit('draw', { t: 'm', p: [20, 20, 30, 30] });
    guesser.emit('draw', { t: 's', c: '#000000', w: 8, p: [1, 1] }); // guesser cannot draw
    const op = await wait(guesser, 'draw', (o) => o.t === 'm');
    if (op.p.length !== 4) fail('draw relay broken');
    guesser.emit('chat', 'definitely wrong');
    guesser.emit('chat', words[0].toUpperCase());
    const end = await wait(A, 'turnEnd');
    if (end.word !== words[0]) fail('turn end word mismatch');
    turns.push({ drawer: drawer === A ? 'Alice' : 'Bob', word: words[0], results: end.results, reason: end.reason });
  }
  const { ranking } = await wait(A, 'gameEnd');
  console.log(JSON.stringify(turns, null, 1));
  console.log('ranking', ranking.map((p) => `${p.name}:${p.score}`));
  if (!log.some((m) => m.kind === 'correct')) fail('no correct message');
  if (ranking.some((p) => p.score <= 0)) fail('scores not awarded');
  console.log('PASS');
  srv.kill(); process.exit(0);
});
