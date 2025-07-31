const mqtt = require("mqtt");
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
    }
    return resp.SecretString;
  }
  return undefined;
}

exports.handler = async (event) => {
  const {
    MQTT_BROKER_HOST,
    MQTT_TOPIC,
    MQTT_USERNAME_SECRET_ARN,
    MQTT_PASSWORD_SECRET_ARN,
  } = process.env;

  if (!MQTT_BROKER_HOST) throw new Error("MQTT_BROKER_HOST must be set");
  if (!MQTT_TOPIC) throw new Error("MQTT_TOPIC must be set");

  // Load secrets if provided (could do Promise.all, but sequential is fine for three)
  let mqttUsername, mqttPassword;
  if (MQTT_USERNAME_SECRET_ARN)
    mqttUsername = await getSecret(MQTT_USERNAME_SECRET_ARN);
  if (MQTT_PASSWORD_SECRET_ARN)
    mqttPassword = await getSecret(MQTT_PASSWORD_SECRET_ARN);

  const mqttOpts = {};
  if (mqttUsername) mqttOpts.username = mqttUsername;
  if (mqttPassword) mqttOpts.password = mqttPassword;

  // Use Tailscale SOCKS5 proxy if present
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
          console.log(
            `Event (${payload.state}) published to topic ${MQTT_TOPIC} for pipeline ${payload.pipeline}`,
          );
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

// Local Testing
if (require.main === module) {
  const input = process.argv[2];
  const event = input ? JSON.parse(input) : {};
  console.log("Lambda handler starting...");
  exports.handler(event).catch((err) => {
    console.error("Handler threw:", err);
    process.exit(1);
  });
}
