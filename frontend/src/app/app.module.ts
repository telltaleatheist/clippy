// clippy/frontend/src/app/app.module.ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SocketIoModule, SocketIoConfig } from 'ngx-socket-io';

import { MaterialModule } from './material.module';
import { AppRoutingModule } from './app-routing.module';

// Components
import { AppComponent } from './app.component';
import { BatchDownloadComponent } from './components/batch-download/batch-download.component';
import { DownloadFormComponent } from './components/download-form/download-form.component';
import { DownloadHistoryComponent } from './components/download-history/download-history.component';
import { DownloadProgressComponent } from './components/download-progress/download-progress.component';
import { SettingsComponent } from './components/settings/settings.component';

// Angular Material Modules
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule } from '@angular/material/dialog';

// Environment
import { environment } from '../environment/environment';

// Socket.io configuration
const socketIoConfig: SocketIoConfig = {
  url: environment.apiBaseUrl,
  options: {
    transports: ['websocket']
  }
};

@NgModule({
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    AppRoutingModule,
    MaterialModule,
    SocketIoModule.forRoot(socketIoConfig),

    // Standalone Components (✅ moved to imports)
    AppComponent,
    BatchDownloadComponent,
    DownloadFormComponent,
    DownloadHistoryComponent,
    DownloadProgressComponent,
    SettingsComponent,

    // Angular Material modules
    MatToolbarModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatCardModule,
    MatProgressBarModule,
    MatIconModule,
    MatListModule,
    MatSnackBarModule,
    MatTabsModule,
    MatExpansionModule,
    MatTooltipModule,
    MatDialogModule
  ],
  providers: [provideHttpClient(withInterceptorsFromDi())],
  bootstrap: [AppComponent]
})
export class AppModule { }