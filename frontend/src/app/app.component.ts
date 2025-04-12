// clippy/frontend/src/app/app.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DownloadFormComponent } from './components/download-form/download-form.component';
import { DownloadProgressComponent } from './components/download-progress/download-progress.component';
import { DownloadHistoryComponent } from './components/download-history/download-history.component';

import { SocketService } from './services/socket.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    DownloadFormComponent,
    DownloadProgressComponent,
    DownloadHistoryComponent
  ]
})
export class AppComponent implements OnInit {
  title = 'Clippy - Video Downloader';
  isDownloading = false;
  currentYear = new Date().getFullYear();

  private socketService = inject(SocketService);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  router: any;

  ngOnInit(): void {
    this.socketService.onConnect().subscribe(() => {
      this.snackBar.open('Connected to server', 'Dismiss', { duration: 3000 });
    });

    this.socketService.onDisconnect().subscribe(() => {
      this.snackBar.open('Disconnected from server', 'Dismiss', { duration: 3000 });
    });

    this.socketService.onDownloadStarted().subscribe(() => {
      this.isDownloading = true;
    });

    this.socketService.onDownloadCompleted().subscribe(() => {
      this.isDownloading = false;
      this.snackBar.open('Download completed!', 'Dismiss', { duration: 5000 });
    });

    this.socketService.onDownloadFailed().subscribe((error) => {
      this.isDownloading = false;
      this.snackBar.open(`Download failed: ${error}`, 'Dismiss', { duration: 5000 });
    });
  }

  navigateToBatch(): void {
    this.router.navigate(['/batch']);
  }
}
