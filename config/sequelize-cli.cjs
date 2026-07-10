// sequelize-cli connection config (CommonJS — sequelize-cli's runner loads
// this via require(), and the project is "type": "module", so this file
// must keep the .cjs extension). DATABASE_URL is the single source of truth
// for the connection string, matching src/config/index.ts. Reads directly
// from process.env, same as the rest of the project — no dotenv loading.

const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
