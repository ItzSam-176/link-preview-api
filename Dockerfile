# Base Node image
FROM node:22-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies for Chromium + fonts + utilities
RUN apt-get update && apt-get install -y \
    ca-certificates \
    wget \
    gnupg \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    dumb-init \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Add non-root user for Puppeteer
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

USER pptruser

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY --chown=pptruser:pptruser . .

# Expose port
EXPOSE 3000

# Entrypoint with dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server.js"]
