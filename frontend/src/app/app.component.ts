// clippy/frontend/src/app/app.component.ts
import { Component, OnInit, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, RouterOutlet } from '@angular/router';

import { ThemeService } from './services/theme.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SocketService } from './services/socket.service';
import { SettingsService } from './services/settings.service';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  encapsulation: ViewEncapsulation.None, // Add this to ensure styles apply globally
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,  // Add this for router-outlet
    MatSnackBarModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    ThemeToggleComponent  // Import the ThemeToggleComponent
  ]
})
export class AppComponent implements OnInit {
  title = 'Clippy - Video Downloader';
  isDownloading = false;
  currentYear = new Date().getFullYear();

  private socketService = inject(SocketService);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);
  private themeService = inject(ThemeService);  // Inject the ThemeService
  public router = inject(Router);

  ngOnInit(): void {
    // Force dark mode on startup
    this.themeService.setDarkMode(false);
    
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