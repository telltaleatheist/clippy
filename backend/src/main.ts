import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  try {
    // Create the NestJS app with extensive logging
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
      abortOnError: false
    });

    // Enable CORS
    app.enableCors();

    // Validation pipe with minimal configuration
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      })
    );

    // Extensive route debugging
    const expressApp = app.getHttpAdapter().getInstance();
    
    // Safely log routes
    function logRoutes(router: express.Router) {
      if (!router || !router.stack) {
        console.log('No router stack found');
        return;
      }

      console.log('=== REGISTERED ROUTES ===');
      router.stack.forEach((layer: any, index: number) => {
        try {
          if (layer.route) {
            const routeMethods = Object.keys(layer.route)
              .filter(key => 
                ['get', 'post', 'put', 'delete', 'patch', 'options'].includes(key.toLowerCase())
              );

            console.log(`Route ${index}:`, {
              path: layer.route.path || 'Unknown path',
              methods: routeMethods
            });
          }
        } catch (error) {
          console.error(`Error logging route ${index}:`, error);
        }
      });
      console.log('=== END ROUTES ===');
    }

    // Log routes after a short delay
    process.nextTick(() => {
      try {
        // Log main router routes
        if (expressApp._router) {
          console.log('Main Router Routes:');
          logRoutes(expressApp._router);
        }
      } catch (error) {
        console.error('Error logging routes:', error);
      }
    });

    // Serve static files
    const frontendDistPath = path.join(process.cwd(), 'frontend', 'dist', 'clippy-frontend');
    
    try {
      app.useStaticAssets(frontendDistPath, {
        prefix: '/',
        index: 'index.html',
        fallthrough: true
      });
      console.log(`Serving static assets from: ${frontendDistPath}`);
    } catch (staticError) {
      console.error('Error serving static assets:', staticError);
    }

    // Fallback route handler
    expressApp.get('*', (req: express.Request, res: express.Response) => {
      const indexPath = path.join(frontendDistPath, 'index.html');
      console.log(`Fallback route hit for ${req.url}, serving: ${indexPath}`);
      res.sendFile(indexPath);
    });

    // Global error handler with explicit types
    app.use((
      err: Error, 
      req: express.Request, 
      res: express.Response, 
      next: express.NextFunction
    ) => {
      console.error('Global Error Handler:', err);
      res.status(500).json({
        statusCode: 500,
        message: 'Unexpected server error',
        error: err.message || 'Internal Server Error'
      });
    });

    // Start the server
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`Application successfully started on port ${port}`);
    console.log(`Application running at: ${await app.getUrl()}`);

  } catch (error) {
    console.error('Bootstrap Error:', error);
    
    // Detailed error logging
    if (error instanceof Error) {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
    }
    
    process.exit(1);
  }
}

// Global error handlers
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
});

bootstrap();