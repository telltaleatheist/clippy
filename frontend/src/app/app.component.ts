import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SocketService } from './services/socket.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})

export class AppComponent implements OnInit {
  title = 'Clippy - Video Downloader';
  isDownloading = false;
  currentYear = new Date().getFullYear();
  
  constructor(
    private socketService: SocketService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}
  
  ngOnInit(): void {
    // Listen for socket connection status
    this.socketService.onConnect().subscribe(() => {
      this.snackBar.open('Connected to server', 'Dismiss', {
        duration: 3000,
      });
    });
    
    this.socketService.onDisconnect().subscribe(() => {
      this.snackBar.open('Disconnected from server', 'Dismiss', {
        duration: 3000,
      });
    });
    
    // Subscribe to download status
    this.socketService.onDownloadStarted().subscribe(() => {
      this.isDownloading = true;
    });
    
    this.socketService.onDownloadCompleted().subscribe(() => {
      this.isDownloading = false;
      this.snackBar.open('Download completed!', 'Dismiss', {
        duration: 5000,
      });
    });
    
    this.socketService.onDownloadFailed().subscribe((error) => {
      this.isDownloading = false;
      this.snackBar.open(`Download failed: ${error}`, 'Dismiss', {
        duration: 5000,
      });
    });
  }
}