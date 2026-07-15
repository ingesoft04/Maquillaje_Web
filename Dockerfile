FROM node:20-alpine

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY . .

EXPOSE 4000
USER node
CMD ["node", "index.js"]
