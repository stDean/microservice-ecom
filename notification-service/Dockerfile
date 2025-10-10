# -----------------------------------------------------------------------------
# STAGE 1: BUILDER (for development)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

CMD ["npm", "run", "build"]

# -----------------------------------------------------------------------------
# STAGE 2: PRODUCTION
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3002

CMD ["npm", "run", "start"]