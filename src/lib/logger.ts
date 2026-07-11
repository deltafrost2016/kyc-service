import pino, { type Logger } from 'pino';
import config from '../config/index';

// Plain structured-JSON pino. No `pino-pretty` transport: pino transports run
// in a worker thread and resolve the target module at runtime, which esbuild's
// single-file Lambda bundle (no node_modules) cannot satisfy ("unable to
// determine transport target for pino-pretty"). JSON is also the right format
// for CloudWatch/Lambda log ingestion anyway.
export const logger: Logger = pino({
  level: config.LOG_LEVEL,
});

/** Child logger scoped to a component (e.g. a worker or route). */
export const childLogger = (component: string): Logger => logger.child({ component });

export default logger;
