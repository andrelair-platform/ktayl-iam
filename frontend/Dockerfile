# ktayl-iam frontend (Next.js) — multi-stage, standalone output
ARG CACHEBUST=local   # unused here; declared so the shared CI build-arg doesn't warn
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next.js standalone bundle (see next.config.ts output: 'standalone')
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Drop the base image's global npm (bundles a vulnerable node-tar; not needed at runtime).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
EXPOSE 3000
CMD ["node", "server.js"]
