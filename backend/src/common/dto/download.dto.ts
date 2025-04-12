// clippy/backend/src/common/dto/download.dto.ts
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class DownloadVideoDto {
  @IsNotEmpty()
  @IsUrl({}, { message: 'Please provide a valid URL' })
  url: string;

  @IsOptional()
  @IsString()
  outputDir?: string;

  @IsOptional()
  @IsIn(['360', '480', '720', '1080', '1440', '2160'], { 
    message: 'Quality must be one of: 360, 480, 720, 1080, 1440, 2160' 
  })
  quality?: string = '720';

  @IsOptional()
  @IsBoolean()
  convertToMp4?: boolean = true;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  fps?: number = 30;

  @IsOptional()
  @IsBoolean()
  useCookies?: boolean = true;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'chrome', 'firefox', 'edge', 'safari', 'brave', 'opera', ''], { 
    message: 'Browser must be one of: auto, chrome, firefox, edge, safari, brave, opera'
  })
  browser?: string = 'auto';

  @IsOptional()
  @IsBoolean()
  fixAspectRatio?: boolean = true;
}

export class DownloadProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @IsOptional()
  @IsString()
  task?: string;

  @IsOptional()
  @IsString()
  outputFile?: string;
}

// fix this file - i havent copied anything over yet
