import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { downloadVideo, checkAndFixAspectRatio, processOutputFilename } from './download';

// Configure logging
log.transports.file.level = 'info';
log.info('Application starting...');

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  // Find where your Angular app is built
  const fs = require('fs');
  const angularPath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser/index.html');
  const rootPath = path.join(__dirname, '../index.html');

  // Log some debug info
  console.log('Angular path exists:', fs.existsSync(angularPath));
  console.log('Root path exists:', fs.existsSync(rootPath));

  // Try to load the Angular app, fall back to the basic HTML if not found
  if (fs.existsSync(angularPath)) {
    mainWindow.loadFile(angularPath);
  } else {
    console.log('Angular build not found, loading basic HTML');
    mainWindow.loadFile(rootPath);
  }

  mainWindow.setMenuBarVisibility(false);
  
  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('download-video', async (_, options) => {
  try {
    log.info(`Starting download for: ${options.url}`);
    
    // Ensure we have a valid download directory
    const downloadFolder = options.outputDir || app.getPath('downloads');
    
    // Start the download process
    const result = await downloadVideo(options, downloadFolder);

    // Process the output filename if download was successful
    if (result.success && result.outputFile) {
      let outputFile = result.outputFile;
      
      // Add date prefix to filename if needed
      outputFile = await processOutputFilename(outputFile);
      
      // Fix aspect ratio if requested
      if (options.fixAspectRatio) {
        const fixedFile = await checkAndFixAspectRatio(outputFile, mainWindow);
        if (fixedFile) {
          outputFile = fixedFile;
        }
      }
      
      return {
        success: true,
        outputFile
      };
    }
    
    return result;
  } catch (error) {
    log.error('Download error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
});

ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  }) as unknown as { canceled: boolean; filePaths: string[] };

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Open file in native application
ipcMain.handle('open-file', (_, filePath) => {
  return shell.openPath(filePath);
});

// Show file in folder
ipcMain.handle('show-in-folder', (_, filePath) => {
  return shell.showItemInFolder(filePath);
});

// Install update
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Handle app update events
autoUpdater.on('update-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-available');
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});