// clippy/frontend/src/app/services/batch-api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BatchConfig, BatchDownloadOptions, BatchQueueStatus, DownloadOptions } from '../models/download.model';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root'
})
export class BatchApiService {
  private apiUrl = environment.apiUrl;
  
  constructor(private http: HttpClient) {}

  /**
   * Add a single download to the batch queue
   */
  addToBatchQueue(options: DownloadOptions): Observable<{success: boolean, jobId: string}> {
    return this.http.post<{success: boolean, jobId: string}>(`${this.apiUrl}/downloader/batch`, options);
  }

  /**
   * Add multiple downloads to the batch queue
   */
  addMultipleToBatchQueue(options: DownloadOptions[]): Observable<{success: boolean, jobIds: string[]}> {
    return this.http.post<{success: boolean, jobIds: string[]}>(`${this.apiUrl}/downloader/batch/bulk`, options);
  }

  /**
   * Get the current batch status
   */
  getBatchStatus(): Observable<BatchQueueStatus> {
    return this.http.get<BatchQueueStatus>(`${this.apiUrl}/downloader/batch/status`);
  }

  /**
   * Update batch configuration
   */
  updateBatchConfig(config: BatchConfig): Observable<{success: boolean, config: BatchConfig}> {
    return this.http.patch<{success: boolean, config: BatchConfig}>(`${this.apiUrl}/downloader/batch/config`, config);
  }

  /**
   * Clear all batch queues
   */
  clearBatchQueues(): Observable<{success: boolean, message: string}> {
    return this.http.delete<{success: boolean, message: string}>(`${this.apiUrl}/downloader/batch`);
  }
}