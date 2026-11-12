// Runs in the Solace window before the web UI. Exposes what the web UI may ask of the app: "the Garmin sync said the
// login expired" (a system notification) and the Spotify connection of the desk radio (spotify.ts keeps the tokens).
// CommonJS because sandboxed preloads cannot be ESM.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solaceDesktop', {
  garminAuthExpired: () => ipcRenderer.send('garmin-auth-expired'),
  spotify: {
    status: () => ipcRenderer.invoke('spotify-status'),
    login: () => ipcRenderer.invoke('spotify-login'),
    logout: () => ipcRenderer.invoke('spotify-logout'),
    openApp: () => ipcRenderer.invoke('spotify-open-app'),
    request: (req) => ipcRenderer.invoke('spotify-request', req),
  },
});
