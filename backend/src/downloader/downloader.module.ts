import { Module } from '@nestjs/common';
import { DownloaderController } from './downloader.controller';
import { DownloaderService } from './downloader.service';
import { FfmpegModule } from '../ffmpeg/ffmpeg.module';

@Module({
  imports: [FfmpegModule],
  controllers: [DownloaderController],
  providers: [DownloaderService],
  exports: [DownloaderService],
})
export class DownloaderModule {}