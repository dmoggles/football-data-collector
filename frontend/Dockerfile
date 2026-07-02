# Build stage — context must be the project root so shared/ is accessible.
# frontend/src/domain/*.ts imports ../../../shared/ (3 levels up from src/domain/).
FROM node:22-alpine AS builder
WORKDIR /project/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY shared/ ../shared/
RUN npm run build

# Serve stage
FROM nginx:stable-alpine AS runtime
COPY --from=builder /project/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
