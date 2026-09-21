# ktayl-iam backend (NestJS) — multi-stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# Drop the base image's global npm (bundles a vulnerable node-tar; not needed at runtime).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Trust the minicloud CA so the server-to-server OIDC calls (token/userinfo → Authentik,
# which the cluster serves with the minicloud-CA cert) verify. The CA arrives as a BuildKit
# secret (raw PEM, NEVER base64) — NOT a build-arg, which would split the multi-line PEM on
# newlines into a broken single BEGIN line. Missing (local builds w/o the secret) → Node warns.
RUN --mount=type=secret,id=ca_cert \
    if [ -s /run/secrets/ca_cert ]; then cp /run/secrets/ca_cert /usr/local/share/minicloud-ca.crt; fi
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/minicloud-ca.crt
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
