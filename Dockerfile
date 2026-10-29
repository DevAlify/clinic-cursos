# Plan B for machines without Node 24.12+. The full image brings build tools for better-sqlite3.
# One image for the three services: compose.yaml picks the command (core, erp or waha).
FROM node:26
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build:web
EXPOSE 3000 3100 3200
CMD ["node", "src/main.ts"]
