# Base image pinned by digest so a compromised or re-tagged upstream can't
# silently change what we build. Tag kept alongside for readability — bump
# both deliberately when updating.
FROM node:26-slim@sha256:deae974a69e140f44f434ab29cb519fb5f8fe250fd364b8ca446bd0761acdc6a

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The executor reads config from env and talks to an RPC endpoint; it never
# writes to disk, so it has no reason to hold root in the container.
USER node

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
