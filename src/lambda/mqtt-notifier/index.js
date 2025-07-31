const mqtt = require("mqtt");
const net = require("net");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

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

// Helper: Wait for port to open (e.g., MQTT broker via Tailscale)
async function waitForPortOpen({
  host,
  port,
  timeoutMs = 15000,
  intervalMs = 500,
}) {
  const start = Date.now();
  let attempt = 1;
  while (Date.now() - start < timeoutMs) {
    try {
      console.log(
        `[INFO] Attempt ${attempt++}: Connecting to ${host}:${port}...`,
      );
      await new Promise((res, rej) => {
        const socket = net.connect({ host, port, timeout: 1000 });
        socket.on("connect", () => {
          socket.destroy();
          res();
        });
        socket.on("error", rej);
        socket.on("timeout", rej);
      });
      console.log(`[INFO] Port is open.`);
      return true;
    } catch (err) {
      console.log(`[WARN] Connection attempt failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(
    `Timeout: Unable to connect to ${host}:${port} after ${timeoutMs}ms`,
  );
}

// Main Lambda handler
exports.handler = async (event) => {
  const {
    MQTT_BROKER_HOST,
    MQTT_TOPIC,
    MQTT_USERNAME_SECRET_ARN,
    MQTT_PASSWORD_SECRET_ARN,
  } = process.env;

  if (!MQTT_BROKER_HOST) throw new Error("MQTT_BROKER_HOST must be set");
  if (!MQTT_TOPIC) throw new Error("MQTT_TOPIC must be set");

  const mqttHost = MQTT_BROKER_HOST;
  const mqttPort = 1883;
  const brokerUri = `mqtt://${mqttHost}`;

  console.log(`[INFO] Using broker URI: ${brokerUri}`);
  console.log(`[INFO] Waiting for broker to be reachable...`);

  await waitForPortOpen({ host: mqttHost, port: mqttPort });

  const mqttOpts = {};
  if (MQTT_USERNAME_SECRET_ARN)
    mqttOpts.username = await getSecret(MQTT_USERNAME_SECRET_ARN);
  if (MQTT_PASSWORD_SECRET_ARN)
    mqttOpts.password = await getSecret(MQTT_PASSWORD_SECRET_ARN);

  await new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUri, mqttOpts);
    const timeout = setTimeout(() => {
      client.end();
      reject(new Error("MQTT connect timeout"));
    }, 5000);

    client.on("connect", () => {
      clearTimeout(timeout);
      console.log(`[INFO] Connected to MQTT broker`);

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
          console.log(
            `[INFO] Published ${payload.state} for pipeline ${payload.pipeline} to topic ${MQTT_TOPIC}`,
          );
          resolve();
        }
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      client.end();
      console.error("[ERROR] MQTT connection error:", err);
      reject(err);
    });
  });
};

// Local CLI runner (supports stdin or arg)
if (require.main === module) {
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
