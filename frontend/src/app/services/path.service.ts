import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ValidationResult } from '../models/settings.model';

/**
 * Service to handle path operations (get default path, validate path)
 */
@Injectable({
  providedIn: 'root'
})
export class PathService {
  private http = inject(HttpClient);
  private readonly API_URL = '/api/path';

  /**
   * Gets the default download path from the server based on OS
   */
  getDefaultPath(): Observable<{ path: string, success: boolean }> {
    return this.http.get<{ path: string, success: boolean }>(`${this.API_URL}/default`);
  }

  /**
   * Validates if a path is valid and writable
   */
  validatePath(path: string): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(`${this.API_URL}/validate`, { path });
  }

  /**
   * Opens a native directory picker dialog 
   * (Only works in electron, not in web)
   */
  openDirectoryPicker(): Observable<string | null> {
    // Check if we're in Electron environment
    if ((window as any).electron) {
      return new Observable<string | null>(observer => {
        (window as any).electron.openDirectoryPicker()
          .then((result: { canceled: boolean, filePaths: string[] }) => {
            if (result.canceled || !result.filePaths.length) {
              observer.next(null);
            } else {
              observer.next(result.filePaths[0]);
            }
            observer.complete();
          })
          .catch((error: any) => {
            observer.error(error);
            observer.complete();
          });
      });
    }
    
    // If not in Electron, return null
    return new Observable<string | null>(observer => {
      observer.next(null);
      observer.complete();
    });
  }
}