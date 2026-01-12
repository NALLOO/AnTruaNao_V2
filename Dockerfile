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
RUN npm run build
RUN npx prisma generate

# Production stage
FROM base AS production
ENV NODE_ENV=production

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema
COPY --from=builder /app/prisma ./prisma

# Copy built application
COPY --from=builder /app/build ./build

# Copy package.json
COPY package.json ./

# Generate Prisma Client trong production stage
RUN npx prisma generate

EXPOSE 4000
CMD ["npm", "run", "start"]