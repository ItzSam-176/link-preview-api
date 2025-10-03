# Use lightweight Node base
FROM node:22-slim

# Install required system libraries for Chromium
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
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
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /usr/src/app

# Copy package.json and lock file first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy rest of the source code
COPY . .

# Default command
CMD ["node", "server.js"]
