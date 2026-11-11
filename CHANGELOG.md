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
