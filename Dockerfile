FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY packages packages
COPY apps apps
RUN test -f apps/client/src/assets/manifest.json && test -d apps/client/public/assets \
  || (echo "Run 'python tools/build_assets.py' and 'python tools/build_audio.py' before docker build" && exit 1)
RUN cd apps/client && npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 STATIC_DIR=/app/apps/client/dist
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps/server apps/server
COPY --from=build /app/apps/client/dist apps/client/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/server/src/main.ts"]
