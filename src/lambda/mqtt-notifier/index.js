const mqtt = require("mqtt");
const { execSync } = require("child_process");
const fs = require("fs");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

// Helper to load a secret by ARN and extract the .value property if it's a JSON object
async function getSecret(arn) {
  if (!arn) return undefined;
  const client = new SecretsManagerClient();
  const cmd = new GetSecretValueCommand({ SecretId: arn });
  const resp = await client.send(cmd);
  if ("SecretString" in resp) {
    try {
      // Our default generated secrets are {"value":"..."}
      const parsed = JSON.parse(resp.SecretString);
      if (typeof parsed === "object" && parsed.value) return parsed.value;
    } catch {
      // Not JSON, just return the string
      return resp.SecretString;
    }
    return resp.SecretString;
  }
  return undefined;
}

async function maybeStartTailscale(authKey) {
  // Lambda ephemeral /tmp for the tailscale state, write the key
  fs.writeFileSync("/tmp/tailscale.key", authKey);

  // NOTE: 'tailscale' must be available in the Lambda package (see deployment docs)
  try {
    execSync(
      `./tailscale/tailscale up --authkey $(cat /tmp/tailscale.key) --hostname mqtt-lambda --accept-routes --reset --state=/tmp/tailscale.state --timeout=15s`,
      {
        stdio: "inherit",
      },
    );
    console.log("Tailscale started!");
  } catch (e) {
    console.error("Failed to start Tailscale", e);
    throw e;
  }
}

exports.handler = async (event) => {
  const {
    MQTT_BROKER_HOST,
    MQTT_TOPIC,
    USE_TAILSCALE,
    TAILSCALE_AUTH_KEY_SECRET_ARN,
    MQTT_USERNAME_SECRET_ARN,
    MQTT_PASSWORD_SECRET_ARN,
  } = process.env;

  if (!MQTT_BROKER_HOST) throw new Error("MQTT_BROKER_HOST must be set");
  if (!MQTT_TOPIC) throw new Error("MQTT_TOPIC must be set");

  // Load secrets if provided
  let mqttUsername, mqttPassword, tailscaleAuthKey;
  if (MQTT_USERNAME_SECRET_ARN)
    mqttUsername = await getSecret(MQTT_USERNAME_SECRET_ARN);
  if (MQTT_PASSWORD_SECRET_ARN)
    mqttPassword = await getSecret(MQTT_PASSWORD_SECRET_ARN);
  if (USE_TAILSCALE === "true" && TAILSCALE_AUTH_KEY_SECRET_ARN) {
    tailscaleAuthKey = await getSecret(TAILSCALE_AUTH_KEY_SECRET_ARN);
    if (!tailscaleAuthKey)
      throw new Error("Tailscale auth key is required for Tailscale mode");
    await maybeStartTailscale(tailscaleAuthKey);
  }

  // Warn if any secret is a placeholder
  if (
    USE_TAILSCALE === "true" &&
    tailscaleAuthKey &&
    tailscaleAuthKey.includes("REPLACE_WITH_TAILSCALE_AUTHKEY")
  ) {
    console.warn(
      "[WARN] Tailscale integration is enabled but the auth key secret is set to a placeholder value! Please update your secret in AWS Secrets Manager.",
    );
  }
  if (mqttUsername && mqttUsername.includes("REPLACE_WITH_MQTT_USERNAME")) {
    console.warn(
      "[WARN] MQTT username secret is set to a placeholder value! Please update your secret in AWS Secrets Manager.",
    );
  }
  if (mqttPassword && mqttPassword.includes("REPLACE_WITH_MQTT_PASSWORD")) {
    console.warn(
      "[WARN] MQTT password secret is set to a placeholder value! Please update your secret in AWS Secrets Manager.",
    );
  }

  const mqttOpts = {};
  if (mqttUsername) mqttOpts.username = mqttUsername;
  if (mqttPassword) mqttOpts.password = mqttPassword;

  const brokerUri = `mqtt://${MQTT_BROKER_HOST}`;

  const client = mqtt.connect(brokerUri, mqttOpts);

  await new Promise((resolve, reject) => {
    client.on("connect", () => {
      console.log(`Connected to MQTT broker at ${brokerUri}`);
      const payload = {
        eventSource: event.source,
        detailType: event["detail-type"],
        pipeline: event.detail?.pipeline,
        state: event.detail?.state,
        time: event.time,
        raw: event,
      };
      client.publish(MQTT_TOPIC, JSON.stringify(payload), { qos: 1 }, (err) => {
        client.end();
        if (err) {
          console.error("Failed to publish to MQTT:", err);
          reject(err);
        } else {
          console.log("Event published to MQTT topic:", MQTT_TOPIC);
          resolve();
        }
      });
    });

    client.on("error", (err) => {
      client.end();
      console.error("MQTT client error:", err);
      reject(err);
    });
  });
};
