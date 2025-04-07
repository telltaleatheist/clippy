import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';
import { HistoryItem } from '../../models/download.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-download-history',
  templateUrl: './download-history.component.html',
  styleUrls: ['./download-history.component.scss']
})
export class DownloadHistoryComponent implements OnInit, OnDestroy {
  historyItems: HistoryItem[] = [];
  isLoading = true;
  private historySubscription: Subscription | null = null;

  constructor(
    private apiService: ApiService,
    private socketService: SocketService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Load download history
    this.loadHistory();
    
    // Subscribe to history updates
    this.historySubscription = this.socketService.onDownloadHistoryUpdated()
      .subscribe((history: HistoryItem[]) => {
        this.historyItems = history;
      });
  }

  ngOnDestroy(): void {
    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
    }
  }

  loadHistory(): void {
    this.isLoading = true;
    this.apiService.getDownloadHistory().subscribe({
      next: (history) => {
        this.historyItems = history;
        this.isLoading = false;
      },
      error: (error) => {
        this.snackBar.open('Failed to load download history', 'Dismiss', {
          duration: 3000
        });
        this.isLoading = false;
      }
    });
  }

  formatFileSize(size: number | undefined): string {
    if (!size) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let fileSize = size;
    let unitIndex = 0;
    
    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024;
      unitIndex++;
    }
    
    return `${fileSize.toFixed(1)} ${units[unitIndex]}`;
  }

  downloadFile(item: HistoryItem): void {
    const downloadUrl = this.apiService.getFileUrl(item.id);
    window.open(downloadUrl, '_blank');
  }

  streamFile(item: HistoryItem): void {
    const streamUrl = this.apiService.getStreamUrl(item.id);
    window.open(streamUrl, '_blank');
  }

  removeFromHistory(item: HistoryItem, event: Event): void {
    event.stopPropagation(); // Prevent card click
    
    this.apiService.removeFromHistory(item.id).subscribe({
      next: (result) => {
        if (result.success) {
          this.historyItems = this.historyItems.filter(i => i.id !== item.id);
          this.snackBar.open('Removed from history', 'Dismiss', {
            duration: 3000
          });
        } else {
          this.snackBar.open('Failed to remove item', 'Dismiss', {
            duration: 3000
          });
        }
      },
      error: (error) => {
        this.snackBar.open('Error removing item', 'Dismiss', {
          duration: 3000
        });
      }
    });
  }

  clearHistory(): void {
    // Add confirmation dialog
    if (confirm('Are you sure you want to clear the download history?')) {
      this.apiService.clearHistory().subscribe({
        next: (result) => {
          if (result.success) {
            this.historyItems = [];
            this.snackBar.open('Download history cleared', 'Dismiss', {
              duration: 3000
            });
          } else {
            this.snackBar.open('Failed to clear history', 'Dismiss', {
              duration: 3000
            });
          }
        },
        error: (error) => {
          this.snackBar.open('Error clearing history', 'Dismiss', {
            duration: 3000
          });
        }
      });
    }
  }
}