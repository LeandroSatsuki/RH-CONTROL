const { app, BrowserWindow } = require("electron");
const path = require("path");

const appName = "Sistema Indicadores de Folha - Demo";

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: appName,
    backgroundColor: "#f4f6f9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.setName(appName);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
