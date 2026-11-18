const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('api', {
  login: invoke('auth:login'),
  restore: invoke('auth:restore'),
  logout: invoke('auth:logout'),
  getProfile: invoke('profile:get'),
  setCape: invoke('cape:set'),
  uploadSkin: invoke('skin:upload'),
  listVersions: invoke('versions:list'),
  listInstalled: invoke('versions:installed'),
  launch: invoke('game:launch'),
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  pickJava: invoke('dialog:pickJava'),
  pickDir: invoke('dialog:pickDir'),
  openGameDir: invoke('shell:openGameDir'),
  openLog: invoke('shell:openLog'),
  listNews: invoke('news:list'),
  cosmeticsInfo: invoke('cosmetics:info'),
  appVersion: invoke('app:version'),
  checkUpdate: invoke('update:check'),
  installUpdate: invoke('update:install'),
  onUpdate: on('update:state'),
  minimize: () => ipcRenderer.send('win:min'),
  close: () => ipcRenderer.send('win:close'),
  onProgress: on('game:progress'),
  onLog: on('game:log'),
  onState: on('game:state'),
});
