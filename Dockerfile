# Single image reused by all node services (api + 4 workers); CMD is overridden
# per docker-compose service via `tsx src/index.ts <role>`. TypeScript runs
# directly via tsx (no build step); node:20-slim avoids musl/esbuild issues.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Install all deps: tsx runs the TS at runtime and sequelize-cli runs migrations.
RUN npm install && npm cache clean --force

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Default role is the API; workers override CMD in docker-compose.
CMD ["/app/node_modules/.bin/tsx", "src/index.ts", "api"]
