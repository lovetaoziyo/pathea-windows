const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let vpnProcess = null;

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
    if (!vpnProcess) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        if (vpnProcess) {
          try { vpnProcess.kill(); } catch (e) {}
          vpnProcess = null;
        }
        resolve();
      }, 800);
    };
    const socket = net.connect(MANAGEMENT_PORT, '127.0.0.1', () => {
      socket.write('signal SIGTERM\n');
    });
    socket.on('error', finish);
    socket.on('close', finish);
    setTimeout(finish, 3000);
  });
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

    if (!fs.existsSync(openvpnPath)) {
      return { error: '未找到 openvpn.exe：' + openvpnPath };
    }
    if (!fs.existsSync(configPath)) {
      return { error: '未找到 pathea.ovpn：' + configPath };
    }

    fs.writeFileSync(credsPath, `${username}\n${password}`, 'utf8');

    // 断开旧的
    signalOpenVpnTerm();

    vpnProcess = spawn(openvpnPath, [
      '--config', configPath,
      '--auth-user-pass', credsPath,
      '--management', '127.0.0.1', String(MANAGEMENT_PORT),
      '--suppress-timestamps'
    ], { windowsHide: true });

    vpnProcess.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.includes('Initialization Sequence Completed')) {
        mainWindow && mainWindow.webContents.send('vpn-state', 'connected');
      }
      mainWindow && mainWindow.webContents.send('vpn-log', text);
    });

    vpnProcess.stderr.on('data', (data) => {
      mainWindow && mainWindow.webContents.send('vpn-log', data.toString());
    });

    vpnProcess.on('exit', () => {
      vpnProcess = null;
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

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

app.whenReady().then(createWindow);

// 退出前优雅断开 VPN，避免残留网卡/路由
let vpnCleanedUp = false;
app.on('before-quit', (event) => {
  if (vpnCleanedUp || !vpnProcess) return;
  event.preventDefault();
  signalOpenVpnTerm().then(() => {
    vpnCleanedUp = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
