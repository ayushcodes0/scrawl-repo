// Plays a full 1-round private game against a deployed server: node tests/remote.js <url>
const { io } = require('socket.io-client');
const URL = process.argv[2];
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
setTimeout(() => fail('timeout'), 60000);
const queues = new Map();
const track = (s) => s.onAny((ev, d) => { if (!queues.has(s)) queues.set(s, []); queues.get(s).push({ ev, d }); });
const wait = (s, ev, pred = () => true) => new Promise((r) => {
  const t = setInterval(() => { const q = queues.get(s) || []; const i = q.findIndex((x) => x.ev === ev && pred(x.d)); if (i >= 0) { clearInterval(t); r(q.splice(i, 1)[0].d); } }, 10);
});
(async () => {
  const A = io(URL, { transports: ['websocket'] }), B = io(URL, { transports: ['websocket'] });
  track(A); track(B);
  await new Promise((r) => A.on('connect', r));
  console.log('connected over websocket');
  A.emit('play', { name: 'TestVirat', create: true });
  const ja = await wait(A, 'joined');
  A.emit('settings', { rounds: 1, drawTime: 30, wordCount: 3, hints: 1, customWords: '', maxPlayers: 4 });
  await wait(A, 'settings');
  B.emit('play', { name: 'TestNandini', code: ja.room.code });
  await wait(B, 'joined');
  console.log('private room', ja.room.code, 'joined by 2 players');
  A.emit('start');
  for (let t = 0; t < 2; t++) {
    const c = await wait(A, 'choosing');
    const drawer = c.drawerId === A.id ? A : B, guesser = drawer === A ? B : A;
    const { words } = await wait(drawer, 'chooseWord');
    drawer.emit('chooseWord', words[0]);
    await wait(guesser, 'drawing', (d) => d.drawerId === c.drawerId);
    drawer.emit('draw', { t: 's', c: '#ff0000', w: 8, p: [100, 100] });
    drawer.emit('draw', { t: 'm', p: [150, 150, 200, 200] });
    await wait(guesser, 'draw', (o) => o.t === 'm');
    guesser.emit('chat', words[0]);
    const end = await wait(A, 'turnEnd');
    console.log(`turn ${t + 1}: drew "${end.word}", ${end.reason}`);
  }
  const { ranking } = await wait(A, 'gameEnd');
  console.log('final:', ranking.map((p) => `${p.name} ${p.score}`).join(', '));
  console.log('PASS'); A.close(); B.close(); process.exit(0);
})();
