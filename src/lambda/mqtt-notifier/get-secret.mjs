import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { writeFileSync } from "fs";

const secretArn = process.env.TAILSCALE_AUTH_KEY_SECRET_ARN;
const outputPath = "/tmp/tailscale-auth-key";

const client = new SecretsManagerClient();

const command = new GetSecretValueCommand({ SecretId: secretArn });
const response = await client.send(command);

const secretString = response.SecretString;
const parsed = JSON.parse(secretString);
const value = parsed?.value;

if (!value || value === "REPLACE_WITH_TAILSCALE_AUTHKEY") {
  console.error("Invalid or placeholder Tailscale auth key");
  process.exit(1);
}

writeFileSync(outputPath, value);
console.log("Auth key written to", outputPath);
