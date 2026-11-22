const INTRANET_IP = '10.96.8.9';
const RUSTDESK_URL = 'https://soft.pathea.com/software/ruskdesk_windows_x64.zip';

const statusText = document.getElementById('statusText');
const loginCard = document.getElementById('loginCard');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const saveButton = document.getElementById('saveButton');
const rustdeskShortcut = document.getElementById('rustdeskShortcut');
const rustdeskNote = document.getElementById('rustdeskNote');

let credentialsSaved = false;
let intranetConnected = false;
let vpnConnected = false;

statusText.style.cursor = 'pointer';

function setStatus(text) {
  statusText.textContent = text;
}

function showLoginCard() {
  loginCard.style.display = 'flex';
}

function hideLoginCard() {
  loginCard.style.display = 'none';
}

function showDialog(title, message, buttons) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <h3></h3>
    <p></p>
    <div class="actions"></div>
  `;
  dialog.querySelector('h3').textContent = title;
  dialog.querySelector('p').textContent = message || '';
  if (!message) dialog.querySelector('p').style.display = 'none';
  const actions = dialog.querySelector('.actions');
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    btn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      if (b.onClick) b.onClick();
    });
    actions.appendChild(btn);
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

async function pingCheck() {
  setStatus('检测网络…');
  const reachable = await window.api.ping(INTRANET_IP);
  intranetConnected = reachable;
  if (reachable) {
    setStatus('已连接');
  } else {
    setStatus('未连接');
    showVpnNeededDialog();
  }
}

function showVpnNeededDialog() {
  showDialog('需要连接 VPN', '当前不在内网，需要连接 VPN 才能访问内部服务', [
    { label: '连接 VPN', primary: true, onClick: connectVpn },
    { label: '修改账号', onClick: showLoginCard }
  ]);
}

function onSaveClick() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showDialog('提示', '请输入账号和密码', [{ label: '确定', primary: true }]);
    return;
  }
  window.api.saveCredentials(username, password);
  credentialsSaved = true;
  hideLoginCard();
  pingCheck();
}

async function connectVpn() {
  const creds = await window.api.loadCredentials();
  if (!creds || !creds.username || !creds.password) {
    showLoginCard();
    return;
  }
  setStatus('连接中…');
  const result = await window.api.connectVpn(creds.username, creds.password);
  if (result && result.error) {
    setStatus('未连接');
    showDialog('VPN 连接失败', result.error, [{ label: '确定', primary: true }]);
  }
}

function disconnectVpn() {
  window.api.disconnectVpn();
  vpnConnected = false;
  setStatus('未连接');
}

function onStatusClick() {
  if (vpnConnected) {
    showDialog('VPN 已连接', '已连接 VPN，可断开或修改账号', [
      { label: '断开 VPN', primary: true, onClick: disconnectVpn },
      { label: '修改账号', onClick: () => { disconnectVpn(); showLoginCard(); usernameInput.focus(); } }
    ]);
  } else if (intranetConnected) {
    showDialog('已在内网', '当前已在内网，无需连接 VPN', [
      { label: '修改账号', onClick: showLoginCard },
      { label: '关闭' }
    ]);
  } else {
    showVpnNeededDialog();
  }
}

saveButton.addEventListener('click', onSaveClick);
statusText.addEventListener('click', onStatusClick);

document.querySelectorAll('.shortcut[data-url]').forEach((el) => {
  el.addEventListener('click', () => {
    window.api.openExternal(el.dataset.url);
  });
});

rustdeskShortcut.addEventListener('click', async () => {
  const ok = await window.api.launchRustdesk();
  if (!ok) {
    showDialog('RustDesk 未安装', '如未安装，请点击下载安装：\n' + RUSTDESK_URL, [
      { label: '下载安装', primary: true, onClick: () => window.api.openExternal(RUSTDESK_URL) },
      { label: '取消' }
    ]);
  }
});

rustdeskNote.addEventListener('click', () => {
  window.api.openExternal(RUSTDESK_URL);
});

window.api.onVpnState((state) => {
  if (state === 'connected') {
    vpnConnected = true;
    setStatus('已连接');
  } else if (state === 'disconnected') {
    vpnConnected = false;
    setStatus('未连接');
  }
});

let vpnLog = '';
window.api.onVpnLog((log) => {
  vpnLog += log;
});

function showLogDialog() {
  const dialog = document.createElement('dialog');
  const pre = document.createElement('pre');
  pre.textContent = vpnLog || '（暂无日志）';
  pre.style.cssText = 'max-height: 400px; overflow: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all;';
  dialog.appendChild(pre);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.className = 'primary';
  closeBtn.style.marginTop = '12px';
  closeBtn.addEventListener('click', () => { dialog.close(); dialog.remove(); });
  dialog.appendChild(closeBtn);
  document.body.appendChild(dialog);
  dialog.showModal();
}

document.getElementById('vpnLogNote').addEventListener('click', showLogDialog);

// 初始化
(async () => {
  const creds = await window.api.loadCredentials();
  credentialsSaved = !!(creds && creds.username && creds.password);
  if (credentialsSaved) {
    usernameInput.value = creds.username;
    passwordInput.value = creds.password;
    hideLoginCard();
    pingCheck();
  } else {
    showLoginCard();
  }
})();
