/* ============================================================
   두마당 (DuMadang) — Electron 데스크톱 앱
   사용: npx electron main.cjs
   ============================================================ */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 380,
    minHeight: 600,
    title: '두마당 — 바둑 · 오목 · 알까기 · 기보',
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    backgroundColor: '#e8edf3',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'suiji-index.html'));

  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// 싱글 인스턴스 락 — 중복 실행 방지
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 애플리케이션 메뉴 (기본 메뉴 유지 — 개발자 도구 접근용)
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
