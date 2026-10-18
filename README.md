# Scrawl

A multiplayer draw-and-guess game (in the style of skribbl.io) with original branding, avatars and word list.

## Run

```bash
npm install
npm start          # http://localhost:3000
```

## Features
- Public matchmaking ("Play!") that auto-starts at 2+ players, and private rooms with invite links
- Room owner settings: max players, draw time, rounds, word choices, hints, custom words (optionally custom-only)
- Turn flow: word choice (15s auto-pick) → drawing with timed letter hints → reveal + per-turn scores → final podium
- Drawing tools: 26 colors, 4 brush sizes, flood fill, eraser, undo, clear; late joiners see the current drawing
- Chat guessing with "close!" detection, private chat among players who already guessed, spam limit
- Time- and order-based scoring; drawer scores per correct guesser
- Like/dislike drawings, vote-kick (owner kicks directly in private rooms), host hand-off when the owner leaves
- Avatar customiser (color / eyes / mouth), sound effects, responsive layout down to phone width

All game rules are enforced on the server; clients cannot draw out of turn, see the word, or edit settings unless they own the room.

## Tests
```bash
npm test           # headless two-player end-to-end game over sockets
npm run test:ui    # drives two Chrome tabs, saves screenshots to tests/shots/ (server must be running)
```
