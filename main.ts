// clippy/main.ts
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { downloadVideo, checkAndFixAspectRatio, processOutputFilename } from './download';

// Add these imports
import * as http from 'http';
import * as https from 'https';
const fs = require('fs');

// Configure logging
log.transports.file.level = 'info';
log.info('Application starting...');

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

/**
 * Setup binary files by ensuring they have executable permissions on macOS/Linux
 */
function setupBinaries(): void {
  if (process.platform === 'win32') {
    // No need to set permissions on Windows
    return;
  }

  // Determine the location of binaries based on environment
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const binPath = isDevelopment 
    ? path.join(process.cwd(), 'bin')  // Development: root/bin
    : path.join(process.resourcesPath || app.getAppPath(), 'bin');  // Production: resources/bin
    
  log.info(`Setting up binaries at: ${binPath}`);
  
  if (fs.existsSync(binPath)) {
    // List of binaries to make executable
    const binaries = ['yt-dlp', 'ffmpeg', 'ffprobe'];
    
    binaries.forEach(binary => {
      const binaryPath = path.join(binPath, binary);
      
      if (fs.existsSync(binaryPath)) {
        log.info(`Setting executable permissions for: ${binaryPath}`);
        try {
          fs.chmodSync(binaryPath, 0o755);
        } catch (error) {
          log.error(`Failed to set permissions for ${binaryPath}:`, error);
        }
      } else {
        log.warn(`Binary not found: ${binaryPath}`);
      }
    });
  } else {
    log.warn(`Bin directory not found: ${binPath}`);
  }
}

