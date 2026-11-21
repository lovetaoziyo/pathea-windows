const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let vpnProcess = null;

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

// ---- IPC ----

// ping 内网 IP（Windows: ping -n 1 -w 2000）
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
    if (vpnProcess) {
      vpnProcess.kill();
      vpnProcess = null;
    }

    vpnProcess = spawn(openvpnPath, [
      '--config', configPath,
      '--auth-user-pass', credsPath,
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

ipcMain.handle('disconnect-vpn', () => {
  if (vpnProcess) {
    vpnProcess.kill();
    vpnProcess = null;
  }
  return true;
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
