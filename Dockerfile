# Plan B for machines without Node 24.12+. The full image brings build tools for better-sqlite3.
FROM node:26
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build:web
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/main.ts"]
