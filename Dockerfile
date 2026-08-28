# Multi-stage Docker build for CashClaw 24/7 Autonomous Agent
FROM node:20-alpine AS builder

WORKDIR /app

# Give build step (vite/tsup) 2GB memory headroom to prevent build-time OOM
ENV NODE_OPTIONS="--max-old-space-size=2048"

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
# Heap ceiling set to 384MB so V8 GC runs before Railway 512MB container limit is exceeded by RSS overhead
ENV NODE_OPTIONS="--max-old-space-size=384"

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled assets from builder stage
COPY --from=builder /app/dist ./dist

# Expose dashboard port
EXPOSE 3777

# Start CashClaw agent
CMD ["node", "--max-old-space-size=384", "dist/index.js"]