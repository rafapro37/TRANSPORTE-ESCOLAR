# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

# Honra a PORT fornecida pela plataforma e escuta em todas as interfaces.
CMD ["sh", "-c", "exec npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
