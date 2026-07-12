// sequelize-cli connection config (CommonJS — sequelize-cli's runner loads
// this via require(), and the project is "type": "module", so this file
// must keep the .cjs extension). DATABASE_URL is the single source of truth
// for the connection string, matching src/config/index.ts. Loads .env file
// for local development.
require('dotenv').config();

const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  // Same DB_SSL flag as src/lib/db.ts — sequelize-cli parses DATABASE_URL the
  // same way Sequelize does, so a `?sslmode=require` query param is ignored.
  dialectOptions: process.env.DB_SSL === 'true' ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
