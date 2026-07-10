module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  extends: [
    'airbnb-base',
    'airbnb-typescript/base',
    'prettier',
  ],
  plugins: ['@typescript-eslint'],
  rules: {
    'import/extensions': 'off',
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['test/**', 'vitest.config.ts'] }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    curly: ['error', 'all'],
    'object-curly-newline': [
      'error',
      {
        ObjectExpression: { minProperties: 2, multiline: true, consistent: true },
      },
    ],
  },
  ignorePatterns: ['node_modules', 'src/database/migrations/*.js'],
};
