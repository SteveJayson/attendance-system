FROM node:20-alpine
WORKDIR /app
COPY package.json server.js index.html manifest.webmanifest sw.js icon-192.png icon-512.png ./
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
