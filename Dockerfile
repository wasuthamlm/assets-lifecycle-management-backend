FROM node:22-alpine AS builder
WORKDIR /app
# argon2 มี native binding ต้อง compile ตอน install (node-gyp)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# ใช้ node_modules ที่ compile (รวม argon2 native binding) ไว้แล้วจาก builder stage แทนการ npm ci ซ้ำ —
# prune แค่ตัด devDependencies ทิ้ง ไม่ compile ใหม่ ไม่ต้องมี python3/make/g++ ใน stage นี้เลย
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
