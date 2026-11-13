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
- Hologram showcase (#42): click the hologram on the desk and the scene zooms in on a body showcase (Esc or a click outside zooms back out; with reduced motion it fades). The hologram body is lit per stat, brighter for a higher level: STAMINA lights the legs, STRENGTH the arms and torso, LEANNESS the outline, each with a callout line and its level and tier. Next to it: today's CONDITION as one aura and one word (READY, STEADY or RECOVER, taken from the existing readiness advice), your JOURNEY since each stat's fresh start (level and value change, a bar and a small chart), and LAST SYNC with the **SYNC GARMIN** button, which after a sync shows what it brought (new runs, km, wellness days, stat changes). While a sync runs the hologram on the desk scans (a sweeping line and the label SYNCING…), also when the showcase is closed; it stands still with MOTION OFF or reduced motion. New hologram artwork (body, zone layers and projector); without the artwork file the showcase still works with the tinted avatar.
- The dashboard has a new `journey` field per stat (start reading since the fresh start plus one point per day), read from the stat history.

### Changed
- Syncing Garmin now has one place: the hologram showcase. The six stat cards at the top of the desk only show your numbers; they are no longer buttons.
- The "stale wellness" marker in the bottom bar now points to the hologram showcase for syncing.

### Removed
- The biomonitor puck on the desk, the BODY SCAN panel, the GARMIN UPLINK panel and the red SYNC button in the bottom bar. A saved desk layout that still holds the puck keeps loading (the puck is simply ignored).

## [0.6.0] - 2026-11-13

### Added
- Solace as a Mac app (Electron, new workspace `desktop/`): `npm run desktop` runs it, `npm run desktop:build` builds an unsigned `Solace.app`. It starts the API server and the web UI itself (or reuses a Solace that already runs on those ports), keeps running when you close the window, launches at login, has an "Always on Top" toggle and the global show/hide shortcut Control+Option+Command+S. It notifies you on the morning of an exam or resit day and when your Garmin login is about to expire or has expired. If it starts its own API but the web port is already answering (for example the Docker demo), it stops with a port-in-use error instead of showing the wrong database. See README "Mac app".
- The server now knows the sky: it asks Open-Meteo for today's sunrise, sunset and the current weather at a configurable location (default Antwerp; `SOLACE_LAT` + `SOLACE_LON` in `.env`, `SOLACE_SKY=0` turns it off), keeps the answer in memory for 30 minutes and adds it to the dashboard as `sky`. If Open-Meteo cannot be reached the dashboard still loads and `sky` is `null`. The demo always uses the default location. From this the desk works out the phase of the day (dawn, day, dusk, night; fixed clock hours without data) and one of four weather moods (clear, fog, rain, snow).
- The fox-cat on the desk is alive: it walks and jumps between its cushion on the tabletop and the top of the monitor, sits down, sometimes grooms itself, sleeps, wakes up and stretches before it moves on. It moves more smoothly: it speeds up into a walk and slows down out of it, turns round in one whole movement instead of flipping, looks up or peeks over the edge before a jump and recovers after landing. It also has new habits: it yawns, watches the city, kneads its cushion, balances on top of the monitor, sniffs around where it arrives, tucks itself into a loaf, and sometimes circles on the spot before it falls asleep. The spots belong to those props, so moving one in the layout editor moves the cat's spot and hiding one takes it off the route (with fewer than two spots left the cat stays on its cushion). Clicking the cat still gets a purr, with a reaction that fits its pose; asleep, it reacts without waking up, and from a loaf it untucks first. It stands still whenever desk motion is paused, and with reduced motion it just sits on the cushion. The cushion is now its own prop ("Cat cushion" in the layout editor; a saved position is kept). In development, `?catMove=<move>` in the URL (for example `?catMove=turn-around`) runs the cat ahead to just before that move.
- The desk follows the time of day: the sky and the city behind the window change through dawn, day, dusk and night, the room gets darker in the evening, and at dusk the desk lamp switches on with a warm glow while the awake monitor lights the desk around it. The changes fade in slowly (at once with reduced motion or MOTION OFF), and the desk checks the clock every minute by itself. The lamp is new artwork with an off and an on picture; the glow is drawn in code. In development, `?skyPhase=dawn|day|dusk|night` in the URL shows one phase without waiting for it.
- The city behind the desk window follows the time of day more closely: hovercar traffic is busy by day and at dusk, lighter at dawn and sparse at night. The flying train no longer passes every 45 seconds: it now comes by at a random moment, 3 to 6 minutes after the previous pass. Everything stands still with reduced motion, MOTION OFF, the layout editor or a hidden tab.
- The desk is lit by its own sources: the lamp casts warm light on the books, the notebook and the tabletop beside it, and the awake monitor casts cool light on the keyboard, the mouse and the tabletop. The light sits on the objects' own shapes, follows a moved, resized or hidden prop in EDIT LAYOUT (a hidden lamp or a hidden or sleeping monitor gives no light), and the cat turns amber or cyan as it walks through either. The lamp now warms up with a short fade instead of a hard switch. When the train passes there is one faint moving glow across the window and the desk. Reduced motion and MOTION OFF show the same lit scene without moving glow.
- The desk monitor wakes up with a short fade, shows a clock, a quiet cursor and an occasional soft line of text; at night it dims a little but stays readable. These are decoration only: they never run a command, sync or save. Inside the terminal, opening a folder fades in, a small dot shows the workspace is open, and the save line flashes once when a save really finishes.
- The desk shows the weather from the sky: rain falls only when it rains (it used to rain all the time), snow drifts down slowly, and fog settles between the city layers (thick on the far skyline, light on the near blocks) and flattens its contrast. Fog and rain soften the daylight contrast of the city, and rain at night makes the window and the desk pick up a little more of the city's colour. Clear and cloudy weather, and a desk without weather data (`SOLACE_SKY=0`, the demo), look clear. The weather is drawn in code at up to 30 frames a second; with MOTION OFF, a hidden tab or the layout editor it stands still, and with reduced motion the fog stays and a few drops or flakes hang still. In development, `?skyMood=clear|fog|rain|snow` in the URL shows one mood.
- The desk radio is a close-up. Click the radio (or a speaker, or RADIO in the header) and the scene zooms in on a large radio (Esc or a click outside zooms back out; with reduced motion it fades instead). It has a station dial (LOFI, JAZZ, BOSSA) with a needle, play/pause, next, and a volume knob you turn by dragging, with the scroll wheel or with the arrow keys. The glass shows the title and artist, the Spotify mark and an OPEN SPOTIFY link (no album art). The last station and volume are remembered. The speakers play a short loop while music plays and stand still on pause, MOTION OFF and reduced motion (not synced to the audio).
- In the Mac app the radio can play your own Spotify playlists, one per station (Spotify Premium, PKCE login inside the app, no client secret; you paste the playlist links in the radio's "Spotify setup"). Set `SOLACE_SPOTIFY_CLIENT_ID` in `.env`. Without Spotify (browser, demo, Docker, no Client ID) the radio plays the 6 local Open Lo-Fi tracks as before. With no active Spotify device the glass says "OPEN SPOTIFY TO PLAY" with buttons to open Spotify or to play the local lofi; the radio never switches source on its own. Tokens stay in the app's own folder, never in the web page. See README "Desk radio".

### Changed
- BODY, STUDY and SHELF now open inside the desk terminal instead of as separate pages. Click the monitor (or TERMINAL in the bottom bar) and the terminal zooms in to fill almost the whole view as its own layer above the desk (the desk is not scaled); Esc or a click outside zooms back out, reduced motion fades, and the desk keeps running behind it. The terminal has three folders: BODY (STATUS, RUNS, STRENGTH with the gym log, VITALS), STUDY (SCHOOL TERM with a course filter, EXAM TERM) and SHELF (BOOKS, MANGA and the Google Books key under BOOKS KEY). The old SCHOOL, TRAINING, MANGA and BOOKS folders, the extra School and Gym log surfaces and the terminal's right-hand side panel are merged into these. Every view is laid out to fit the terminal at 1440x900 and 1280x800 without scrolling the page; only long lists (runs, sessions, tasks, series) scroll inside their own panel. Drafts in the forms survive browsing folders and closing the terminal.
- The top bar (SOLACE wordmark, area buttons) and the phone bottom bar are gone. The run and km totals, the "wellness is stale" marker and the **⟲ SYNC** button moved to the bar at the bottom of the desk (still the only sync trigger).
- Links open the desk with the terminal on that folder and view: `#body/…`, `#study/…`, `#shelf/…` (also `#shelf/manga/<id>` for one series) and every older form (`#training/…`, `#school/…`, `#archives/…`, `#body/body`, `#body/status`, the old Dutch view names). `#desk` and `#home` show the desk with the terminal closed. The terminal reopens where you left it.
- BODY screen copy and colours: "Combat Log" is now RECENT RUNS, "Today's Directive" is TODAY and "Objectives" is GOALS; the readiness verbs ENGAGE / HOLD / STAND DOWN are now TRAIN / EASY / REST; goal bars are cyan while in progress and mint when done (no more red); the weekly report colours each row by group (running cyan, strength amber, body and wellness violet), shows last week brighter than the week before, and sizes the two value columns to their content.
- One Solace visual style. The whole app is one dark navy and purple "night room" like the desk: one token stylesheet (`frontend/src/styles/tokens.css`) holds the colours, fonts, type scale, spacing, borders, glows, layers and motion times, and the desk, the areas, the start screen and the toast all read it. Titles are Oxanium, labels and numbers are Share Tech Mono (never bold) and body text is Inter. Panels now wear a pixel-art frame, buttons have normal, hover and pressed art (40 px high, flat 32 px in dense rows), inputs are 40 px (32 px in the strength log), sub-tabs are an underlined rail instead of filled boxes, and cyan carries interaction while magenta is the one primary action (SYNC). The command bar shows the SOLACE wordmark and four area icons (also in the bottom bar on a phone), the toast is the same in every area (no more khaki version), and "server offline" and "loading" are a proper error panel with a retry button and a loading line. The desk looks the same (the one change inside it: the embedded school and library screens use the new shared style).
- The areas are renamed: HOME is now DESK, COMBAT is BODY, MISSIONS is STUDY and ARCHIVES is SHELF (sub-tab names unchanged). The links are `#desk`, `#body`, `#study`, `#shelf` and `#body/vitals` (VITALS); every old link (`#home`, `#training/…`, `#school/…`, `#archives/…`, `#training/body`, the old Dutch `#school/schoolperiode` and `#school/examenperiode`) still opens the right place and is rewritten to the new name. `#body/status` opens STATUS.
- README screenshots show the new style and the new area names (`docs/screenshots/body.png`, `shelf.png`).
- README is shorter: the roadmap moved to the new `ROADMAP.md`, the Mac app details to `docs/mac-app.md`, the CLI is part of "Development", and the configuration table is replaced by a pointer to `.env.example`. The "Upgrading from ragnarok" note is removed.
- The desk's route and timing helpers (interpolation, fades, repeating schedules) moved from the city code into a shared, tested module (`frontend/src/home/desk/motion.ts`) so other desk animations can reuse them. The city looks and moves exactly as before.
- The desk is now a panoramic room: one large window fills most of the screen above a slim desk band, with no floor and no chair. The room is built from seven separate picture layers (sky, far, middle and near city, an empty billboard frame, the window frame and the desk); each time of day colours the sky and every city layer on its own. The window and the desk are fixed, every prop can still be moved, resized and hidden in EDIT LAYOUT, and the props now stand on the tabletop by default with the cat and its cushion on the right. The scene fills the viewport: on a wider screen some sky is cropped at the top, on a narrower one up to a small strip left and right, never the desk. The flying train and the hovercars fly between the city layers, behind the window frame. A desk layout saved earlier still opens: its moves and sizes now apply from the new default places, so a moved prop can end up in an odd spot; "Reset whole layout" (or "Reset object") followed by "Save layout" puts it back. Saved settings for the window and the desk surface are no longer used.
- The desk keeps only the original style. The floor-companion artwork file now holds just the original cat. A saved desk layout that still names another style opens as the original without error.

### Fixed
- The radio's Spotify setup no longer claims you are outside the Mac app when you run an old build of it: it now says to rebuild (`npm run desktop:build`) and replace `/Applications/Solace.app` (#39). The README and `docs/mac-app.md` explain why a new build must replace the old copy.

### Removed
- The terminal's right-hand side panel (deadline feed, power link, reading queue): the same information is in SCHOOL TERM, STRENGTH and the shelves, and the room is needed for the views.
- The YoRHa look: the khaki light and dark themes, the ☀/☾ theme toggle (a theme saved in the browser is ignored), the scanline/grid/vignette texture overlays, the inverted ink-filled bars and tabs, the corner brackets on panels and the sweep-in button fill.
- JetBrains Mono (the two font files, the `@font-face` rules and its licence entry).
- The headphones on the desk and the old side panel of the radio (mood buttons, track list, equaliser, mute-by-speaker). A saved desk layout that still names the headphones opens without error.
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
