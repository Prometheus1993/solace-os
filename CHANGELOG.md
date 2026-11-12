# Changelog

All notable changes to this project are written here. The format follows
[Keep a Changelog](https://keepachangelog.com) and the versions follow
[Semantic Versioning](https://semver.org) in the 0.x range.

Rules:
- Every branch adds its lines under `## [Unreleased]`, grouped by the subheadings
  **Added**, **Changed**, **Fixed** and **Removed** (leave out a heading you do not need).
- A release moves those lines into a new `## [X.Y.Z] - YYYY-MM-DD` section and leaves
  `## [Unreleased]` empty again.
- 0.x versioning: a fix bumps the patch (0.2.1); a feature or a breaking change bumps the minor (0.3.0).

## [Unreleased]

### Added
- Solace as a Mac app (Electron, new workspace `desktop/`): `npm run desktop` runs it, `npm run desktop:build` builds an unsigned `Solace.app`. It starts the API server and the web UI itself (or reuses a Solace that already runs on those ports), keeps running when you close the window, launches at login, has an "Always on Top" toggle and the global show/hide shortcut Control+Option+Command+S. It notifies you on the morning of an exam or resit day and when your Garmin login is about to expire or has expired. If it starts its own API but the web port is already answering (for example the Docker demo), it stops with a port-in-use error instead of showing the wrong database. See README "Mac app".
- The server now knows the sky: it asks Open-Meteo for today's sunrise, sunset and the current weather at a configurable location (default Antwerp; `SOLACE_LAT` + `SOLACE_LON` in `.env`, `SOLACE_SKY=0` turns it off), keeps the answer in memory for 30 minutes and adds it to the dashboard as `sky`. If Open-Meteo cannot be reached the dashboard still loads and `sky` is `null`. The demo always uses the default location. From this the desk works out the phase of the day (dawn, day, dusk, night; fixed clock hours without data) and one of four weather moods (clear, fog, rain, snow). The weather mood is not shown yet.
- The fox-cat on the desk is alive: it walks and jumps between its cushion on the tabletop and the top of the monitor, sits down, sometimes grooms itself, sleeps, wakes up and stretches before it moves on. It moves more smoothly: it speeds up into a walk and slows down out of it, turns round in one whole movement instead of flipping, looks up or peeks over the edge before a jump and recovers after landing. It also has new habits: it yawns, watches the city, kneads its cushion, balances on top of the monitor, sniffs around where it arrives, tucks itself into a loaf, and sometimes circles on the spot before it falls asleep. The spots belong to those props, so moving one in the layout editor moves the cat's spot and hiding one takes it off the route (with fewer than two spots left the cat stays on its cushion). Clicking the cat still gets a purr, with a reaction that fits its pose; asleep, it reacts without waking up, and from a loaf it untucks first. It stands still whenever desk motion is paused, and with reduced motion it just sits on the cushion. The cushion is now its own prop ("Cat cushion" in the layout editor; a saved position is kept). In development, `?catMove=<move>` in the URL (for example `?catMove=turn-around`) runs the cat ahead to just before that move.
- The desk follows the time of day: the sky and the city behind the window change through dawn, day, dusk and night, the room gets darker in the evening, and at dusk the desk lamp switches on with a warm glow while the awake monitor lights the desk around it. The changes fade in slowly (at once with reduced motion or MOTION OFF), and the desk checks the clock every minute by itself. The lamp is new artwork with an off and an on picture; the glow is drawn in code. In development, `?skyPhase=dawn|day|dusk|night` in the URL shows one phase without waiting for it.
- The city behind the desk window follows the time of day more closely: hovercar traffic is busy by day and at dusk, lighter at dawn and sparse at night. The flying train no longer passes every 45 seconds: it now comes by at a random moment, 3 to 6 minutes after the previous pass. Everything stands still with reduced motion, MOTION OFF, the layout editor or a hidden tab.

### Changed
- README is shorter: the roadmap moved to the new `ROADMAP.md`, the Mac app details to `docs/mac-app.md`, the CLI is part of "Development", and the configuration table is replaced by a pointer to `.env.example`. The "Upgrading from ragnarok" note is removed.
- The desk's route and timing helpers (interpolation, fades, repeating schedules) moved from the city code into a shared, tested module (`frontend/src/home/desk/motion.ts`) so other desk animations can reuse them. The city looks and moves exactly as before.
- The desk is now a panoramic room: one large window fills most of the screen above a slim desk band, with no floor and no chair. The room is built from seven separate picture layers (sky, far, middle and near city, an empty billboard frame, the window frame and the desk); each time of day colours the sky and every city layer on its own. The window and the desk are fixed, every prop can still be moved, resized and hidden in EDIT LAYOUT, and the props now stand on the tabletop by default with the cat and its cushion on the right. The scene fills the viewport: on a wider screen some sky is cropped at the top, on a narrower one up to a small strip left and right, never the desk. The flying train and the hovercars fly between the city layers, behind the window frame. A desk layout saved earlier still opens: its moves and sizes now apply from the new default places, so a moved prop can end up in an odd spot; "Reset whole layout" (or "Reset object") followed by "Save layout" puts it back. Saved settings for the window and the desk surface are no longer used.
- The desk keeps only the original style. The floor-companion artwork file now holds just the original cat. A saved desk layout that still names another style opens as the original without error.

### Removed
- The old desk background (city plate, generated building rows and their signs, window frame, desk surface: about 8.5 MB of images) and the cat's windowsill spot; the panoramic layers (about 5.5 MB) replace them.
- The "Warm study" and "Neon nights" desk styles: the sprite inventory picker, the "Change the whole desk vibe" buttons and the two style image files (about 4.7 MB).

## [0.5.0] - 2026-11-11

### Added
- `docker compose up` runs Solace in one container (API and web UI, as `npm start`), on demo data by default; `SOLACE_DEMO=0` uses your own database. Data lives in the named volume `solace-data`, only the web port is published and only on 127.0.0.1, and Garmin sync works when you mount `~/.garminconnect`. CI now also builds the Docker image (job `docker-build`). See README "Run with Docker".
- `npm run demo` starts Solace on fake data (runs, wellness, strength, exams with a resit and a deliberated grade, school tasks, books and manga) on ports 8797 and 5177, next to your real Solace. `npm run cli seed -- --demo [--reset]` writes only `data/demo.sqlite`, never the live database. Garmin sync is disabled in the demo, and the demo ignores your own Google Books key and price table.
- `CREDITS.md` credits the desk, city and avatar artwork and lists the third-party fonts, icons and music with their licenses.
- Dependabot minor and patch PRs merge automatically once CI is green; major updates still need a manual review. Dependabot waits 7 days before proposing a new version.

### Changed
- The start screen and home header now say "SOLACE // ACCESS TERMINAL" and "SOLACE NETWORK", with a new Solace mark (a ring around a rising sun) instead of the corporate-style emblem.
- The desk and avatar artwork in `frontend/src/assets/private/` is now part of the repo, so a fresh clone shows the full desk. `.idea/` is ignored.

### Fixed
- List queries now break ties on the row id, so rows created in the same second always come back in the same order (this made the `seed-demo` determinism test flaky in CI).

### Removed
- The rooftop chase (two third-party characters, gunfire and their sprite atlases) is gone from the city window. The flying train, buildings, billboards and roofs are unchanged.

## [0.4.0] - 2026-11-10

First public release.

### Changed
- Pre-publish cleanup: example values in tests, neutral comments, a shorter README upgrade note, and generic `.gitignore` entries.
- Inter and JetBrains Mono are now self-hosted (no Google Fonts request); licences listed in `frontend/THIRD_PARTY.md`.
- The Garmin re-login command is pinned to `garmin_mcp@0.1.0`; `garmin_fetch.py` credits the code adapted from it.
- App icons are a neutral placeholder "S".
- The UI is now fully English: labels, toasts and empty states, tests and comments. The MISSIONS sub-views are `SCHOOL TERM` / `EXAM TERM` (`#school/school-term`, `#school/exam-term`); old `#school/schoolperiode` and `#school/examenperiode` links still work.

### Removed
- `frontend/DESIGN.md` and `frontend/PRODUCT.md` are no longer tracked.

## [0.3.0] - 2026-11-10

Last private version; development history lives in a private predecessor repository.
