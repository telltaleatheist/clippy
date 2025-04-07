import { Component, OnInit, OnDestroy } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';
import { DownloadProgress } from '../../models/download.model';

@Component({
  selector: 'app-download-progress',
  templateUrl: './download-progress.component.html',
  styleUrls: ['./download-progress.component.scss']
})
export class DownloadProgressComponent implements OnInit, OnDestroy {
  progress = 0;
  task = 'Preparing download...';
  private downloadSubscription: Subscription | null = null;
  private processingSubscription: Subscription | null = null;

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    // Subscribe to download progress events
    this.downloadSubscription = this.socketService.onDownloadProgress()
      .subscribe((data: DownloadProgress) => {
        this.progress = data.progress;
        if (data.task) {
          this.task = data.task;
        } else {
          this.task = 'Downloading...';
        }
      });

    // Subscribe to processing progress events
    this.processingSubscription = this.socketService.onProcessingProgress()
      .subscribe((data: DownloadProgress) => {
        this.progress = data.progress;
        this.task = data.task || 'Processing video...';
      });
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.downloadSubscription) {
      this.downloadSubscription.unsubscribe();
    }
    
    if (this.processingSubscription) {
      this.processingSubscription.unsubscribe();
    }
  }
}