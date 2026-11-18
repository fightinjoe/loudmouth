FROM node:22-bookworm-slim
WORKDIR /workspace/src
COPY src/package.json src/package-lock.json ./
RUN npm ci
COPY src/ ./
RUN npm run schema:build && npm prune --omit=dev
WORKDIR /workspace
COPY scripts/protection-admin.js ./scripts/protection-admin.js
USER node
CMD ["node", "/workspace/scripts/protection-admin.js", "status", "--monitor"]
