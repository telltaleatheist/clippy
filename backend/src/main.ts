import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  try {
    // Ensure required folders exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const downloadsDir = path.join(process.cwd(), 'downloads');

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    // Create the NestJS app with Express
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose']
    });

    // Enable CORS for frontend
    app.enableCors({
      origin: 'http://localhost:4200',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    });

    // Apply validation globally with more detailed error handling
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) => {
          console.error('Validation errors:', errors);
          throw new Error('Validation failed');
        }
      }),
    );

    app.setGlobalPrefix('api');

    // Serve Angular frontend
    const frontendDistPath = path.join(process.cwd(), 'frontend', 'dist', 'clippy-frontend');
    
    // Add error handling for static asset serving
    try {
      app.useStaticAssets(frontendDistPath);
      app.setBaseViewsDir(frontendDistPath);
    } catch (assetError) {
      console.error('Error serving static assets:', assetError);
    }

    // Fallback to index.html for unknown frontend routes
    const expressApp: express.Express = app.getHttpAdapter().getInstance();
    expressApp.get('/*', (_req, res) => {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
    
    // Add global error handler
    app.use((err: { message: any; }, _req: any, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { statusCode: number; message: string; error: any; }): void; new(): any; }; }; }, next: any) => {
      console.error('Unhandled error:', err);
      res.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
        error: err.message
      });
    });
    
    await app.listen(3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
  } catch (bootstrapError) {
    console.error('Failed to bootstrap application:', bootstrapError);
    process.exit(1);
  }
}

bootstrap();