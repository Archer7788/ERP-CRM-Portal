import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { closeDatabase, testDatabaseConnection } from './config/database';
import { logger } from './common/logger';

const bootstrap = async (): Promise<void> => {
  await testDatabaseConnection();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(`ERP + CRM Operations Portal API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Health check:  http://localhost:${env.PORT}/health`);
    logger.info(`API root:      http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      try {
        await closeDatabase();
      } catch (error) {
        logger.error('Error while closing the database pool', error);
      }
      process.exit(0);
    });
    // Force exit if connections do not drain within 15 seconds.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception, exiting', error);
    process.exit(1);
  });
};

bootstrap().catch((error) => {
  logger.error('Failed to start the server', error);
  process.exit(1);
});
