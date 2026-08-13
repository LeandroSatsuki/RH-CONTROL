const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexoUpdater", {
  onStatus(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
  restart() {
    ipcRenderer.send("updater:restart");
  },
  check() {
    ipcRenderer.send("updater:check");
  }
});

contextBridge.exposeInMainWorld("nexoCredentials", {
  load: () => ipcRenderer.invoke("credentials:load"),
  save: credentials => ipcRenderer.invoke("credentials:save", credentials),
  clear: () => ipcRenderer.invoke("credentials:clear")
});
