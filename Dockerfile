# FROM  node:18-slim AS builder


# WORKDIR /app


# COPY package*.json ./


# RUN npm install

# COPY . .

# RUN npm run build

# FROM node:18-slim

# WORKDIR /app

# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules

# EXPOSE 8000
# CMD ["node", "dist/app.js"]


# Build stage
FROM node:21-slim AS builder

# Install Python and other necessary build tools
# RUN apt-get update && apt-get install -y python3 make g++ ffmpeg \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM node:21-slim

# Install Python and FFmpeg in the final image
# RUN apt-get update && apt-get install -y python3 ffmpeg \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8000
CMD ["node", "dist/app.js"]

