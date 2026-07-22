/* Minimal dependency-free logger with level control. */
const timestamp = () => new Date().toISOString();

export const logger = {
  info: (message: string, meta?: unknown) =>
    console.log(`[${timestamp()}] [INFO ] ${message}`, meta !== undefined ? meta : ''),
  warn: (message: string, meta?: unknown) =>
    console.warn(`[${timestamp()}] [WARN ] ${message}`, meta !== undefined ? meta : ''),
  error: (message: string, meta?: unknown) =>
    console.error(`[${timestamp()}] [ERROR] ${message}`, meta !== undefined ? meta : ''),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[${timestamp()}] [DEBUG] ${message}`, meta !== undefined ? meta : '');
    }
  },
};
