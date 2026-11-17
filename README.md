# Starshard Arena

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/samuelwhitaker96/starshard-arena/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/samuelwhitaker96/starshard-arena/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A neon roguelite arena survival shooter. You are the last starshard guardian: hold the arena against waves of void creatures, collect star shards, level up and forge your build — split shots, piercing shards, orbiting blades, blink dashes — until the arena finally falls.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network: the game is plain static files under `game/` and plays offline.

## How to play

- **WASD / arrow keys** — move
- **Space / Shift** — dash (brief invulnerability, 1.6 s cooldown)
- **Auto-fire** — always on, aims at the nearest enemy
- **P** — pause, **M** — mute, **R** — restart after game over
- **1 / 2 / 3 or click** — pick a level-up upgrade

Enemies: wisps that chase, darts that weave, splitters that burst into two, spitters that shoot back, bulwarks that soak damage — and an elite every 5th wave. Kills build a combo multiplier; shards level you up; every wave cleared pays a bonus.

## Layout

- `game/index.html` — the page shell (canvas + status line)
- `game/src/main.js` — boot, game loop, screen state machine
- `game/src/world.js` — the simulation: player, enemies, bullets, gems, waves, scoring
- `game/src/render.js` — everything drawn: arena, entities, HUD, title / level-up / pause / game-over screens
- `game/src/upgrades.js` — the level-up upgrade pool and derived stats
- `game/src/audio.js` — synthesised WebAudio sound effects and music (no audio files)
- `game/src/input.js` — keyboard and mouse state
- `game/src/shots.js` — deterministic screenshot scenes behind `?shot=start|play|levelup|end`
- `game/src/config.js` — all tuning numbers in one place
- `game/src/rng.js` — seeded random source (`?seed=N` reproduces a run)
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `screenshots/` — 3–4 real renders of the game in a browser (title, play, level-up, game over)

---

<sub>Entered on [make.fun](https://make.fun/?ref=golden-kestrel-66&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
