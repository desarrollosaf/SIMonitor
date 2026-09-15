# syntax=docker/dockerfile:1

# ---- 1) Frontend (Angular) ----
FROM node:24-alpine AS frontend-build
# Prefijo bajo el que se publica la app, p.ej. "/redes/". Déjelo en "/" si se
# sirve desde la raíz del dominio.
ARG BASE_HREF=/
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build --base-href="$BASE_HREF"

# ---- 2) Backend (NestJS) ----
FROM node:24-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ---- 3) Runtime ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist/monitor-red/browser ./public

EXPOSE 3000
CMD ["node", "dist/main.js"]
