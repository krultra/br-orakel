FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG ORAKEL_DEMO_RELEASE=0
ARG ORAKEL_BUILD_NUMBER
ARG ORAKEL_ENVIRONMENT=test
ENV ORAKEL_DEMO_RELEASE=$ORAKEL_DEMO_RELEASE
ENV ORAKEL_BUILD_NUMBER=$ORAKEL_BUILD_NUMBER
ENV ORAKEL_ENVIRONMENT=$ORAKEL_ENVIRONMENT
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
EXPOSE 3001
CMD ["npm", "run", "start"]
