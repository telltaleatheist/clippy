// clippy/backend/src/path/path.controller.ts
import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { PathService } from './path.service';

@Controller('path')
export class PathController {
  constructor(private readonly pathService: PathService) {}

  @Get('default')
  getDefaultPath() {
    return { 
      path: this.pathService.getDefaultDownloadPath(),
      success: true
    };
  }

  @Post('validate')
  validatePath(@Body() body: { path: string }) {
    try {
      const { path } = body;
      const isValid = this.pathService.isPathWritable(path);
      
      return {
        path,
        isValid,
        success: true
      };
    } catch (error: unknown) {
      throw new HttpException({
        status: HttpStatus.BAD_REQUEST,
        error: 'Invalid path provided',
        message: error instanceof Error ? error.message : String(error)
      }, HttpStatus.BAD_REQUEST);
    }
  }
}