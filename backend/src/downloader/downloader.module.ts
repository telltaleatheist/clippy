// clippy/backend/src/downloader/downloader.module.ts
import { Module } from '@nestjs/common';
import { DownloaderController } from './downloader.controller';
import { DownloaderService } from './downloader.service';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';
import { PathModule } from '../path/path.module';

@Module({
  imports: [FfmpegModule, PathModule],
  controllers: [DownloaderController],
  providers: [DownloaderService],
  exports: [DownloaderService]
})
export class DownloaderModule {}