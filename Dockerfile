FROM node:22-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    DISABLE_LINK_PREVIEWS=1

WORKDIR /app
COPY package.json package-lock.json ./
# The production image does not fetch previews for links in messages.
RUN npm ci --omit=dev \
    && rm -rf /app/node_modules/link-preview-js \
    && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# The data folder holds the WhatsApp login and your schedules. Mount a persistent
# volume at /data (docker-compose.yml does this; on Railway add a volume at /data).
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
