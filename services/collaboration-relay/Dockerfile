FROM node:24-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4444
EXPOSE 4444

USER node
CMD ["node", "server.mjs"]
