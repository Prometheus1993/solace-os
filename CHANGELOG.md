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

### Changed
- Pre-publish cleanup: example values in tests, neutral comments, a shorter README upgrade note, and generic `.gitignore` entries (#47).
- Inter and JetBrains Mono are now self-hosted (no Google Fonts request); licences listed in `frontend/THIRD_PARTY.md` (#47).
- The Garmin re-login command is pinned to `garmin_mcp@0.1.0`; `garmin_fetch.py` credits the code adapted from it (#47).
- App icons are a neutral placeholder "S" (#47).
- The UI is now fully English: labels, toasts and empty states, tests and comments. The MISSIONS sub-views are `SCHOOL TERM` / `EXAM TERM` (`#school/school-term`, `#school/exam-term`); old `#school/schoolperiode` and `#school/examenperiode` links still work (#48).

### Removed
- `frontend/DESIGN.md` and `frontend/PRODUCT.md` are no longer tracked (#47).

## [0.3.0] - 2026-11-10

Initial public release; development history lives in a private predecessor repository.
