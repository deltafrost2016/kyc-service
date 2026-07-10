import { Sequelize } from 'sequelize';
import config from '../config/index.js';

/**
 * Thin Postgres/Sequelize wrapper. Callers depend on `sequelize`, not on the
 * driver directly — keeps the data layer swappable/mockable.
 */
export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

export const close = (): Promise<void> => sequelize.close();

export default {
  sequelize,
  close,
};
