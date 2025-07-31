# CodePipelineMqttNotifierCDKConstruct

> **AWS CDK Construct to forward CodePipeline events to an MQTT broker (with optional Tailscale integration).**  
> Ideal for home automation, dashboards, build monitors, and custom pipeline notifications.

---

## Features

- Instantly forward AWS CodePipeline state change events to your MQTT broker.
- Supports home/remote brokers via [Tailscale](https://tailscale.com/) (optional, private networking).
- Managed Secrets: Securely store MQTT and Tailscale credentials in AWS Secrets Manager (created automatically if enabled).
- Configurable VPC, subnet, and security group support for Lambda.
- Plug-and-play: Auto-creates secrets with placeholder values for first-time setup.
- Customizable Lambda handler (Node.js, MQTT.js, with Tailscale support built-in).

---

## Quick Start

### 1. Install

```bash
npm install codepipeline-mqtt-notifier-cdk-construct
```

### 2. Example Usage

```ts
import { CodePipelineMqttNotifier } from "codepipeline-mqtt-notifier-cdk-construct";

new CodePipelineMqttNotifier(this, "Notifier", {
  pipelineArnOrName: "arn:aws:codepipeline:us-east-1:123456789012:MyPipeline",
  mqttTopic: "pipelines/my-pipeline",
  mqttBrokerHost: "100.x.y.z", // Tailscale IP or public/static IP of your broker
});
```

This will:

- Deploy a Lambda function triggered by CodePipeline state change events.
- Send each event as JSON to your MQTT broker on the topic you specify.

---

## Advanced: Custom Networking, Tailscale, and MQTT Auth

```ts
import { Vpc, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";

const vpc = Vpc.fromLookup(this, "Vpc", { vpcId: "vpc-xxxxxx" });
const sg = new SecurityGroup(this, "LambdaSG", { vpc, allowAllOutbound: true });

new CodePipelineMqttNotifier(this, "Notifier", {
  pipelineArnOrName: "arn:aws:codepipeline:us-east-1:123456789012:MyPipeline",
  mqttTopic: "pipelines/my-pipeline",
  mqttBrokerHost: "100.x.y.z",
  enableTailscale: true,
  enableMqttAuth: true,
});
```

- If `enableTailscale` is true, a secret for the Tailscale Auth Key is created.
- If `enableMqttAuth` is true, secrets for MQTT broker username and password are created.
- Update secrets in AWS Secrets Manager after deployment with real values.

---

## Secret Management

Secrets are auto-created as needed, with clear placeholder values.

- **Tailscale Auth Key:**  
  Used for private Tailscale integration (see Tailscale Keys: https://login.tailscale.com/admin/settings/keys).
- **MQTT Username/Password:**  
  Only needed if your broker requires them.

After deploying, update the secret values in AWS Secrets Manager with your real credentials.

---

## Example: Events Published to MQTT

Each event is sent as a JSON payload on the topic you choose, with this shape:

```json
{
  "eventSource": "aws.codepipeline",
  "detailType": "CodePipeline Pipeline Execution State Change",
  "pipeline": "MyPipeline",
  "state": "SUCCEEDED",
  "time": "2025-07-30T20:00:00Z",
  "raw": {
    /* Full AWS EventBridge event */
  }
}
```

---

### Example 1: New Source Code Push (Pipeline Started)

```json
{
  "eventSource": "aws.codepipeline",
  "detailType": "CodePipeline Pipeline Execution State Change",
  "pipeline": "MyPipeline",
  "state": "STARTED",
  "time": "2025-07-30T20:00:00Z",
  "raw": {
    /* ... */
  }
}
```

### Example 2: Pipeline Actively Running

```json
{
  "eventSource": "aws.codepipeline",
  "detailType": "CodePipeline Pipeline Execution State Change",
  "pipeline": "MyPipeline",
  "state": "IN_PROGRESS",
  "time": "2025-07-30T20:01:30Z",
  "raw": {
    /* ... */
  }
}
```

### Example 3: Pipeline Succeeded

```json
{
  "eventSource": "aws.codepipeline",
  "detailType": "CodePipeline Pipeline Execution State Change",
  "pipeline": "MyPipeline",
  "state": "SUCCEEDED",
  "time": "2025-07-30T20:02:50Z",
  "raw": {
    /* ... */
  }
}
```

### Example 4: Pipeline Failed

```json
{
  "eventSource": "aws.codepipeline",
  "detailType": "CodePipeline Pipeline Execution State Change",
  "pipeline": "MyPipeline",
  "state": "FAILED",
  "time": "2025-07-30T20:02:50Z",
  "raw": {
    /* ... */
  }
}
```

States you may see include: `STARTED`, `RESUMED`, `CANCELED`, `FAILED`, `SUCCEEDED`, `SUPERSEDED`, `IN_PROGRESS`.

---

## Troubleshooting & Notes

- If you see placeholder warnings in CloudWatch logs, update the corresponding secret value in AWS Secrets Manager.
- Tailscale startup adds a few seconds per cold start.
- If Lambda cannot connect to your MQTT broker, check VPC, subnet, and security group settings.
- No credentials are required on MQTT clients—everything is push-based from AWS.
- Lambda code loads secrets at runtime using the AWS SDK for best security.

---

## Security

- Secrets are never hard-coded in Lambda, only read securely at runtime.
- The minimum privileges needed are automatically granted to the Lambda.
- Construct creates secrets with names like `<stack>-Notifier-TailscaleAuthKey`, etc.

---

## Development & Contribution

Local testing commands

```bash
docker build -t mqtt-lambda-tailscale .

echo '{"source":"aws.codepipeline","detail-type":"CodePipeline Pipeline Execution State Change","detail":{"pipeline":"ExamplePipeline","state":"SUCCEEDED"},"time":"2025-07-31T13:00:00Z"}' | docker run -i --rm \
  -e MQTT_BROKER_HOST=REPLACE_WITH_HOST \
  -e MQTT_TOPIC=REPLACE_WITH_TOPIC \
  -e MQTT_DNS_SERVER=REPLACE_IF_NEEDED \
  -e MQTT_USERNAME_SECRET_ARN=REPLACE_IF_NEEDED \
  -e MQTT_PASSWORD_SECRET_ARN=REPLACE_IF_NEEDED \
  -e TAILSCALE_AUTH_KEY_SECRET_ARN=REPLACE_WITH_TAILSCALE_AUTHKEY \
  -e AWS_REGION=REPLACE_WITH_YOUR_REGION_IF_NEEDED \
  -e AWS_PROFILE=REPLACE_WITH_YOUR_PROFILE_IF_NEEDED \
  -v ~/.aws:/root/.aws \
  -v ~/.aws/sso:/root/.aws/sso:ro \
  mqtt-lambda-tailscale
```

Example local test

```bash
echo '{"source":"aws.codepipeline","detail-type":"CodePipeline Pipeline Execution State Change","detail":{"pipeline":"ExamplePipeline","state":"SUCCEEDED"},"time":"2025-07-31T13:00:00Z"}' | docker run -i --rm \
  -e MQTT_BROKER_HOST=mybroker.com \
  -e MQTT_TOPIC=pipelines/mypipeline/status \
  -e AWS_REGION=us-east-1 \
  -e AWS_PROFILE=my-profile \
  -v ~/.aws:/root/.aws \
  -v ~/.aws/sso:/root/.aws/sso:ro \
  mqtt-lambda-tailscale
```

- Pull requests welcome!
- See `lambda/mqtt-notifier/index.js` for Lambda source.
- Please open an issue or PR if you add support for other event types or protocols.

---

## License

MIT

---

### Questions or need a feature?

Open an issue or PR at: https://github.com/yourusername/codepipeline-mqtt-notifier-cdk-construct/issues
