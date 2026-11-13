# Mac app

Solace can run as a Mac app (Electron), so you no longer need `npm start`. The app is a thin shell: it starts the
same two processes as `npm start` (API server and web UI, on Node 22) from this repo folder and shows the web UI in
one window. It uses the same database and the same `.env` as `npm start`.

- **Reuse:** if Solace already answers on port 8787 or 5174 (for example from `npm start`), the app uses it and does
  not start a second one. Quitting (Cmd+Q) stops only the processes the app started itself.
- **Closing the window** hides it; the app and its servers keep running. Quit with Cmd+Q.
- **Show/hide shortcut:** Control+Option+Command+S (⌃⌥⌘S), from anywhere.
- **Menu "Solace":** "Launch at Login" (on by default) and "Always on Top" (off by default).
- **Notifications:** on the morning (06:00 to 12:00) of an exam or resit day; when your Garmin login is about
  5.5 months old (the age of the `~/.garminconnect` folder; no call to Garmin); and right away when a sync reports
  that the login expired. The app never starts a sync by itself. Allow notifications for Solace in System Settings.
- If the API server cannot start (for example the legacy-database guard), the app shows the error and quits; it does not retry.

Try it without building: `npm run desktop` (launch at login is unavailable in this mode).

## Build it yourself (unsigned, macOS)

There is no download: you build the app on your own Mac. It is unsigned and only works on the Mac that built it.

```sh
npm install             # once, as in the [setup](../README.md#requirements-and-setup)
npm run cli seed        # once, if you have no database yet
npm run desktop:build   # downloads Electron (about 100 MB) and writes desktop/dist/Solace-darwin-<arch>/Solace.app
```

Open `Solace.app` from that folder, or drag it to `/Applications` first. To update an installed copy, quit Solace (⌘Q) and replace `/Applications/Solace.app` with the new build from `desktop/dist/`: Solace allows only one running instance, so opening a new build while the old one runs just focuses the old window. The app remembers where this repo folder is:
if you move or rename the folder, build again. After a `git pull`, restart the app; rebuild only when `desktop/` changed.

The app needs Node 22 from the Homebrew `node@22` keg or from nvm (the same lookup as `start.sh`).
For a test run next to your real Solace, use other ports and a scratch database:
`SOLACE_DB=$(mktemp -d)/t.sqlite PORT=8799 SOLACE_WEB_PORT=5175 npm run desktop`.
