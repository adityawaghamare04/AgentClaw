# Multi-stage Docker build for CashClaw 24/7 Autonomous Agent
FROM node:20-alpine AS builder

WORKDIR /app

# Give build step 450MB memory ceiling to prevent build-time OOM on Railway 512MB RAM containers
ENV NODE_OPTIONS="--max-old-space-size=450"

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build:all

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3777
ENV NODE_OPTIONS="--max-old-space-size=384"

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled assets from builder stage
COPY --from=builder /app/dist ./dist

# Expose dashboard port
EXPOSE 3777

# Start CashClaw agent with GC enabled and 384MB heap limit
CMD ["node", "--expose-gc", "--max-old-space-size=384", "dist/index.js"]