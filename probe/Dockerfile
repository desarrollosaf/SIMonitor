# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY probe/package.json probe/package-lock.json ./
RUN npm ci
COPY probe/ ./
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
# iputils-ping da un binario 'ping' más compatible que el busybox ping incluido en alpine.
RUN apk add --no-cache iputils
WORKDIR /app
COPY probe/package.json probe/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY probe/config ./config

RUN mkdir -p /app/data
VOLUME ["/app/data", "/app/config"]

CMD ["node", "dist/index.js"]
