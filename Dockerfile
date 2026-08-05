FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git \
	&& rm -rf /var/lib/apt/lists/*

RUN npm install

COPY src ./src

CMD ["node", "--import=tsx", "src/index.ts"]