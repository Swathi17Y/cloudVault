# ================================
# Stage 1: Server
# ================================
FROM node:20-alpine AS server

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/ .

EXPOSE 5000
CMD ["node", "src/server.js"]

# ================================
# Stage 2: Client Dev
# ================================
FROM node:20-alpine AS client-dev

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ================================
# Stage 3: Client Build (Production)
# ================================
FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ .
RUN npm run build

# ================================
# Stage 4: Production (Nginx + Server)
# ================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy server
COPY --from=server /app/server ./server

# Copy built client
COPY --from=client-build /app/client/dist ./client/dist

# Install production dependencies only
WORKDIR /app/server
RUN npm ci --only=production

EXPOSE 5000
CMD ["node", "src/server.js"]
