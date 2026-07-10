import { Sequelize } from 'sequelize';
import config from '../config/index.js';

/**
 * Thin Postgres/Sequelize wrapper. Callers depend on `sequelize`, not on the
 * driver directly — keeps the data layer swappable/mockable.
 */
export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
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
