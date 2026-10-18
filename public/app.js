(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io({ autoConnect: true });

  // ---------- state ----------
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const S = {
    me: null, room: null, players: [], hostId: null, drawerId: null, state: 'home',
    avatar: store.get('scrawl.avatar', Avatar.random()), sound: store.get('scrawl.sound', true),
    deadline: 0, ops: [], tool: 'brush', color: '#000000', size: 8, guessed: false,
  };
  const inviteCode = new URLSearchParams(location.search).keys().next().value || location.hash.slice(1) || null;

  // ---------- logo ----------
  const LOGO_MARK = '<span class="logo-mark"><svg viewBox="0 0 24 24"><path d="M5 17c3-1 4-9 8-9s1 7 6 6"/></svg></span><span class="logo-text">scrawl</span>';
  document.querySelectorAll('.logo').forEach((el) => { el.innerHTML = LOGO_MARK; });
  const ICON_SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/></svg>';

  // ---------- sound ----------
  let actx;
  function beep(freq = 600, dur = 0.08, type = 'sine', vol = 0.08) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(actx.destination);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.start(); o.stop(actx.currentTime + dur);
    } catch {}
  }
  const sfx = {
    join: () => beep(520, 0.1), leave: () => beep(300, 0.12, 'triangle'),
    correct: () => { beep(660, 0.1); setTimeout(() => beep(990, 0.15), 90); },
    tick: () => beep(900, 0.04, 'square', 0.03), turn: () => { beep(440, 0.1); setTimeout(() => beep(550, 0.1), 100); setTimeout(() => beep(660, 0.15), 200); },
  };
  $('#settingsToggle').addEventListener('click', () => {
    S.sound = !S.sound; store.set('scrawl.sound', S.sound);
    $('#settingsToggle').innerHTML = S.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;
  });
  $('#settingsToggle').innerHTML = S.sound ? ICON_SOUND_ON : ICON_SOUND_OFF;

  // ---------- home ----------
  $('#name').value = store.get('scrawl.name', '');
  const renderAvatar = () => { $('#avatarPreview').innerHTML = Avatar.svg(S.avatar); store.set('scrawl.avatar', S.avatar); };
  renderAvatar();
  document.querySelectorAll('.avatar-editor .arrows button').forEach((b) => b.addEventListener('click', () => {
    const part = b.dataset.part; const n = Avatar.counts[part];
    S.avatar[part] = (S.avatar[part] + +b.dataset.dir + n) % n; renderAvatar();
  }));
  $('#randomize').addEventListener('click', () => { S.avatar = Avatar.random(); renderAvatar(); });

  if (inviteCode) { $('#createBtn').classList.add('hidden'); $('#playBtn').textContent = 'Join room!'; }

  function play(extra) {
    const name = $('#name').value.trim();
    store.set('scrawl.name', name);
    $('#homeError').textContent = '';
    if (!socket.connected) { $('#homeError').textContent = 'Connecting to server… try again in a moment.'; return; }
    socket.emit('play', { name, avatar: S.avatar, ...extra });
  }
  $('#playBtn').addEventListener('click', () => play(inviteCode ? { code: inviteCode } : {}));
  $('#createBtn').addEventListener('click', () => play({ create: true }));
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#playBtn').click(); });

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }

  // ---------- players ----------
  function renderPlayers() {
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    const rankOf = new Map(ranked.map((p, i) => [p.id, i + 1]));
    $('#players').innerHTML = S.players.map((p) => `
      <div class="player ${p.guessed ? 'guessed' : ''} ${p.id === S.me ? 'me' : ''}" data-id="${p.id}" tabindex="0">
        <div class="rank">#${rankOf.get(p.id)}</div>
        <div class="pinfo">
          <div class="pname">${esc(p.name)}${p.id === S.me ? ' <b>(You)</b>' : ''}</div>
          <div class="pscore">${p.score} points</div>
        </div>
        <div class="avatar small">${Avatar.svg(p.avatar, { crown: p.id === S.hostId })}</div>
        ${p.id === S.drawerId ? '<div class="pencil" title="Drawing"><svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>' : ''}
      </div>`).join('');
  }
  $('#players').addEventListener('click', (e) => {
    const el = e.target.closest('.player'); if (!el || el.dataset.id === S.me) return;
    const p = S.players.find((x) => x.id === el.dataset.id); if (!p) return;
    const isOwner = S.room?.isPrivate && S.hostId === S.me;
    openOverlay(`<div class="pcard">
      <div class="avatar big">${Avatar.svg(p.avatar)}</div>
      <h3>${esc(p.name)}</h3>
      <button class="btn red" id="kickBtn">${isOwner ? 'Kick' : 'Vote kick'}</button>
      <button class="btn" id="closeOv">Close</button></div>`, true);
    $('#kickBtn').onclick = () => { socket.emit('voteKick', p.id); closeOverlay(); };
    $('#closeOv').onclick = closeOverlay;
  });

  // ---------- chat ----------
  function addMsg(m) {
    const box = $('#messages');
    const el = document.createElement('div');
    if (m.system) { el.className = `msg sys ${m.kind || ''}`; el.textContent = m.text; }
    else {
      el.className = `msg ${m.secret ? 'secret' : ''}`;
      el.innerHTML = `<b>${esc(m.name)}:</b> ${esc(m.text)}`;
    }
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.appendChild(el);
    while (box.children.length > 200) box.firstChild.remove();
    if (stick) box.scrollTop = box.scrollHeight;
    if (m.kind === 'correct') sfx.correct(); else if (m.kind === 'join') sfx.join(); else if (m.kind === 'leave') sfx.leave();
  }
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim(); if (!v) return;
    socket.emit('chat', v); $('#chatInput').value = '';
  });

  // ---------- overlay ----------
  function openOverlay(html, dismissable) {
    $('#overlayContent').innerHTML = html;
    $('#overlay').classList.remove('hidden');
    $('#overlay').dataset.dismiss = dismissable ? '1' : '';
  }
  function closeOverlay() { $('#overlay').classList.add('hidden'); $('#overlayContent').innerHTML = ''; }
  $('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay' && $('#overlay').dataset.dismiss) closeOverlay(); });

  // ---------- canvas ----------
  const canvas = $('#board');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  function wipe() { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
  wipe();

  function strokeSeg(op, from) {
    const p = op.p;
    ctx.strokeStyle = op.c; ctx.fillStyle = op.c; ctx.lineWidth = op.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.length === 2 || from === 0 && p.length === 2) {
      ctx.beginPath(); ctx.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2); ctx.fill(); return;
    }
    ctx.beginPath();
    const start = Math.max(0, from - 2);
    ctx.moveTo(p[start], p[start + 1]);
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  }

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function floodFill(x, y, hex) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const img = ctx.getImageData(0, 0, W, H); const d = img.data;
    const [r, g, b] = hexToRgb(hex);
    const i0 = (y * W + x) * 4;
    const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2];
    if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 6) return;
    const tol = 90;
    const match = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= tol;
    const seen = new Uint8Array(W * H);
    const stack = [x, y];
    while (stack.length) {
      const cy = stack.pop(); let cx = stack.pop();
      let i = cy * W + cx;
      while (cx >= 0 && !seen[i] && match(i * 4)) { cx--; i--; }
      cx++; i++;
      let up = false, down = false;
      while (cx < W && !seen[i] && match(i * 4)) {
        seen[i] = 1; const k = i * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
        if (cy > 0) { const u = i - W; if (!seen[u] && match(u * 4)) { if (!up) { stack.push(cx, cy - 1); up = true; } } else up = false; }
        if (cy < H - 1) { const v = i + W; if (!seen[v] && match(v * 4)) { if (!down) { stack.push(cx, cy + 1); down = true; } } else down = false; }
        cx++; i++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function applyOp(op) {
    if (op.t === 's') strokeSeg(op, 0);
    else if (op.t === 'f') floodFill(op.p[0], op.p[1], op.c);
  }
  function replay(ops) { S.ops = ops.map((o) => ({ ...o, p: [...o.p] })); wipe(); S.ops.forEach(applyOp); }

  // remote drawing
  socket.on('draw', (op) => {
    if (op.t === 'm') {
      const last = S.ops[S.ops.length - 1]; if (!last || last.t !== 's') return;
      const from = last.p.length; last.p.push(...op.p); strokeSeg(last, from);
    } else { S.ops.push(op); applyOp(op); }
  });
  socket.on('redraw', (ops) => replay(ops));

  // local drawing
  const amDrawer = () => S.state === 'drawing' && S.drawerId === S.me;
  let drawing = false, pending = [], flushT = null, lastPt = null;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  }
  function flush() {
    flushT = null; if (!pending.length) return;
    socket.emit('draw', { t: 'm', p: pending }); pending = [];
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!amDrawer() || e.button > 0) return;
    const [x, y] = pos(e);
    if (S.tool === 'fill') { const op = { t: 'f', c: S.color, p: [x, y] }; S.ops.push(op); applyOp(op); socket.emit('draw', op); return; }
    drawing = true; canvas.setPointerCapture(e.pointerId);
    const op = { t: 's', c: S.tool === 'eraser' ? '#ffffff' : S.color, w: S.size, p: [x, y] };
    S.ops.push(op); applyOp(op); socket.emit('draw', op); lastPt = [x, y];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const op = S.ops[S.ops.length - 1];
    for (const ev of evs) {
      const [x, y] = pos(ev);
      if (lastPt && Math.abs(x - lastPt[0]) + Math.abs(y - lastPt[1]) < 2) continue;
      const from = op.p.length; op.p.push(x, y); strokeSeg(op, from); pending.push(x, y); lastPt = [x, y];
      if (pending.length >= 380) flush();
    }
    if (!flushT) flushT = setTimeout(flush, 30);
  });
  const endStroke = () => { if (!drawing) return; drawing = false; flush(); };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---------- toolbar ----------
  const PALETTE = ['#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00ff91', '#00b2ff', '#231fd3', '#a300ba', '#df69a7', '#ffac8e', '#a0522d',
    '#000000', '#505050', '#740b07', '#c23800', '#e8a200', '#005510', '#00785d', '#00569e', '#0e0865', '#550069', '#873554', '#cc774d', '#63300d'];
  $('#palette').innerHTML = PALETTE.map((c) => `<button class="swatch" style="background:${c}" data-c="${c}" aria-label="Color ${c}"></button>`).join('');
  $('#palette').addEventListener('click', (e) => { const c = e.target.dataset.c; if (!c) return; S.color = c; if (S.tool === 'eraser') setTool('brush'); syncTools(); });
  const SIZES = [4, 10, 20, 36];
  $('#sizes').innerHTML = SIZES.map((s) => `<button class="size" data-s="${s}" aria-label="Brush size ${s}"><i style="width:${Math.max(4, s * 0.8)}px;height:${Math.max(4, s * 0.8)}px"></i></button>`).join('');
  $('#sizes').addEventListener('click', (e) => { const b = e.target.closest('.size'); if (!b) return; S.size = +b.dataset.s; syncTools(); });
  S.size = 10;
  function setTool(t) { S.tool = t; syncTools(); }
  document.querySelectorAll('.tool[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  function syncTools() {
    $('#currentColor').style.background = S.color;
    document.querySelectorAll('.size').forEach((b) => b.classList.toggle('active', +b.dataset.s === S.size));
    document.querySelectorAll('.tool[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === S.tool));
    canvas.dataset.tool = S.tool;
  }
  syncTools();
  $('#undoBtn').addEventListener('click', () => amDrawer() && socket.emit('undo'));
  $('#clearBtn').addEventListener('click', () => amDrawer() && socket.emit('clear'));
  document.addEventListener('keydown', (e) => {
    if (!amDrawer() || document.activeElement === $('#chatInput')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); socket.emit('undo'); }
    else if (e.key === 'b') setTool('brush'); else if (e.key === 'f') setTool('fill'); else if (e.key === 'e') setTool('eraser');
  });
  document.querySelectorAll('#rateBar button').forEach((b) => b.addEventListener('click', () => {
    socket.emit('rate', b.dataset.like === '1'); $('#rateBar').classList.add('hidden');
  }));

  // ---------- timer / header ----------
  let lastSec = -1;
  setInterval(() => {
    const left = S.deadline ? Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000)) : 0;
    $('#timer').textContent = left;
    const ring = $('#clockRing');
    if (ring) {
      const frac = S.deadline && S.total ? left / S.total : 0;
      ring.style.strokeDashoffset = String(97.4 * (1 - frac));
      ring.classList.toggle('urgent', S.state === 'drawing' && left <= 10);
    }
    if (S.state === 'drawing' && left <= 10 && left > 0 && left !== lastSec) sfx.tick();
    lastSec = left;
  }, 250);
  function setHint(text, lengths) {
    const el = $('#wordHint');
    if (!text) { el.innerHTML = ''; return; }
    const isDrawer = S.drawerId === S.me;
    el.innerHTML = `<div class="hint-label">${isDrawer ? 'DRAW THIS' : S.guessed ? 'YOU GUESSED IT' : 'GUESS THIS'}</div>
      <div class="hint-word">${[...text].map((c) => (c === ' ' ? '<span class="gap"></span>' : `<span>${esc(c)}</span>`)).join('')}${lengths ? `<sup>${lengths.join(' ')}</sup>` : ''}</div>`;
  }
  let currentLengths = null;

  function updateUI() {
    const drawer = amDrawer();
    $('#toolbar').classList.toggle('hidden', !drawer);
    $('#rateBar').classList.toggle('hidden', !(S.state === 'drawing' && !drawer && S.drawerId));
    canvas.classList.toggle('can-draw', drawer);
    $('#chatInput').placeholder = S.state === 'drawing' && !drawer && !S.guessed ? 'Type your guess here...' : 'Type your message here...';
    renderPlayers();
  }

  // ---------- lobby ----------
  const opts = (sel, values, fmt = (v) => v) => { $(sel).innerHTML = values.map((v) => `<option value="${v}">${fmt(v)}</option>`).join(''); };
  opts('#sMaxPlayers', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  opts('#sDrawTime', [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240], (v) => `${v}s`);
  opts('#sRounds', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  opts('#sWordCount', [1, 2, 3, 4, 5]);
  opts('#sHints', [0, 1, 2, 3, 4, 5]);
  const settingInputs = ['#sMaxPlayers', '#sDrawTime', '#sRounds', '#sWordCount', '#sHints', '#sCustomWords', '#sCustomOnly'];
  function readSettings() {
    return { maxPlayers: +$('#sMaxPlayers').value, drawTime: +$('#sDrawTime').value, rounds: +$('#sRounds').value, wordCount: +$('#sWordCount').value, hints: +$('#sHints').value, customWords: $('#sCustomWords').value, customOnly: $('#sCustomOnly').checked };
  }
  let settingsT;
  settingInputs.forEach((s) => $(s).addEventListener(s === '#sCustomWords' ? 'input' : 'change', () => {
    clearTimeout(settingsT); settingsT = setTimeout(() => socket.emit('settings', readSettings()), s === '#sCustomWords' ? 500 : 0);
  }));
  function applySettings(st) {
    $('#sMaxPlayers').value = st.maxPlayers; $('#sDrawTime').value = st.drawTime; $('#sRounds').value = st.rounds;
    $('#sWordCount').value = st.wordCount; $('#sHints').value = st.hints; $('#sCustomOnly').checked = st.customOnly;
    if (document.activeElement !== $('#sCustomWords')) $('#sCustomWords').value = st.customWords;
  }
  function renderLobby() {
    const inLobby = S.state === 'lobby';
    const priv = S.room?.isPrivate;
    $('#lobby').classList.toggle('hidden', !(inLobby && priv));
    if (inLobby && !priv) openOverlay('<div class="ov-title">Waiting for players…</div><p>The game starts automatically when at least 2 players are here.</p>');
    else if (inLobby) closeOverlay();
    const owner = S.hostId === S.me;
    settingInputs.forEach((s) => { $(s).disabled = !owner; });
    $('#startBtn').classList.toggle('hidden', !owner);
    $('#lobbyNote').textContent = owner ? (S.players.length < 2 ? 'Invite at least one friend to start.' : '') : 'Waiting for the room owner to start the game…';
    $('#inviteLink').value = `${location.origin}/?${S.room?.code}`;
    $('#roundInfo').textContent = 'Waiting';
    setHint(null);
  }
  $('#startBtn').addEventListener('click', () => socket.emit('start'));
  $('#copyBtn').addEventListener('click', async () => {
    $('#inviteLink').select();
    try { await navigator.clipboard.writeText($('#inviteLink').value); toast('Invite link copied!'); } catch { document.execCommand('copy'); toast('Invite link copied!'); }
  });

  // ---------- socket events ----------
  socket.on('connect_error', () => { $('#homeError').textContent = 'Cannot reach the game server.'; });
  socket.on('disconnect', () => {
    if (S.state !== 'home') { toast('Disconnected from server.'); S.state = 'home'; showScreen('home'); }
  });
  socket.on('fail', (msg) => { $('#homeError').textContent = msg; });
  socket.on('kicked', () => { S.state = 'home'; showScreen('home'); $('#homeError').textContent = 'You were kicked from the room.'; history.replaceState(null, '', '/'); });

  socket.on('joined', ({ you, room }) => {
    S.me = you; S.room = room; S.players = room.players; S.hostId = room.hostId; S.drawerId = room.drawerId; S.state = room.state;
    S.deadline = room.timeLeft ? Date.now() + room.timeLeft * 1000 : 0; S.total = room.state === 'drawing' ? room.settings.drawTime : 15; S.guessed = false;
    $('#messages').innerHTML = '';
    showScreen('game');
    if (room.isPrivate) history.replaceState(null, '', `/?${room.code}`);
    applySettings(room.settings);
    replay(room.ops || []);
    if (room.state === 'lobby') renderLobby();
    else {
      $('#lobby').classList.add('hidden'); closeOverlay();
      $('#roundInfo').textContent = `Round ${room.round} of ${room.settings.rounds}`;
      if (room.hint) setHint(room.hint);
      if (room.state === 'choosing') openOverlay('<div class="ov-title">A word is being chosen…</div>');
    }
    addMsg({ system: true, kind: 'join', text: 'You joined the room!' });
    updateUI();
  });

  socket.on('players', ({ players, hostId, drawerId }) => {
    S.players = players; S.hostId = hostId; S.drawerId = drawerId;
    const me = players.find((p) => p.id === S.me); if (me) S.guessed = me.guessed;
    if (S.state === 'lobby') renderLobby();
    updateUI();
  });
  socket.on('settings', (st) => { if (S.room) S.room.settings = st; applySettings(st); });
  socket.on('chat', addMsg);

  socket.on('lobby', (room) => {
    S.room = room; S.state = 'lobby'; S.drawerId = null; S.deadline = 0; S.players = room.players; S.hostId = room.hostId;
    applySettings(room.settings); replay([]); renderLobby(); updateUI();
  });
  socket.on('gameStart', () => { $('#lobby').classList.add('hidden'); closeOverlay(); });
  socket.on('round', ({ round, rounds }) => {
    $('#roundInfo').textContent = `Round ${round} of ${rounds}`;
    openOverlay(`<div class="ov-title big">Round ${round}</div>`);
  });

  socket.on('choosing', ({ drawerId, name, time }) => {
    S.state = 'choosing'; S.drawerId = drawerId; S.guessed = false; S.deadline = Date.now() + time * 1000; S.total = time;
    replay([]); setHint(null);
    if (drawerId !== S.me) {
      const p = S.players.find((x) => x.id === drawerId);
      setTimeout(() => { if (S.state === 'choosing') openOverlay(`<div class="avatar big">${p ? Avatar.svg(p.avatar) : ''}</div><div class="ov-title">${esc(name)} is choosing a word!</div>`); }, 1200);
    }
    updateUI();
  });
  socket.on('chooseWord', ({ words }) => {
    sfx.turn();
    setTimeout(() => {
      openOverlay(`<div class="ov-title">Choose a word</div><div class="word-choices">${words.map((w) => `<button class="btn word-btn" data-w="${esc(w)}">${esc(w)}</button>`).join('')}</div>`);
      document.querySelectorAll('.word-btn').forEach((b) => b.addEventListener('click', () => socket.emit('chooseWord', b.dataset.w)));
    }, 1200);
  });
  socket.on('drawing', ({ drawerId, time, hint, lengths }) => {
    S.state = 'drawing'; S.drawerId = drawerId; S.deadline = Date.now() + time * 1000; S.total = time;
    currentLengths = lengths; closeOverlay(); setHint(hint, lengths); updateUI();
  });
  socket.on('hint', (hint) => setHint(hint, currentLengths));
  socket.on('youGuessed', ({ word }) => { S.guessed = true; setHint(word); updateUI(); });

  socket.on('turnEnd', ({ word, reason, results }) => {
    S.state = 'turnEnd'; S.deadline = 0;
    openOverlay(`<div class="ov-title">${esc(reason)}</div>
      ${word ? `<div class="reveal">The word was <b>${esc(word)}</b></div>` : ''}
      <ul class="results">${results.map((r) => `<li><span>${esc(r.name)}</span><b class="${r.gained ? 'pos' : 'zero'}">${r.gained ? '+' + r.gained : 0}</b></li>`).join('')}</ul>`);
    if (word) setHint(word);
    updateUI();
  });

  socket.on('gameEnd', ({ ranking }) => {
    S.state = 'gameEnd'; S.deadline = 0; S.drawerId = null; setHint(null);
    const podium = ranking.slice(0, 3).map((p, i) => `<div class="podium-spot p${i + 1}">
        <div class="avatar big">${Avatar.svg(p.avatar, { crown: i === 0 })}</div>
        <div class="pname">${esc(p.name)}</div><div class="pscore">${p.score} pts</div><div class="step">#${i + 1}</div></div>`).join('');
    const rest = ranking.slice(3).map((p, i) => `<li>#${i + 4} ${esc(p.name)} — ${p.score}</li>`).join('');
    openOverlay(`<div class="ov-title">Game over!</div><div class="podium">${podium}</div>${rest ? `<ul class="results">${rest}</ul>` : ''}`);
    sfx.turn(); updateUI();
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();
