// 中英文翻译表
const translations = {
  zh: {
    title: 'Pathea助手',
    statusDisconnected: '未连接',
    userLogin: '用户登录',
    account: '账号',
    password: '密码',
    save: '保存',
    internalServices: '内部服务',
    ad: 'AD 账号密码管理',
    itsm: 'IT 服务支持',
    portal: 'Pathea 门户导航',
    wiki: 'Wiki 知识库',
    rustdesk: 'RustDesk 远程协助',
    rustdeskNote: '如无法跳转请点此下载',
    vpnLogNote: '查看 VPN 日志',
    checkingNetwork: '检测网络…',
    connected: '已连接',
    disconnected: '未连接',
    connecting: '连接中…',
    vpnRequired: '需要连接 VPN',
    vpnRequiredMsg: '当前不在内网，需要连接 VPN 才能访问内部服务',
    connectVpn: '连接 VPN',
    disconnectVpn: '断开 VPN',
    modifyAccount: '修改账号',
    pleaseEnterCred: '请输入账号和密码',
    vpnConnectedTitle: 'VPN 已连接',
    vpnConnectedMsg: '已连接 VPN，可断开或修改账号',
    onIntranet: '已在内网',
    onIntranetMsg: '当前已在内网，无需连接 VPN',
    close: '关闭',
    cancel: '取消',
    ok: '确定',
    notice: '提示',
    vpnFailed: 'VPN 连接失败',
    rustdeskNotInstalled: 'RustDesk 未安装',
    rustdeskInstallNote: '如未安装，请点击下载安装：',
    downloadInstall: '下载安装',
    noLog: '（暂无日志）',
    vpnLog: 'VPN 日志'
  },
  en: {
    title: 'Pathea Assistant',
    statusDisconnected: 'Disconnected',
    userLogin: 'User Login',
    account: 'Account',
    password: 'Password',
    save: 'Save',
    internalServices: 'Internal Services',
    ad: 'AD Account Management',
    itsm: 'IT Service Support',
    portal: 'Pathea Portal',
    wiki: 'Wiki',
    rustdesk: 'RustDesk Remote Desktop',
    rustdeskNote: 'Click to download if it does not open',
    vpnLogNote: 'View VPN Log',
    checkingNetwork: 'Checking network…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    vpnRequired: 'VPN Required',
    vpnRequiredMsg: 'Not on the intranet. Connect VPN to access internal services.',
    connectVpn: 'Connect VPN',
    disconnectVpn: 'Disconnect VPN',
    modifyAccount: 'Modify Account',
    pleaseEnterCred: 'Please enter account and password',
    vpnConnectedTitle: 'VPN Connected',
    vpnConnectedMsg: 'VPN connected. You can disconnect or modify account.',
    onIntranet: 'On Intranet',
    onIntranetMsg: 'You are on the intranet, no VPN needed.',
    close: 'Close',
    cancel: 'Cancel',
    ok: 'OK',
    notice: 'Notice',
    vpnFailed: 'VPN Connection Failed',
    rustdeskNotInstalled: 'RustDesk Not Installed',
    rustdeskInstallNote: 'If not installed, click to download and install: ',
    downloadInstall: 'Download & Install',
    noLog: '(No log)',
    vpnLog: 'VPN Log'
  }
};

function getLang() {
  const l = (navigator.language || 'zh').toLowerCase();
  return l.startsWith('zh') ? 'zh' : 'en';
}

const LANG = getLang();

function t(key) {
  return translations[LANG][key] || translations.zh[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.title = t('title');
}
