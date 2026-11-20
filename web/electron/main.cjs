// Desktop shell for the Next dashboard.
// Env: DESKTOP_URL (load an existing server, no spawn), DESKTOP_PORT (default 3210),
// DESKTOP_TEST_COMPACT=1 (demo/test hook: unmaximize 5 s after load to show the compact widget).
const { app, BrowserWindow, dialog, shell, screen } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const port = Number(process.env.DESKTOP_PORT) || 3210;
const url = process.env.DESKTOP_URL || `http://localhost:${port}/`;
let child = null;
let win = null;

function killServer() {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill();
  child = null;
}

function startServer() {
  const mode = fs.existsSync(path.join(root, ".next", "BUILD_ID")) ? "start" : "dev";
  const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
  // ELECTRON_RUN_AS_NODE makes the Electron binary act as plain Node.
  child = spawn(process.execPath, [next, mode, "-p", String(port)], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", () => (child = null));
}

async function waitReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function compact() {
  const { workArea: a } = screen.getDisplayMatching(win.getBounds());
  const [w, h] = [420, 720];
  win.setSize(w, h);
  win.setPosition(a.x + a.width - w - 16, a.y + a.height - h - 16);
  win.setAlwaysOnTop(true, "floating");
  console.log(`[desktop] compact ${win.getSize().join("x")} alwaysOnTop=${win.isAlwaysOnTop()}`);
}

function createWindow() {
  win = new BrowserWindow({
    backgroundColor: "#ffffff",
    minWidth: 360,
    minHeight: 560,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.maximize();
  win.show();
  win.on("unmaximize", compact);
  win.on("leave-full-screen", compact);
  win.on("maximize", () => win.setAlwaysOnTop(false));
  win.on("enter-full-screen", () => win.setAlwaysOnTop(false));
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith("http") && new URL(u).origin === new URL(url).origin) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 860, height: 820, autoHideMenuBar: true } };
    }
    if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, u) => {
    if (new URL(u).origin !== new URL(url).origin && !u.startsWith("data:")) {
      e.preventDefault();
      if (/^https?:/i.test(u)) shell.openExternal(u);
    }
  });
  win.loadURL(
    "data:text/html,<body style='font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:%23555'>Starting%E2%80%A6</body>",
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("before-quit", killServer);
  app.on("window-all-closed", () => {
    killServer();
    app.quit();
  });
  app.whenReady().then(async () => {
    createWindow();
    if (!process.env.DESKTOP_URL) startServer();
    if (!(await waitReady())) {
      dialog.showErrorBox("Server did not start", `${url} not reachable after 90 s.`);
      app.quit();
      return;
    }
    console.log(`[desktop] server ready ${url}`);
    await win.loadURL(url);
    console.log(`[desktop] loaded ${url}`);
    if (process.env.DESKTOP_TEST_COMPACT === "1") setTimeout(() => win.unmaximize(), 5000);
  });
}
