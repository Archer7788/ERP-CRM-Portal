import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env, isTest } from './config/env';
import routes from './routes';
import { initValidatedRequest } from './middleware/validate.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { isS3Configured } from './services/s3.service';

export const createApp = (): Application => {
  const app = express();

  // Required for correct client IPs (rate limiting) behind an AWS ALB / Nginx.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((value) => value.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  if (!isTest) {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }
  app.use(initValidatedRequest);

  /** Health check used by the ALB target group / ECS health check. */
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'ERP + CRM Operations Portal API is healthy',
      data: {
        status: 'UP',
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        s3Configured: isS3Configured(),
      },
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  });

  // The specification lists bare endpoints (e.g. POST /auth/login), so the router is
  // mounted at the root AND under a versioned prefix. Both are fully functional.
  app.use('/', routes);
  app.use(env.API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
