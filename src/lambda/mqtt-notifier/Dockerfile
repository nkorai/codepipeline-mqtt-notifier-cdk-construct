# ---- Builder ----
FROM public.ecr.aws/docker/library/node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# ---- Final Image ----
FROM public.ecr.aws/lambda/nodejs:18
WORKDIR /var/task

COPY --from=builder /app /var/task

# Add get-secret.mjs runtime fetcher
COPY get-secret.mjs /var/task/get-secret.mjs

# Add Tailscale
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /var/task/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /var/task/tailscale

# Add bootstrap
COPY bootstrap /var/runtime/bootstrap

# Add required tools for DNS resolution via Tailscale DNS
RUN yum install -y bind-utils

ENTRYPOINT ["/var/runtime/bootstrap"]
