FROM node:20-alpine AS base
WORKDIR /app

# Install OpenSSL and other dependencies for Prisma
RUN apk add --no-cache openssl libc6-compat

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma Client before build
RUN npx prisma generate
RUN npm run build

# Production stage
FROM base AS production
ENV NODE_ENV=production
ENV PORT=4000

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy only production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema and generate client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=builder /app/build ./build

# Copy package.json and other necessary files
COPY package.json ./
COPY react-router.config.ts ./

# Generate Prisma Client in production stage
RUN npx prisma generate

EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/ || exit 1

# Use react-router-serve to serve the application
# PORT environment variable will be used by react-router-serve
CMD ["npm", "run", "start"]