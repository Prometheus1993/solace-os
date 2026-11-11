// Runs in the Solace window before the web UI. Exposes one call: the web UI reports "the Garmin sync said the
// login expired" so the app can show a system notification. CommonJS because sandboxed preloads cannot be ESM.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('solaceDesktop', {
  garminAuthExpired: () => ipcRenderer.send('garmin-auth-expired'),
});
