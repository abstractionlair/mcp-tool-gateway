# Multi-stage build for MCP Tool Gateway
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY node/service/package*.json ./
COPY node/service/tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY node/service/src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY node/service/package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Create directory for logs and config
RUN mkdir -p /app/logs /app/config

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8787
ENV LOG_LEVEL=info
# Inside a container the server must bind all interfaces for published ports
# to work; restrict exposure at the port-publish level (see docker-compose.yml)
ENV HOST=0.0.0.0

# Expose port
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start server
CMD ["node", "dist/server.js"]
