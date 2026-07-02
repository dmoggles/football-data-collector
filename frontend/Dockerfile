# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_API_BASE_URL is intentionally empty — nginx proxies all API paths from same origin
RUN npm run build

# Serve stage
FROM nginx:stable-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
