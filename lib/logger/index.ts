import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

const logger = pino({
  level: logLevel,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      }
    : undefined,
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});

export type LogContext = Record<string, unknown>;

export const log = {
  debug: (msg: string, context?: LogContext) => {
    logger.debug(context || {}, msg);
  },
  info: (msg: string, context?: LogContext) => {
    logger.info(context || {}, msg);
  },
  warn: (msg: string, context?: LogContext) => {
    logger.warn(context || {}, msg);
  },
  error: (msg: string, error?: Error | unknown, context?: LogContext) => {
    const errorContext =
      error instanceof Error
        ? {
            error: {
              message: error.message,
              name: error.name,
              stack: isDev ? error.stack : undefined,
            },
          }
        : { error: String(error) };

    logger.error({ ...context, ...errorContext }, msg);
  },
  fatal: (msg: string, error?: Error | unknown, context?: LogContext) => {
    const errorContext =
      error instanceof Error
        ? {
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack,
            },
          }
        : { error: String(error) };

    logger.fatal({ ...context, ...errorContext }, msg);
  },
};

export default logger;
