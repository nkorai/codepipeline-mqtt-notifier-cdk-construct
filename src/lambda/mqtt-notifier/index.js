const mqtt = require("mqtt");
const { SocksProxyAgent } = require("socks-proxy-agent");
const net = require("net");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

process.on("unhandledRejection", (err) => {
  console.error("[FATAL] Unhandled rejection:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  process.exit(1);
});

console.log("[INFO] index.js entered");

async function waitForSocks5Ready({ host = "localhost", port = 1055, timeout = 10000 }) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ host, port }, () => {
          socket.end();
          resolve();
        });
        socket.on("error", reject);
        setTimeout(() => {
          socket.destroy();
          reject(new Error("SOCKS5 port timeout"));
        }, 1000);
      });
      console.log("[INFO] SOCKS5 proxy is accepting connections");
      return;
    } catch (err) {
      console.log("[INFO] Waiting for SOCKS5 proxy to be ready...");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("SOCKS5 proxy did not become ready in time");
}


async function retry(fn, retries = 3, delayMs = 2000) {
  let attempt = 1;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[WARN] Retry ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
      attempt++;
    }
  }
}

// Helper: Load secret by ARN and extract `value` from JSON or return raw string
async function getSecret(arn) {
  if (!arn) return undefined;
  console.log(`[INFO] Fetching secret: ${arn}`);
  const client = new SecretsManagerClient();
  const cmd = new GetSecretValueCommand({ SecretId: arn });
  const resp = await client.send(cmd);
  if ("SecretString" in resp) {
    try {
      const parsed = JSON.parse(resp.SecretString);
      if (typeof parsed === "object" && parsed.value) {
        console.log(`[INFO] Secret ${arn} resolved to .value field`);
        return parsed.value;
      }
    } catch {
      console.log(`[INFO] Secret ${arn} is raw string`);
    }
    return resp.SecretString;
  }
  return undefined;
}

// Wait until Tailscale is connected and routes are available
async function waitForTailscaleRoute({
  targetIp,
  maxWaitMs = 20000,
  intervalMs = 1000,
}) {
  const start = Date.now();
  let attempt = 1;

  while (Date.now() - start < maxWaitMs) {
    try {
      console.log(
        `[INFO] [Tailscale Wait] Attempt ${attempt++}: Checking status...`,
      );

      const TS_SOCKET = "/tmp/tailscale/tailscaled.sock";
      const { stdout } = await execAsync(
        `./tailscale --socket=${TS_SOCKET} status --json`,
      );
      const status = JSON.parse(stdout);

      const peerOk = Object.values(status.Peer).some(
        (peer) =>
          peer.TailscaleIPs?.some((ip) =>
            targetIp?.startsWith(ip.split(".")[0]),
          ) || false,
      );

      if (peerOk || Object.keys(status.Peer ?? {}).length > 0) {
        console.log(`[INFO] [Tailscale Wait] Found active peer routes`);
        return;
      } else {
        console.log(`[WARN] [Tailscale Wait] No usable peers yet`);
      }
    } catch (err) {
      console.warn(
        `[WARN] [Tailscale Wait] Failed to get status: ${err.message}`,
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`[ERROR] Tailscale routes not ready after ${maxWaitMs}ms`);
}

  console.log("[DEBUG] 1 ENV:", process.env);

// Main Lambda handler
exports.handler = async (event) => {
  console.log("[DEBUG] ENV:", process.env);

  const {
    MQTT_BROKER_HOST,
    MQTT_TOPIC,
    MQTT_USERNAME_SECRET_ARN,
    MQTT_PASSWORD_SECRET_ARN,
  } = process.env;

  if (!MQTT_BROKER_HOST) throw new Error("MQTT_BROKER_HOST must be set");
  if (!MQTT_TOPIC) throw new Error("MQTT_TOPIC must be set");

  console.log("[INFO] Polling for Tailscale route availability...");
  await waitForTailscaleRoute({ targetIp: MQTT_BROKER_HOST });
  console.log("[INFO] Tailscale routing confirmed. Proceeding...");

  // Extra: Debug Tailscale full status
  try {
    const { stdout } = await execAsync(`./tailscale --socket=/tmp/tailscale/tailscaled.sock status`);
    console.log("[DEBUG] tailscale status:\n" + stdout);
  } catch (e) {
    console.warn(`[WARN] Could not fetch Tailscale status for debug: ${e.message}`);
  }

  const socksAgent = new SocksProxyAgent("socks5h://localhost:1055");
  const mqttHost = MQTT_BROKER_HOST;
  const mqttPort = 1883;

  const username = MQTT_USERNAME_SECRET_ARN ? await getSecret(MQTT_USERNAME_SECRET_ARN) : undefined;
  const password = MQTT_PASSWORD_SECRET_ARN ? await getSecret(MQTT_PASSWORD_SECRET_ARN) : undefined;
  
  await waitForSocks5Ready({ port: 1055 });

  await retry(async () => {
    const stream = await socksAgent.createConnection({ host: mqttHost, port: mqttPort });

    return new Promise((resolve, reject) => {
      const mqttOpts = {
        stream,
        username,
        password,
      };

      const client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, mqttOpts);

      const timeout = setTimeout(() => {
        client.end();
        reject(new Error("MQTT connect timeout (15s)"));
      }, 15000);

      client.on("connect", () => {
        clearTimeout(timeout);
        console.log(`[INFO] Connected to MQTT broker via Tailscale SOCKS5`);

        const payload = {
          eventSource: event.source ?? "unknown",
          detailType: event["detail-type"] ?? "unknown",
          pipeline: event.detail?.pipeline ?? "unknown",
          state: event.detail?.state ?? "unknown",
          time: event.time ?? new Date().toISOString(),
          raw: event,
        };

        console.log(`[INFO] Publishing payload: ${JSON.stringify(payload)}`);

        client.publish(MQTT_TOPIC, JSON.stringify(payload), { qos: 1 }, (err) => {
          client.end();
          if (err) {
            console.error("[ERROR] Failed to publish:", err);
            reject(err);
          } else {
            console.log(`[INFO] Published ${payload.state} for pipeline ${payload.pipeline}`);
            resolve();
          }
        });
      });

      client.on("error", (err) => {
        clearTimeout(timeout);
        client.end();
        reject(err);
      });
    });
  }, 3, 3000); // Retry up to 3 times with backoff
};


// Local CLI runner (supports stdin or arg)
if (
  require.main === module &&
  process.env.AWS_LAMBDA_FUNCTION_NAME === undefined
) {
  const readStdin = async () =>
    new Promise((res) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => res(data));
    });

  const main = async () => {
    let input = process.argv[2];
    if (!input && !process.stdin.isTTY) input = await readStdin();
    if (!input) throw new Error("No input event provided via arg or stdin");

    console.log("Lambda handler starting with args:", process.argv);
    const event = JSON.parse(input);
    await exports.handler(event);
  };

  main().catch((err) => {
    console.error("Handler threw:", err);
    process.exit(1);
  });
}
