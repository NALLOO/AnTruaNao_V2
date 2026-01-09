FROM node:20-alpine AS base
WORKDIR /app

# Install OpenSSL and other dependencies for Prisma
RUN apk add --no-cache openssl libc6-compat

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Development stage
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npx prisma generate

# Production stage
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]