// Create main application window
function createWindow(): void {
  // Setup binary permissions
  setupBinaries();

  // Determine if we're in development mode
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,  // Reasonable minimum width
    minHeight: 600, // Reasonable minimum height
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: true, // Enable web security
      allowRunningInsecureContent: false, // Disable insecure content
      preload: path.join(__dirname, 'preload', 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });
  
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        contentSecurityPolicy: "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' http://localhost:3000 ws://localhost:3000;"
      }
    });
  });

  // Only open DevTools and add debug listeners in development mode
  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
    mainWindow.webContents.on('did-start-loading', () => console.log('Started loading'));
    mainWindow.webContents.on('did-stop-loading', () => console.log('Stopped loading'));
    mainWindow.webContents.on('did-finish-load', () => console.log('Finished loading'));
    mainWindow.webContents.on('did-fail-load', (_, code, desc) => console.log('Failed loading:', code, desc));
    mainWindow.webContents.on('crashed', () => console.log('Renderer crashed'));
    mainWindow.webContents.on('unresponsive', () => console.log('Window unresponsive'));
    mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
      console.log(`Console [${level}]: ${message} (${sourceId}:${line})`);
    });
  }

  // Create a simple server to serve Angular files
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = req.url || '/';
    
    if (isDevelopment) {
      console.log(`[ELECTRON PROXY] Received request: ${url}`);
    }
    
    // Prioritize API and socket.io routes
    if (url.startsWith('/api/') || url.includes('/socket.io/')) {
      if (isDevelopment) {
        console.log(`[ELECTRON PROXY] Proxying special route: ${url}`);
      }
      
      const proxyOptions = {
        hostname: 'localhost',
        port: 3000,
        path: url,
        method: req.method,
        headers: {
          ...req.headers,
          'Host': 'localhost:3000'
        }
      };
    
      const proxyReq = http.request(proxyOptions, (proxyRes) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
        // Forward response
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });
    
      // Pipe request body if exists
      req.pipe(proxyReq);
    
      proxyReq.on('error', (err) => {
        if (isDevelopment) {
          console.error('[ELECTRON PROXY] Proxy error:', err);
        } else {
          console.error('[ELECTRON PROXY] Backend connection failed');
        }
        
        // Return a more user-friendly error page
        res.writeHead(503, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head>
              <title>Service Unavailable</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  text-align: center;
                  padding: 50px;
                  background-color: #f5f5f5;
                }
                .error-container {
                  background-color: white;
                  border-radius: 8px;
                  padding: 30px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  max-width: 500px;
                  margin: 0 auto;
                }
                h1 { color: #e74c3c; }
                p { color: #333; line-height: 1.5; }
                button {
                  background-color: #3498db;
                  color: white;
                  border: none;
                  padding: 10px 20px;
                  border-radius: 4px;
                  cursor: pointer;
                  margin-top: 20px;
                  font-size: 14px;
                }
                button:hover { background-color: #2980b9; }
              </style>
            </head>
            <body>
              <div class="error-container">
                <h1>Connection Error</h1>
                <p>Unable to connect to the backend service. This is typically because the backend server isn't running.</p>
                <p>Please make sure the backend server is started before using the application.</p>
                <button onclick="window.location.reload()">Retry Connection</button>
              </div>
            </body>
          </html>
        `);
      });
    
      return;
    }

    // Serve static files
    let filePath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser', 
                           url === '/' ? '/index.html' : url);
    
    // Check if file exists and serve it
    if (fs.existsSync(filePath)) {
      // Check if the requested path is a directory
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        
        let contentType = 'text/html';
        if (ext === '.js') contentType = 'application/javascript';
        if (ext === '.css') contentType = 'text/css';
        if (ext === '.ico') contentType = 'image/x-icon';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        if (ext === '.svg') contentType = 'image/svg+xml';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      }
    }
    
    // Fallback to serving index.html for client-side routing
    if (isDevelopment) {
      console.log(`[Fallback] Serving index.html for route: ${url}`);
    }
    const indexPath = path.join(__dirname, '../frontend/dist/clippy-frontend/browser/index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
      
  server.listen(8080, 'localhost', () => {
    if (isDevelopment) {
      console.log('Server running at http://localhost:8080/');
    }
    if (mainWindow) {
      mainWindow.loadURL('http://localhost:8080/');
    }
  });

  // Hide menu bar in production mode
  mainWindow.setMenuBarVisibility(isDevelopment);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
}

/**
 * Start the backend NestJS server
 */
function startBackendServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const { spawn } = require('child_process');
    
    log.info('Starting backend server...');
    
    // Determine the correct path to the backend server
    const backendPath = path.join(__dirname, '../backend/dist/main.js');
    
    if (!fs.existsSync(backendPath)) {
      log.error(`Backend server not found at: ${backendPath}`);
      resolve(false);
      return;
    }
    
    // Start the NestJS process
    const backend = spawn('node', [backendPath], {
      env: {
        ...process.env,
        YT_DLP_PATH: process.env.YT_DLP_PATH,
        FFMPEG_PATH: process.env.FFMPEG_PATH,
        FFPROBE_PATH: process.env.FFPROBE_PATH
      }
    });
    
    // Log backend output
    backend.stdout.on('data', (data: Buffer) => {
      const output = data.toString().trim();
      if (isDevelopment || output.includes('error')) {
        log.info(`[Backend] ${output}`);
      }
    });
    
    backend.stderr.on('data', (data: Buffer) => {
      log.error(`[Backend Error] ${data.toString().trim()}`);
    });
    
    backend.on('close', (code: number) => {
      log.info(`Backend server process exited with code ${code}`);
    });
    
    // Clean up the backend server when the app exits
    app.on('before-quit', () => {
      log.info('Shutting down backend server...');
      backend.kill();
    });
    
    // Wait for backend to start up
    setTimeout(() => {
      checkBackendServer().then(isRunning => {
        if (isRunning) {
          log.info('Backend server started successfully');
          resolve(true);
        } else {
          log.warn('Backend server may not have started properly');
          resolve(false);
        }
      });
    }, 3000);
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Add environment variables for binary paths that NestJS can access
  process.env.YT_DLP_PATH = getBinaryPath('yt-dlp');
  process.env.FFMPEG_PATH = getBinaryPath('ffmpeg');
  process.env.FFPROBE_PATH = getBinaryPath('ffprobe');
  
  // Log the paths we're using
  log.info(`Using yt-dlp: ${process.env.YT_DLP_PATH}`);
  log.info(`Using ffmpeg: ${process.env.FFMPEG_PATH}`);
  log.info(`Using ffprobe: ${process.env.FFPROBE_PATH}`);

  // Start the backend server before creating the window
  await startBackendServer();
  
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * Gets the appropriate path for a binary based on environment and platform
 */
function getBinaryPath(binaryName: string): string {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const executable = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
  
  let binPath: string;
  
  if (isDevelopment) {
    // Development environment - check project root
    binPath = path.join(process.cwd(), 'bin', executable);
    
    // Hardcoded fallback for development
    if (!fs.existsSync(binPath)) {
      binPath = path.join('/Users/telltale/Documents/clippy/bin', executable);
    }
  } else {
    // Production environment - check in resources
    binPath = path.join(process.resourcesPath || app.getAppPath(), 'bin', executable);
  }
  
  // Verify the binary exists
  if (!fs.existsSync(binPath)) {
    log.warn(`Binary not found at ${binPath}`);
  }
  
  return binPath;
}

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure the backend server is running
function checkBackendServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api',
      method: 'GET'
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.end();
  });
}

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

// Expose the binary paths in the preload API so they can be used in the renderer process
ipcMain.handle('get-binary-paths', () => {
  return {
    ytDlpPath: process.env.YT_DLP_PATH,
    ffmpegPath: process.env.FFMPEG_PATH,
    ffprobePath: process.env.FFPROBE_PATH,
    resourcesPath: process.resourcesPath || app.getAppPath(),
    isDevelopment: process.env.NODE_ENV !== 'production'
  };
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

// Directory picker dialog
ipcMain.handle('open-directory-picker', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Location'
  });
  
  return result;
});