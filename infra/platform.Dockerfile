# syntax=docker/dockerfile:1

# Base image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies into temp directory (cached)
FROM base AS install
RUN mkdir -p /temp/dev
COPY apps/platform/package.json apps/platform/bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Development image
FROM base AS dev
COPY --from=install /temp/dev/node_modules node_modules
COPY apps/platform/ .

EXPOSE 3000
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
