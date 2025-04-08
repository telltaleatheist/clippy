import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  try {
    // Create the NestJS app
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
      abortOnError: false
    });

    // Enable CORS
    app.enableCors();

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      })
    );

    // Get the express adapter
    const expressApp = app.getHttpAdapter().getInstance();

    // Manually serve static files
    // Use multiple potential paths to find the frontend dist
    const possiblePaths = [
      path.join(process.cwd(), 'frontend', 'dist', 'clippy-frontend', 'browser'),
      path.join(process.cwd(), '..', 'frontend', 'dist', 'clippy-frontend', 'browser'),
      path.join(__dirname, '..', 'frontend', 'dist', 'clippy-frontend', 'browser')
    ];

    let frontendDistPath: string | null = null;
    for (const potentialPath of possiblePaths) {
      console.log(`Checking frontend path: ${potentialPath}`);
      if (fs.existsSync(potentialPath)) {
        frontendDistPath = potentialPath;
        break;
      }
    }

    if (!frontendDistPath) {
      console.error('ERROR: Could not find frontend dist directory');
      console.error('Searched paths:', possiblePaths);
    } else {
      console.log(`Frontend dist path: ${frontendDistPath}`);

      // Serve static files
      expressApp.use(express.static(frontendDistPath, {
        index: 'index.html',
        extensions: ['html']
      }));

      // Fallback route to support client-side routing
      expressApp.use((req, res, next) => {
        // Only handle GET requests
        if (req.method !== 'GET') return next();
      
        // If the request has a file extension (like .js, .css, etc), skip it
        if (path.extname(req.url)) return next();
      
        const indexPath = path.join(frontendDistPath!, 'index.html');
      
        if (!fs.existsSync(indexPath)) {
          console.error(`[ERROR] index.html not found at: ${indexPath}`);
          return res.status(500).send('Frontend application not found');
        }
      
        console.log(`[Fallback] Serving index.html for route: ${req.url}`);
        res.sendFile(indexPath);
      });
    }

    // Start the server
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await app.listen(port, '0.0.0.0');
    
    console.log(`=== APPLICATION STARTED ===`);
    console.log(`Server running on port ${port}`);
  } catch (error) {
    console.error('=== BOOTSTRAP ERROR ===');
    console.error('Error during application startup:');
    
    if (error instanceof Error) {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

bootstrap();