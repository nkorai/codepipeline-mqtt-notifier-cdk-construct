import { Construct } from "constructs";
import { Duration, SecretValue, Stack } from "aws-cdk-lib";
import { DockerImageFunction, DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets";
import { Secret, ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Vpc, SubnetSelection, ISecurityGroup } from "aws-cdk-lib/aws-ec2";
import path from "path";

function resolvePipelineArn(
  scope: Construct,
  pipelineArnOrName: string,
): string {
  // Check if already an ARN
  if (/^arn:aws:codepipeline:[a-z0-9-]+:\d{12}:.+/i.test(pipelineArnOrName)) {
    return pipelineArnOrName;
  }
  // Derive ARN from name, using CDK context
  const stack = Stack.of(scope);
  return `arn:aws:codepipeline:${stack.region}:${stack.account}:${pipelineArnOrName}`;
}

export interface CodePipelineMqttNotifierProps {
  pipelineArnOrName: string;
  mqttBrokerHost: string;
  mqttTopic: string;
  mqttBrokerDnsServer?: string;
  enableTailscale?: boolean;
  enableMqttAuth?: boolean;
  vpc?: Vpc;
  subnetSelection?: SubnetSelection;
  securityGroups?: ISecurityGroup[];
}

export class CodePipelineMqttNotifier extends Construct {
  public readonly tailscaleAuthKeySecret?: ISecret;
  public readonly mqttBrokerUsernameSecret?: ISecret;
  public readonly mqttBrokerPasswordSecret?: ISecret;

  constructor(
    scope: Construct,
    id: string,
    props: CodePipelineMqttNotifierProps,
  ) {
    super(scope, id);
    const environment: Record<string, string> = {
      MQTT_BROKER_HOST: props.mqttBrokerHost,
      MQTT_TOPIC: props.mqttTopic,
      ...(props.mqttBrokerDnsServer && {
        MQTT_DNS_SERVER: props.mqttBrokerDnsServer,
      }),
    };

    if (props.enableTailscale) {
      this.tailscaleAuthKeySecret = new Secret(this, "TailscaleAuthKey", {
        secretName: `${id}-TailscaleAuthKey`,
        description: `Tailscale Auth Key for ${id}`,
        secretStringValue: SecretValue.unsafePlainText(
          JSON.stringify({ value: "REPLACE_WITH_TAILSCALE_AUTHKEY" }),
        ),
      });

      environment.TAILSCALE_AUTH_KEY_SECRET_ARN =
        this.tailscaleAuthKeySecret.secretArn;
    }

    if (props.enableMqttAuth) {
      this.mqttBrokerUsernameSecret = new Secret(this, "MqttBrokerUsername", {
        secretName: `${id}-MqttBrokerUsername`,
        description: `MQTT Broker Username for ${id}`,
        secretStringValue: SecretValue.unsafePlainText(
          JSON.stringify({ value: "REPLACE_WITH_MQTT_USERNAME" }),
        ),
      });

      this.mqttBrokerPasswordSecret = new Secret(this, "MqttBrokerPassword", {
        secretName: `${id}-MqttBrokerPassword`,
        description: `MQTT Broker Password for ${id}`,
        secretStringValue: SecretValue.unsafePlainText(
          JSON.stringify({ value: "REPLACE_WITH_MQTT_PASSWORD" }),
        ),
      });

      environment.MQTT_USERNAME_SECRET_ARN =
        this.mqttBrokerUsernameSecret.secretArn;
      environment.MQTT_PASSWORD_SECRET_ARN =
        this.mqttBrokerPasswordSecret.secretArn;
    }

    const lambdaFn = new DockerImageFunction(this, "MqttNotifierLambda", {
      code: DockerImageCode.fromImageAsset(
        path.join(__dirname, "lambda/mqtt-notifier"),
      ),
      timeout: Duration.minutes(2),
      memorySize: 1024,
      environment,
      vpc: props.vpc,
      vpcSubnets: props.subnetSelection,
      securityGroups: props.securityGroups,
    });
    if (props.enableTailscale && this.tailscaleAuthKeySecret) {
      this.tailscaleAuthKeySecret.grantRead(lambdaFn);
    }
    if (
      props.enableMqttAuth &&
      this.mqttBrokerUsernameSecret &&
      this.mqttBrokerPasswordSecret
    ) {
      this.mqttBrokerUsernameSecret.grantRead(lambdaFn);
      this.mqttBrokerPasswordSecret.grantRead(lambdaFn);
    }

    new Rule(this, "CodePipelineStateChangeRule", {
      eventPattern: {
        source: ["aws.codepipeline"],
        detailType: ["CodePipeline Pipeline Execution State Change"],
        resources: [resolvePipelineArn(this, props.pipelineArnOrName)],
      },
      targets: [new LambdaTarget(lambdaFn)],
    });
  }
}
