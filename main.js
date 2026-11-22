const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const MANAGEMENT_PORT = 7505;

// 忽略内部服务 SSL 证书错误（内部 CA）
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

function getOpenVpnDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'openvpn')
    : path.join(__dirname, 'resources', 'openvpn');
}

function getCredentialsPath() {
  return path.join(app.getPath('userData'), 'credentials.json');
}

function saveCredentials(username, password) {
  fs.writeFileSync(getCredentialsPath(), JSON.stringify({ username, password }), 'utf8');
}

function loadCredentials() {
  try {
    return JSON.parse(fs.readFileSync(getCredentialsPath(), 'utf8'));
  } catch (e) {
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
}

// 通过管理接口发 SIGTERM，让 openvpn 优雅退出并清理路由/DNS/网卡
function signalOpenVpnTerm() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const sock = net.connect(MANAGEMENT_PORT, '127.0.0.1', () => {
      sock.write('signal SIGTERM\n');
      sock.end();
    });
    sock.on('error', done);
    sock.on('close', done);
    setTimeout(done, 3000);
  });
}

// 提升权限启动 openvpn（UAC 弹窗），否则加不了路由/DNS
function startOpenVpnElevated(openvpnPath, args) {
  const argStr = args.map((a) => `"${a}"`).join(' ');
  const psCmd = `Start-Process -FilePath "${openvpnPath}" -ArgumentList '${argStr}' -Verb RunAs -WindowStyle Hidden`;
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -Command "${psCmd}"`, { windowsHide: true }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// 轮询日志检测连接状态
function pollOpenVpnLog(logPath) {
  let lastLen = 0;
  let connectedSent = false;
  const timer = setInterval(() => {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      if (content.length > lastLen) {
        const delta = content.slice(lastLen);
        lastLen = content.length;
        mainWindow && mainWindow.webContents.send('vpn-log', delta);
      }
      if (!connectedSent && content.includes('Initialization Sequence Completed')) {
        connectedSent = true;
        mainWindow && mainWindow.webContents.send('vpn-state', 'connected');
      }
    } catch (e) {
      /* 日志文件可能还没创建 */
    }
  }, 1000);
  setTimeout(() => {
    clearInterval(timer);
    if (!connectedSent) {
      mainWindow && mainWindow.webContents.send('vpn-state', 'disconnected');
    }
  }, 45000);
}

// ---- IPC ----

ipcMain.handle('ping', (event, host) => {
  return new Promise((resolve) => {
    exec(`ping -n 1 -w 2000 ${host}`, { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
});

ipcMain.handle('save-credentials', (event, username, password) => {
  saveCredentials(username, password);
  return true;
});

ipcMain.handle('load-credentials', () => {
  return loadCredentials();
});

ipcMain.handle('connect-vpn', (event, username, password) => {
  try {
    const openvpnDir = getOpenVpnDir();
    const openvpnPath = path.join(openvpnDir, 'openvpn.exe');
    const configPath = path.join(openvpnDir, 'pathea.ovpn');
    const credsPath = path.join(app.getPath('userData'), 'creds.txt');
    const logPath = path.join(app.getPath('userData'), 'openvpn.log');

    if (!fs.existsSync(openvpnPath)) {
      return { error: '未找到 openvpn.exe：' + openvpnPath };
    }
    if (!fs.existsSync(configPath)) {
      return { error: '未找到 pathea.ovpn：' + configPath };
    }

    fs.writeFileSync(credsPath, `${username}\n${password}`, 'utf8');
    fs.writeFileSync(logPath, '', 'utf8');

    // 断开旧的
    signalOpenVpnTerm();

    const args = [
      '--config', configPath,
      '--auth-user-pass', credsPath,
      '--management', '127.0.0.1', String(MANAGEMENT_PORT),
      '--log', logPath,
      '--suppress-timestamps'
    ];

    startOpenVpnElevated(openvpnPath, args).then(() => {
      pollOpenVpnLog(logPath);
    }).catch((err) => {
      mainWindow && mainWindow.webContents.send('vpn-log', '启动失败: ' + err.message);
      mainWindow && mainWindow.webContents.send('vpn-state', 'disconnected');
    });

    return true;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('disconnect-vpn', async () => {
  await signalOpenVpnTerm();
  return true;
});

ipcMain.handle('launch-rustdesk', () => {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'RustDesk', 'rustdesk.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'RustDesk', 'rustdesk.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'RustDesk', 'rustdesk.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'RustDesk', 'rustdesk.exe')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        shell.openPath(p);
        return true;
      }
    } catch (e) {
      /* 忽略 */
    }
  }
  return false;
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

app.whenReady().then(createWindow);

// 退出前优雅断开 VPN，避免残留网卡/路由
let vpnCleanedUp = false;
app.on('before-quit', (event) => {
  if (vpnCleanedUp) return;
  event.preventDefault();
  vpnCleanedUp = true;
  signalOpenVpnTerm().then(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
