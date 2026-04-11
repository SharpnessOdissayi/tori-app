FROM node:22-alpine AS builder
RUN npm install -g pnpm

WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/appointment-booking/ ./artifacts/appointment-booking/

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/appointment-booking run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/artifacts/appointment-booking/dist ./dist
COPY artifacts/appointment-booking/serve.mjs ./serve.mjs

EXPOSE 8080
CMD ["node", "serve.mjs"]
