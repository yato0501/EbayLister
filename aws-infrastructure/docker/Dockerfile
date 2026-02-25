FROM node:20-alpine

WORKDIR /app

# Copy package files from the EbayLister directory
# Build context should be the EbayLister/ directory:
#   docker build -f ../aws-infrastructure/docker/Dockerfile .
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the server source
COPY server/ ./server/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/index.js"]
