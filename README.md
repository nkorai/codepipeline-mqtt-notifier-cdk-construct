# CodePipelineMqttNotifierCDKConstruct

> **AWS CDK Construct to forward CodePipeline events to an MQTT broker (with optional Tailscale integration).**  
> Ideal for home automation, dashboard lights, build monitors, and custom pipeline notifications.

---

## Features

- **Instantly forward AWS CodePipeline state change events to your MQTT broker.**
- **Supports home/remote brokers** via [Tailscale](https://tailscale.com/) (optional, private networking).
- **Managed Secrets:** Securely store MQTT and Tailscale credentials in AWS Secrets Manager.
- **Configurable VPC, subnet, and security group support** for Lambda.
- **Plug-and-play experience:** Construct can auto-create secrets with clear placeholder values for first-time setup.
- **Customizable Lambda** (Node.js, MQTT.js, Tailscale binary support).

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
  mqttBrokerHost: "100.x.y.z", // Tailscale IP of your home MQTT broker or public/static IP of your broker
});
```

This will:

- **Deploy a Lambda function** triggered by CodePipeline state change events.
- **Send each event** as JSON to your MQTT broker on the topic you specify.

---

## Advanced: Custom Networking, Tailscale, and Secrets

```ts
import { Vpc, SecurityGroup, SubnetType } from "aws-cdk-lib/aws-ec2";

const vpc = Vpc.fromLookup(this, "Vpc", { vpcId: "vpc-xxxxxx" });
const sg = new SecurityGroup(this, "LambdaSG", { vpc, allowAllOutbound: true });

new CodePipelineMqttNotifier(this, "Notifier", {
  pipelineArnOrName: "arn:aws:codepipeline:us-east-1:123456789012:MyPipeline",
  mqttTopic: "pipelines/my-pipeline",
  mqttBrokerHost: "100.x.y.z",
  useTailscale: true,
  vpc,
  subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
  securityGroups: [sg],
  // Optionally: Provide secret ARNs if reusing existing secrets.
  // tailscaleAuthKeySecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-tailscale-key',
  // mqttUsernameSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-mqtt-user',
  // mqttPasswordSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-mqtt-password',
});
```

---

## Secret Management

The construct will **auto-create secrets with obvious placeholder values** unless you supply your own Secret ARNs.

- **Tailscale Auth Key:**  
  Used for private Tailscale integration (see [Tailscale Keys](https://login.tailscale.com/admin/settings/keys)).
- **MQTT Username/Password:**  
  Optional, only needed if your broker requires them.

After deploying, **update the secret values in AWS Secrets Manager** with your real credentials.

---

## Lambda Tailscale Binary

If using Tailscale, you **must bundle the [Tailscale static binaries](https://pkgs.tailscale.com/stable/#static-binaries)** (`tailscale`, `tailscaled`) in your Lambda package under a `tailscale/` directory.

Sample build step:

```json
"scripts": {
  "build:lambda": "cd lambda/mqtt-notifier && npm install && mkdir -p tailscale && curl -L https://pkgs.tailscale.com/stable/tailscale_amd64.tgz | tar xz -C tailscale && chmod +x tailscale/tailscale tailscale/tailscaled && cd ../..",
  "build": "tsc && npm run build:lambda"
}
```

---

## What is Sent to MQTT?

A JSON message like:

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

## Troubleshooting & Notes

- If you see **placeholder warnings** in CloudWatch logs, update the corresponding secret value in AWS Secrets Manager.
- **Tailscale startup** adds a few seconds per cold start.
- If Lambda cannot connect to your MQTT broker, check VPC, subnet, and security group settings.
- **No credentials required on Pi/clients:** All logic is push from AWS to MQTT.
- Lambda code loads secrets **at runtime** using the AWS SDK for best security.

---

## Security

- Secrets are never hard-coded in Lambda, only read securely at runtime.
- Grant the minimum privileges needed to the Lambda (handled automatically by the construct).
- By default, construct creates secrets with names like `<stack>-Notifier-TailscaleAuthKey`, etc.

---

## Development & Contribution

- Pull requests welcome!
- See `lambda/mqtt-notifier/index.js` for Lambda source.
- Please open an issue or PR if you add support for other event types or protocols.

---

## License

MIT

---

### Questions or need a feature?

Open an [issue](https://github.com/yourusername/codepipeline-mqtt-notifier-cdk-construct/issues) or PR!
