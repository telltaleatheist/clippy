// clippy/backend/src/environment/environment.util.ts
// backend/src/common/utils/environment.util.ts
import { Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

export class EnvironmentUtil {
  private static readonly logger = new Logger('EnvironmentUtil');

  /**
   * Determines if the application is running in development mode
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  /**
   * Gets the path to application resources based on environment
   */
  static getResourcesPath(): string {
    // Check if we're in Electron context with the window.electron API
    if (typeof window !== 'undefined' && (window as any).electron?.environment?.resourcesPath) {
      return (window as any).electron.environment.resourcesPath;
    }
    
    if ((process as any).resourcesPath) {
        return (process as any).resourcesPath;
      }
    
    // Fallback for development
    return path.join(process.cwd(), '..');
  }

  /**
   * Gets the absolute path to a binary based on environment
   */
  static getBinaryPath(binaryName: string): string {
    const executable = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
    let binaryPath: string;

    // Try to get from Electron context first
    if (typeof window !== 'undefined' && (window as any).electron?.environment?.getBinaryPath) {
      binaryPath = (window as any).electron.environment.getBinaryPath(binaryName);
      this.logger.log(`Using binary path from Electron: ${binaryPath}`);
      return binaryPath;
    }
    
    // Otherwise determine based on environment
    if (this.isDevelopment()) {
      // Development - check in project root bin
      binaryPath = path.join(process.cwd(), '..', 'bin', executable);
      
      // Fallback to just bin in current directory
      if (!fs.existsSync(binaryPath)) {
        binaryPath = path.join(process.cwd(), 'bin', executable);
      }
    } else {
      // Production - check in resources/bin
      binaryPath = path.join(this.getResourcesPath(), 'bin', executable);
    }
    
    this.logger.log(`Resolved binary path for ${binaryName}: ${binaryPath}`);
    return binaryPath;
  }
}