# Base image pinned by digest so a compromised or re-tagged upstream can't
# silently change what we build. Tag kept alongside for readability — bump
# both deliberately when updating.
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The executor reads config from env and talks to an RPC endpoint; it never
# writes to disk, so it has no reason to hold root in the container.
USER node

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
