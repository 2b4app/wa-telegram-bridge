FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY src ./src

CMD ["node", "--import=tsx", "src/index.ts"]