FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
WORKDIR /app/chatgpt
RUN npm ci && npm run build && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.65.1-noble
ENV NODE_ENV=production PORT=8080
WORKDIR /app/chatgpt
COPY --from=build /app/chatgpt/node_modules ./node_modules
COPY --from=build /app/chatgpt/dist ./dist
COPY --from=build /app/chatgpt/package.json ./package.json
USER pwuser
CMD ["node", "dist/server.mjs"]
