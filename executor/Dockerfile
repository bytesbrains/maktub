# Base image pinned by digest so a compromised or re-tagged upstream can't
# silently change what we build. Tag kept alongside for readability — bump
# both deliberately when updating.
FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The executor reads config from env and talks to an RPC endpoint; it never
# writes to disk, so it has no reason to hold root in the container.
USER node

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
