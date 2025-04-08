// clippy/backend/src/path/path.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class PathService {
  private readonly logger = new Logger(PathService.name);
  private defaultDownloadPath: string;

  constructor() {
    this.defaultDownloadPath = this.getDefaultDownloadPath();
    this.logger.log(`Default download path set to: ${this.defaultDownloadPath}`);
  }

  /**
   * Gets the default download path based on the user's operating system
   */
  getDefaultDownloadPath(): string {
    const platform = os.platform();
    const homeDir = os.homedir();
    
    // Different defaults based on operating system
    if (platform === 'darwin') {
      // macOS
      return path.join(homeDir, 'Downloads');
    } else if (platform === 'win32') {
      // Windows - Check for Windows standard Downloads folder
      const windowsDownloads = path.join(homeDir, 'Downloads');
      if (fs.existsSync(windowsDownloads)) {
        return windowsDownloads;
      }
      
      // Fallback to Documents\Downloads
      return path.join(homeDir, 'Documents', 'Downloads');
    } else {
      // Linux and others
      // Try standard XDG directory first
      try {
        // Check if xdg-user-dir command exists and use it to get Downloads path
        const { execSync } = require('child_process');
        const xdgDownloadsDir = execSync('xdg-user-dir DOWNLOAD').toString().trim();
        
        if (xdgDownloadsDir && fs.existsSync(xdgDownloadsDir)) {
          return xdgDownloadsDir;
        }
      } catch (error) {
        this.logger.warn('Could not determine XDG Downloads directory, using fallback');
      }
      
      // Fallback to ~/Downloads or create it if it doesn't exist
      const linuxDownloads = path.join(homeDir, 'Downloads');
      if (!fs.existsSync(linuxDownloads)) {
        try {
          fs.mkdirSync(linuxDownloads, { recursive: true });
        } catch (error: unknown) {
            // Type guard to check if error is an Error object
            if (error instanceof Error) {
              this.logger.error(`Path is not writable: ${linuxDownloads}, error: ${error.message}`);
            } else {
              this.logger.error(`Path is not writable: ${linuxDownloads}, error: ${String(error)}`);
            }
            return '';
          }
      }
      
      return linuxDownloads;
    }
  }

  /**
   * Ensures the given path exists, creates it if it doesn't
   */
  ensurePathExists(downloadPath: string): boolean {
    try {
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        this.logger.log(`Created download directory: ${downloadPath}`);
      }
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to create download directory: ${error.message}`);
      } else {
        this.logger.error(`Failed to create download directory: ${String(error)}`);
      }
      return false;
    }
  }

  /**
   * Validates if a path is writable
   */
  isPathWritable(downloadPath: string): boolean {
    try {
      // Ensure the directory exists first
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }
      
      // Try to write a test file
      const testFile = path.join(downloadPath, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Path is not writable: ${downloadPath}, error: ${error.message}`);
      } else {
        this.logger.error(`Path is not writable: ${downloadPath}, error: ${String(error)}`);
      }
      return false;
    }
  }

  /**
   * Returns the default download path if the requested path is invalid or null
   */
  getSafePath(requestedPath: string | null | undefined): string {
    if (!requestedPath) {
      return this.defaultDownloadPath;
    }
    
    // Ensure the path exists and is writable
    if (this.isPathWritable(requestedPath)) {
      return requestedPath;
    }
    
    // Fallback to default if there are issues
    this.logger.warn(`Requested path ${requestedPath} is invalid, falling back to default ${this.defaultDownloadPath}`);
    return this.defaultDownloadPath;
  }
}