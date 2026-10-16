# 自托管镜像：Node 24 直接运行 TypeScript，数据库用内置的 node:sqlite，无需编译原生模块
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/y2k.db \
    PORT=8787 \
    HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/node.ts"]
