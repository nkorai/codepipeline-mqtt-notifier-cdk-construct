import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import {
  Function as LambdaFunction,
  Runtime,
  Code,
} from "aws-cdk-lib/aws-lambda";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets";
import { Secret, ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Vpc, SubnetSelection, ISecurityGroup } from "aws-cdk-lib/aws-ec2";

export interface CodePipelineMqttNotifierProps {
  pipelineArnOrName: string;
  mqttBrokerHost: string;
  mqttTopic: string;
  useTailscale?: boolean;
  tailscaleAuthKeySecretArn?: string;
  mqttUsernameSecretArn?: string;
  mqttPasswordSecretArn?: string;
  environment?: Record<string, string>;
  vpc?: Vpc;
  subnetSelection?: SubnetSelection;
  securityGroups?: ISecurityGroup[];
}

export class CodePipelineMqttNotifier extends Construct {
  public readonly tailscaleAuthKeySecret: ISecret;
  public readonly mqttUsernameSecret: ISecret;
  public readonly mqttPasswordSecret: ISecret;

  constructor(
    scope: Construct,
    id: string,
    props: CodePipelineMqttNotifierProps,
  ) {
    super(scope, id);

    // Helper to create or import a secret
    const getOrCreateSecret = (
      name: string,
      providedArn?: string,
      defaultValue = "REPLACE_ME",
    ): ISecret => {
      if (providedArn) {
        return Secret.fromSecretCompleteArn(
          this,
          `${name}Imported`,
          providedArn,
        );
      }
      return new Secret(this, name, {
        secretName: `${id}-${name}`,
        description: `Secret for ${id} ${name}`,
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ value: defaultValue }),
          generateStringKey: "placeholder", // makes sure 'value' is set
        },
      });
    };

    // Create or import secrets
    this.tailscaleAuthKeySecret = getOrCreateSecret(
      "TailscaleAuthKey",
      props.tailscaleAuthKeySecretArn,
      "REPLACE_WITH_TAILSCALE_AUTHKEY",
    );
    this.mqttUsernameSecret = getOrCreateSecret(
      "MqttUsername",
      props.mqttUsernameSecretArn,
      "REPLACE_WITH_MQTT_USERNAME",
    );
    this.mqttPasswordSecret = getOrCreateSecret(
      "MqttPassword",
      props.mqttPasswordSecretArn,
      "REPLACE_WITH_MQTT_PASSWORD",
    );

    const environment: Record<string, string> = {
      MQTT_BROKER_HOST: props.mqttBrokerHost,
      MQTT_TOPIC: props.mqttTopic,
      USE_TAILSCALE: props.useTailscale ? "true" : "false",
      TAILSCALE_AUTH_KEY_SECRET_ARN: this.tailscaleAuthKeySecret.secretArn,
      MQTT_USERNAME_SECRET_ARN: this.mqttUsernameSecret.secretArn,
      MQTT_PASSWORD_SECRET_ARN: this.mqttPasswordSecret.secretArn,
      ...props.environment,
    };

    const lambdaFn = new LambdaFunction(this, "MqttNotifierLambda", {
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromAsset("lambda/mqtt-notifier"),
      timeout: Duration.minutes(2),
      environment,
      vpc: props.vpc,
      vpcSubnets: props.subnetSelection,
      securityGroups: props.securityGroups,
    });

    // Grant Lambda permission to read the secrets
    this.tailscaleAuthKeySecret.grantRead(lambdaFn);
    this.mqttUsernameSecret.grantRead(lambdaFn);
    this.mqttPasswordSecret.grantRead(lambdaFn);

    new Rule(this, "CodePipelineStateChangeRule", {
      eventPattern: {
        source: ["aws.codepipeline"],
        detailType: ["CodePipeline Pipeline Execution State Change"],
        resources: [props.pipelineArnOrName],
      },
      targets: [new LambdaTarget(lambdaFn)],
    });
  }
}
