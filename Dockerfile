FROM oven/bun:1.4.2 AS build
WORKDIR /repo
COPY package.json bun.lock turbo.json tsconfig.base.json biome.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
COPY packages/kobra-protocol/package.json packages/kobra-protocol/
COPY packages/i18n/package.json packages/i18n/
RUN bun install --frozen-lockfile --filter '!@kobralink/desktop'
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages packages
RUN bun run --filter '@kobralink/shared' --filter '@kobralink/kobra-protocol' --filter '@kobralink/i18n' build \
    && bun run --filter '@kobralink/web' build \
    && cd apps/api && bunx prisma generate

FROM oven/bun:1.4.2-slim
ENV NODE_ENV=production KOBRALINK_DATA_DIR=/data KOBRALINK_PORT=7100 KOBRALINK_WEB_DIR=/repo/apps/web/dist
WORKDIR /repo
COPY --from=build /repo/package.json /repo/bun.lock /repo/tsconfig.base.json ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/web/package.json apps/web/
COPY --from=build /repo/apps/desktop/package.json apps/desktop/
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/kobra-protocol/package.json packages/kobra-protocol/
COPY --from=build /repo/packages/kobra-protocol/dist packages/kobra-protocol/dist
COPY --from=build /repo/packages/i18n/package.json packages/i18n/
COPY --from=build /repo/packages/i18n/dist packages/i18n/dist
RUN bun install --frozen-lockfile --production --filter '!@kobralink/desktop' --filter '!@kobralink/web'
COPY --from=build /repo/apps/api/src apps/api/src
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/apps/api/certs apps/api/certs
COPY --from=build /repo/apps/api/assets apps/api/assets
COPY --from=build /repo/apps/api/tsconfig.json apps/api/
COPY --from=build /repo/apps/web/dist apps/web/dist
WORKDIR /repo/apps/api
VOLUME ["/data"]
EXPOSE 7100 7125-7130
CMD ["bun", "src/main.ts"]
