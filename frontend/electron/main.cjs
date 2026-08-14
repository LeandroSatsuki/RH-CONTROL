const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const path = require("path");

const appName = "Nexo";
const isDev = !app.isPackaged || Boolean(process.env.ELECTRON_START_URL);
let updateTimer = null;
let updateReady = false;
let checkForUpdates = null;
let currentUpdateStatus = null;

function credentialsPath() {
  return path.join(app.getPath("userData"), "credentials.json");
}

function sendUpdateStatus(win, payload) {
  currentUpdateStatus = {
    currentVersion: app.getVersion(),
    ...payload
  };
  if (!win || win.isDestroyed()) return;
  win.webContents.send("updater:status", currentUpdateStatus);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: appName,
    backgroundColor: "#f4f6f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
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

  return win;
}

function setupAutoUpdates(win) {
  if (isDev) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.info("[updater] verificando atualizacoes");
    sendUpdateStatus(win, { state: "checking", message: "Verificando atualizações..." });
  });

  autoUpdater.on("update-available", info => {
    console.info("[updater] atualizacao disponivel", info.version);
    sendUpdateStatus(win, {
      state: "available",
      version: info.version,
      message: `Atualização ${info.version} encontrada. Baixando em segundo plano...`
    });
  });

  autoUpdater.on("update-not-available", info => {
    console.info("[updater] sistema atualizado", info.version);
    sendUpdateStatus(win, {
      state: "idle",
      version: info.version,
      message: `Nexo ${app.getVersion()} está atualizado.`
    });
  });

  autoUpdater.on("error", error => {
    console.error("[updater] erro ao verificar atualizacoes", error);
    sendUpdateStatus(win, {
      state: "error",
      message: "Não foi possível verificar atualizações agora."
    });
  });

  autoUpdater.on("download-progress", progress => {
    console.info("[updater] download", Math.round(progress.percent), "%");
    sendUpdateStatus(win, {
      state: "downloading",
      version: progress.version,
      percent: Math.round(progress.percent),
      message: `Baixando atualização: ${Math.round(progress.percent)}%`
    });
  });

  autoUpdater.on("update-downloaded", async info => {
    console.info("[updater] download concluido", info.version);
    updateReady = true;
    sendUpdateStatus(win, {
      state: "ready",
      version: info.version,
      message: `Atualização ${info.version} pronta para instalar.`
    });
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1,
      title: appName,
      message: "Uma nova versão está pronta para instalar.",
      detail: "A atualização já foi baixada. Reinicie o aplicativo para aplicar a nova versão."
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  let lastCheckAt = 0;
  const check = (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheckAt < 5 * 60 * 1000) return;
    lastCheckAt = now;
    autoUpdater.checkForUpdates().catch(error => {
      console.error("[updater] falha ao buscar atualizacoes", error);
    });
  };

  checkForUpdates = () => check(true);
  setTimeout(() => check(true), 5000);
  win.on("focus", () => check());
  updateTimer = setInterval(() => check(true), 1000 * 60 * 60);
}

app.setName(appName);
app.setAppUserModelId(appName);

ipcMain.on("updater:restart", () => {
  if (updateReady) {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.on("updater:check", () => {
  if (checkForUpdates) checkForUpdates();
});

ipcMain.handle("updater:get-status", () => currentUpdateStatus || {
  state: "idle",
  currentVersion: app.getVersion(),
  version: app.getVersion(),
  message: `Nexo ${app.getVersion()} instalado.`
});

ipcMain.handle("credentials:load", () => {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(credentialsPath())) return null;
    const stored = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    return {
      username: String(stored.username || ""),
      password: safeStorage.decryptString(Buffer.from(String(stored.password || ""), "base64"))
    };
  } catch {
    return null;
  }
});

ipcMain.handle("credentials:save", (_event, credentials) => {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const payload = {
    username: String(credentials?.username || ""),
    password: safeStorage.encryptString(String(credentials?.password || "")).toString("base64")
  };
  fs.writeFileSync(credentialsPath(), JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  return true;
});

ipcMain.handle("credentials:clear", () => {
  try {
    fs.unlinkSync(credentialsPath());
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
});

app.whenReady().then(() => {
  const win = createWindow();
  setupAutoUpdates(win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  if (process.platform !== "darwin") app.quit();
});
