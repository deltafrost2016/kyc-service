import { Sequelize } from 'sequelize';
import pg from 'pg';
import { config } from '../config/index.js';

/**
 * Thin Postgres/Sequelize wrapper. Callers depend on `sequelize`, not on the
 * driver directly — keeps the data layer swappable/mockable.
 */
export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  // Hand Sequelize the pg driver explicitly. esbuild (via `sam build`) bundles
  // everything into a single file with no node_modules, so Sequelize's default
  // dynamic `require('pg')` in _loadDialectModule can't be resolved at runtime
  // ("Please install pg package manually"). A static import + dialectModule lets
  // esbuild bundle pg and skips the dynamic require entirely.
  dialectModule: pg,
  dialectOptions: config.DB_SSL
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
  logging: false,
  // Small per-container pool for Lambda-per-invocation: many warm containers
  // can run concurrently, each holding at most a couple of connections, and
  // idle connections are released quickly since a container can freeze
  // mid-connection between invocations.
  pool: {
    max: config.DB_POOL_MAX,
    min: config.DB_POOL_MIN,
    idle: config.DB_POOL_IDLE_MS,
    acquire: config.DB_POOL_ACQUIRE_MS,
  },
});

export const close = (): Promise<void> => sequelize.close();

export default {
  sequelize,
  close,
};
