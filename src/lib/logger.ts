import pino, { type Logger } from 'pino';
import config from '../config/index.js';

const isDev = config.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

/** Child logger scoped to a component (e.g. a worker or route). */
export const childLogger = (component: string): Logger => logger.child({ component });

export default logger;
