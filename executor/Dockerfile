# Base image pinned by digest so a compromised or re-tagged upstream can't
# silently change what we build. Tag kept alongside for readability — bump
# both deliberately when updating.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# The executor reads config from env and talks to an RPC endpoint; it never
# writes to disk, so it has no reason to hold root in the container.
USER node

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
