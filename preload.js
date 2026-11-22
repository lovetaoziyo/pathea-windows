const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: (host) => ipcRenderer.invoke('ping', host),
  saveCredentials: (username, password) => ipcRenderer.invoke('save-credentials', username, password),
  loadCredentials: () => ipcRenderer.invoke('load-credentials'),
  connectVpn: (username, password) => ipcRenderer.invoke('connect-vpn', username, password),
  disconnectVpn: () => ipcRenderer.invoke('disconnect-vpn'),
  launchRustdesk: () => ipcRenderer.invoke('launch-rustdesk'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onVpnState: (callback) => ipcRenderer.on('vpn-state', (event, state) => callback(state)),
  onVpnLog: (callback) => ipcRenderer.on('vpn-log', (event, log) => callback(log))
});
