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
COPY --from=public.ecr.aws/w1n5o3h3/tailscale:latest /usr/local/bin/tailscaled /var/task/tailscaled
COPY --from=public.ecr.aws/w1n5o3h3/tailscale:latest /usr/local/bin/tailscale /var/task/tailscale

# Add bootstrap
COPY bootstrap /var/runtime/bootstrap

ENTRYPOINT ["/var/runtime/bootstrap"]
