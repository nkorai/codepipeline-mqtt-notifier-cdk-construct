# ---- Builder stage: install npm deps and build app ----
FROM public.ecr.aws/lambda/nodejs:20 AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# ---- Final stage: build minimal Lambda image ----
FROM public.ecr.aws/lambda/provided:al2

# Add Node.js runtime dependencies
RUN yum install -y tar gzip jq && yum clean all

# Copy the Lambda handler code and node_modules
COPY --from=builder /app /var/task

# Copy Tailscale binaries from the official Docker image
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /var/task/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /var/task/tailscale

# Add bootstrap script (Lambda entrypoint)
COPY bootstrap /var/runtime/bootstrap
RUN chmod +x /var/runtime/bootstrap

# The Lambda runtime expects /var/runtime/bootstrap as entrypoint
ENTRYPOINT ["/var/runtime/bootstrap"]
