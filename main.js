const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let vpnCleanedUp = false;
const MANAGEMENT_PORT = 7505;

// 快捷方式定义
const SHORTCUTS = [
  { label: 'AD 账号密码管理', url: 'https://account.patheagames.com:9252' },
  { label: 'IT 服务支持', url: 'https://itsm.pathea.com' },
  { label: 'Pathea 门户导航', url: 'https://hao.pathea.com' },
  { label: 'Wiki 知识库', url: 'https://wiki.pathea.com' },
  { label: 'RustDesk 远程协助', rustdesk: true }
];

const RUSTDESK_URL = 'https://soft.pathea.com/software/ruskdesk_windows_x64.zip';

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
    width: 420,
    height: 760,
    minWidth: 360,
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
  // 点关闭时最小化到托盘，不退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function launchRustdesk() {
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
}

function getCertPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'main1.cer')
    : path.join(__dirname, 'resources', 'main1.cer');
}

// 把根证书安装到「受信任的根证书颁发机构」，让默认浏览器信任内部 HTTPS 站点
function trustRootCert() {
  const certPath = getCertPath();
  if (!fs.existsSync(certPath)) return;
  exec(`certutil -user -addstore "Root" "${certPath}"`, { windowsHide: true }, () => {
    // 已安装会返回错误码，忽略即可
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'resources', 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('Pathea助手');
  tray.on('click', () => showMainWindow());

  const shortcutItems = SHORTCUTS.map((s) => ({
    label: s.label,
    click: () => {
      if (s.rustdesk) {
        if (!launchRustdesk()) {
          shell.openExternal(RUSTDESK_URL);
        }
      } else {
        shell.openExternal(s.url);
      }
    }
  }));

  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => showMainWindow() },
    { type: 'separator' },
    ...shortcutItems,
    { type: 'separator' },
    { label: '连接 VPN', click: () => connectVpnFromTray() },
    { label: '断开 VPN', click: () => signalOpenVpnTerm() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

function connectVpnFromTray() {
  const creds = loadCredentials();
  if (!creds || !creds.username || !creds.password) {
    showMainWindow();
    return;
  }
  showMainWindow();
  doConnectVpn(creds.username, creds.password);
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
  const scriptPath = path.join(app.getPath('userData'), 'start-openvpn.ps1');
  const argStr = args.map((a) => `"${a.replace(/"/g, '`"')}"`).join(' ');
  const script = `Start-Process -FilePath '${openvpnPath.replace(/'/g, "''")}' -ArgumentList '${argStr}' -Verb RunAs -WindowStyle Hidden`;
  fs.writeFileSync(scriptPath, script, 'utf8');
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { windowsHide: true }, (err, stdout, stderr) => {
      const out = ((stdout || '') + (stderr || '')).trim();
      if (out) {
        mainWindow && mainWindow.webContents.send('vpn-log', '[PS] ' + out + '\n');
      }
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

function doConnectVpn(username, password) {
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
  return doConnectVpn(username, password);
});

ipcMain.handle('disconnect-vpn', async () => {
  await signalOpenVpnTerm();
  return true;
});

ipcMain.handle('launch-rustdesk', () => {
  return launchRustdesk();
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  trustRootCert();
  createWindow();
  createTray();
});

// 退出前优雅断开 VPN，避免残留网卡/路由
app.on('before-quit', (event) => {
  if (vpnCleanedUp) return;
  event.preventDefault();
  vpnCleanedUp = true;
  signalOpenVpnTerm().then(() => app.quit());
});

app.on('activate', () => {
  showMainWindow();
});
