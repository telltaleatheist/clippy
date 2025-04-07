import { Injectable } from '@angular/core';
import { Socket } from 'ngx-socket-io';
import { Observable } from 'rxjs';
import { DownloadProgress, HistoryItem } from '../models/download.model';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  constructor(private socket: Socket) {}

  /**
   * Listen for socket connection
   */
  onConnect(): Observable<void> {
    return this.socket.fromEvent<void>('connect');
  }

  /**
   * Listen for socket disconnection
   */
  onDisconnect(): Observable<void> {
    return this.socket.fromEvent<void>('disconnect');
  }

  /**
   * Listen for download progress updates
   */
  onDownloadProgress(): Observable<DownloadProgress> {
    return this.socket.fromEvent<DownloadProgress>('download-progress');
  }

  /**
   * Listen for processing progress updates
   */
  onProcessingProgress(): Observable<DownloadProgress> {
    return this.socket.fromEvent<DownloadProgress>('processing-progress');
  }

  /**
   * Listen for download history updates
   */
  onDownloadHistoryUpdated(): Observable<HistoryItem[]> {
    return this.socket.fromEvent<HistoryItem[]>('download-history-updated');
  }

  /**
   * Listen for download started event
   */
  onDownloadStarted(): Observable<void> {
    return this.socket.fromEvent<void>('download-started');
  }

  /**
   * Listen for download completed event
   */
  onDownloadCompleted(): Observable<string> {
    return this.socket.fromEvent<string>('download-completed');
  }

  /**
   * Listen for download failed event
   */
  onDownloadFailed(): Observable<string> {
    return this.socket.fromEvent<string>('download-failed');
  }
}