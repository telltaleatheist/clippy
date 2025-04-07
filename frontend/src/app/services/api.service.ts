import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DownloadOptions, DownloadResult, HistoryItem } from '../models/download.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Start a video download
   */
  downloadVideo(options: DownloadOptions): Observable<DownloadResult> {
    return this.http.post<DownloadResult>(`${this.apiUrl}/api/downloader`, options);
  }

  /**
   * Get download history
   */
  getDownloadHistory(): Observable<HistoryItem[]> {
    return this.http.get<HistoryItem[]>(`${this.apiUrl}/api/downloader/history`);
  }

  /**
   * Remove an item from download history
   */
  removeFromHistory(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/api/downloader/history/${id}`
    );
  }

  /**
   * Clear all download history
   */
  clearHistory(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/api/downloader/history`
    );
  }

  /**
   * Check if a URL is valid and get video info
   */
  checkUrl(url: string): Observable<{ valid: boolean; message: string; info?: any }> {
    return this.http.get<{ valid: boolean; message: string; info?: any }>(
      `${this.apiUrl}/api/downloader/check`, 
      { params: { url } }
    );
  }

  /**
   * Get file download URL
   */
  getFileUrl(id: string): string {
    return `${this.apiUrl}/api/downloader/file/${id}`;
  }

  /**
   * Get file streaming URL
   */
  getStreamUrl(id: string): string {
    return `${this.apiUrl}/api/downloader/stream/${id}`;
  }
}