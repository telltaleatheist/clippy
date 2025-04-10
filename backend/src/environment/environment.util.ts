// src/environment/environment.util.ts
import * as path from 'path';
import * as fs from 'fs';

export class EnvironmentUtil {
  /**
   * Checks if the application is running in development mode
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Checks if the application is running in production mode
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === undefined;
  }

  /**
   * Returns the path to a binary based on the current environment
   * This enhanced version checks multiple locations to find the binary
   */
  static getBinaryPath(binaryName: string): string {
    // Try environment variables first
    const envVarName = `${binaryName.toUpperCase().replace('-', '_')}_PATH`;
    if (process.env[envVarName]) {
      return process.env[envVarName];
    }

    // For Electron applications
    const isElectron = !!process.versions && !!process.versions.electron;
    if (isElectron) {
      // Use the ElectronProcess type to access resourcesPath
      interface ElectronProcess extends NodeJS.Process {
        resourcesPath?: string;
      }
      const electronProcess = process as ElectronProcess;
      return path.join(
        electronProcess.resourcesPath || '.',
        'bin',
        binaryName
      );
    }

    // Try multiple locations in order of preference
    const potentialPaths = [
      // 1. Project bin directory (relative to cwd)
      path.join(__dirname, '../../../bin', binaryName),
      
      // 2. Specific location at ~/Documents/clippy/bin/
      path.join(process.env.HOME || process.env.USERPROFILE || __dirname, '../../../bin', binaryName),
      
      // 3. Backend bin directory
      path.join(__dirname, '../../../bin', binaryName),
      
      // 4. Development path (relative to this file)
      path.join(__dirname, '../../../bin', binaryName)
    ];

    // Add Windows executable extension if on Windows
    if (process.platform === 'win32') {
      potentialPaths.forEach((p, i) => {
        if (!p.endsWith('.exe')) {
          potentialPaths[i] = `${p}.exe`;
        }
      });
    }

    // Check each path and return the first one that exists
    for (const potentialPath of potentialPaths) {
      if (fs.existsSync(potentialPath)) {
        return potentialPath;
      }
    }

    // If nothing found, return a default path for consistent error handling
    return path.join(__dirname, '../../../bin', binaryName);
  }
}