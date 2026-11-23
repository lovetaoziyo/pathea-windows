const INTRANET_IP = '10.96.8.9';
const RUSTDESK_URL = 'https://soft.pathea.com/software/ruskdesk_windows_x64.zip';

applyI18n();

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
  setStatus(t('checkingNetwork'));
  const reachable = await window.api.ping(INTRANET_IP);
  intranetConnected = reachable;
  if (reachable) {
    setStatus(t('connected'));
  } else {
    setStatus(t('disconnected'));
    showVpnNeededDialog();
  }
}

function showVpnNeededDialog() {
  showDialog(t('vpnRequired'), t('vpnRequiredMsg'), [
    { label: t('connectVpn'), primary: true, onClick: connectVpn },
    { label: t('modifyAccount'), onClick: showLoginCard }
  ]);
}

function onSaveClick() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showDialog(t('notice'), t('pleaseEnterCred'), [{ label: t('ok'), primary: true }]);
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
  setStatus(t('connecting'));
  const result = await window.api.connectVpn(creds.username, creds.password);
  if (result && result.error) {
    setStatus(t('disconnected'));
    showDialog(t('vpnFailed'), result.error, [{ label: t('ok'), primary: true }]);
  }
}

function disconnectVpn() {
  window.api.disconnectVpn();
  vpnConnected = false;
  setStatus(t('disconnected'));
}

function onStatusClick() {
  if (vpnConnected) {
    showDialog(t('vpnConnectedTitle'), t('vpnConnectedMsg'), [
      { label: t('disconnectVpn'), primary: true, onClick: disconnectVpn },
      { label: t('modifyAccount'), onClick: () => { disconnectVpn(); showLoginCard(); usernameInput.focus(); } }
    ]);
  } else if (intranetConnected) {
    showDialog(t('onIntranet'), t('onIntranetMsg'), [
      { label: t('modifyAccount'), onClick: showLoginCard },
      { label: t('close') }
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
    showDialog(t('rustdeskNotInstalled'), t('rustdeskInstallNote') + '\n' + RUSTDESK_URL, [
      { label: t('downloadInstall'), primary: true, onClick: () => window.api.openExternal(RUSTDESK_URL) },
      { label: t('cancel') }
    ]);
  }
});

rustdeskNote.addEventListener('click', () => {
  window.api.openExternal(RUSTDESK_URL);
});

window.api.onVpnState((state) => {
  if (state === 'connected') {
    vpnConnected = true;
    setStatus(t('connected'));
  } else if (state === 'disconnected') {
    vpnConnected = false;
    setStatus(t('disconnected'));
  } else if (state === 'connecting') {
    setStatus(t('connecting'));
  }
});

let vpnLog = '';
window.api.onVpnLog((log) => {
  vpnLog += log;
});

function showLogDialog() {
  const dialog = document.createElement('dialog');
  const pre = document.createElement('pre');
  pre.textContent = vpnLog || t('noLog');
  pre.style.cssText = 'max-height: 400px; overflow: auto; font-size: 12px; white-space: pre-wrap; word-break: break-all;';
  dialog.appendChild(pre);
  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('close');
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
