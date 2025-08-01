FROM public.ecr.aws/lambda/nodejs:18
WORKDIR /var/task

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy all local source code
COPY . .

# Add Tailscale binaries
COPY --from=public.ecr.aws/w1n5o3h3/tailscale:latest /usr/local/bin/tailscaled /var/task/tailscaled
COPY --from=public.ecr.aws/w1n5o3h3/tailscale:latest /usr/local/bin/tailscale /var/task/tailscale

# Add custom Lambda bootstrap
COPY bootstrap /var/runtime/bootstrap

ENTRYPOINT ["/var/runtime/bootstrap"]
