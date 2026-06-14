FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# The committed package-lock.json pins tarball URLs to a private Intuit registry that the
# build container can't reach (ETIMEDOUT). Force the public npm registry and resolve fresh
# from package.json instead of the lockfile.
RUN npm config set registry https://registry.npmjs.org/ \
 && npm install --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_ vars are baked into the bundle at build time, so pass them here.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Invoke next via its node entrypoint (not the .bin shim) to be robust to bin-link quirks.
RUN node node_modules/next/dist/bin/next build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Bind to all interfaces so Docker's port mapping can reach the server.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "server.js"]
