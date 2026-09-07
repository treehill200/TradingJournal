# Build ---------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && cp -R node_modules /tmp/prod_modules \
 && npm ci --ignore-scripts

COPY . .
RUN npm run build

# Run -----------------------------------------------------------------------
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/journal.db

COPY --from=build /tmp/prod_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts

# Mount a volume here so the journal survives redeploys.
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "next", "start"]
