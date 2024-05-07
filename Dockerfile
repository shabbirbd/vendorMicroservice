FROM  node:18-slim AS builder


WORKDIR /app


COPY package*.json ./


RUN npm install

COPY . .

RUN npm run build

FROM node:18-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8000
CMD ["node", "dist/app.js"]


