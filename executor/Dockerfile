# Base image pinned by digest so a compromised or re-tagged upstream can't
# silently change what we build. Tag kept alongside for readability — bump
# both deliberately when updating.
FROM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The executor reads config from env and talks to an RPC endpoint; it never
# writes to disk, so it has no reason to hold root in the container.
USER node

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
