import { App, Stack } from "aws-cdk-lib";
import { CodePipelineMqttNotifier } from "../src/CodePipelineMqttNotifier";
import { Template, Match } from "aws-cdk-lib/assertions";

describe("CodePipelineMqttNotifier", () => {
  it("synthesizes a Lambda, EventBridge rule, and secrets", () => {
    const app = new App();
    const stack = new Stack(app, "TestStack");

    const notifier = new CodePipelineMqttNotifier(stack, "Notifier", {
      pipelineArnOrName:
        "arn:aws:codepipeline:us-east-1:123456789012:MyPipeline",
      mqttTopic: "pipelines/my-pipeline",
      mqttBrokerHost: "1.2.3.4",
      useTailscale: true,
    });

    const template = Template.fromStack(stack);

    // Check for Lambda
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
      Runtime: "nodejs20.x",
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          MQTT_BROKER_HOST: "1.2.3.4",
          MQTT_TOPIC: "pipelines/my-pipeline",
          USE_TAILSCALE: "true",
        }),
      }),
    });

    // Check for EventBridge Rule
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: Match.objectLike({
        source: ["aws.codepipeline"],
        "detail-type": ["CodePipeline Pipeline Execution State Change"],
        resources: ["arn:aws:codepipeline:us-east-1:123456789012:MyPipeline"],
      }),
    });

    // Check that 3 secrets are present
    template.resourceCountIs("AWS::SecretsManager::Secret", 3);

    // The construct should expose its secrets as properties
    expect(notifier.tailscaleAuthKeySecret).toBeDefined();
    expect(notifier.mqttUsernameSecret).toBeDefined();
    expect(notifier.mqttPasswordSecret).toBeDefined();
  });

  it("uses provided secret ARNs when given", () => {
    const app = new App();
    const stack = new Stack(app, "TestStack");

    const notifier = new CodePipelineMqttNotifier(stack, "Notifier", {
      pipelineArnOrName: "pipeline-arn",
      mqttTopic: "topic",
      mqttBrokerHost: "host",
      tailscaleAuthKeySecretArn:
        "arn:aws:secretsmanager:us-east-1:123:secret:tailscale",
      mqttUsernameSecretArn:
        "arn:aws:secretsmanager:us-east-1:123:secret:mqtt-user",
      mqttPasswordSecretArn:
        "arn:aws:secretsmanager:us-east-1:123:secret:mqtt-pass",
    });

    // The construct should not create new secrets in this case
    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::SecretsManager::Secret", 0);

    // The construct should expose imported secrets as properties
    expect(notifier.tailscaleAuthKeySecret).toBeDefined();
    expect(notifier.mqttUsernameSecret).toBeDefined();
    expect(notifier.mqttPasswordSecret).toBeDefined();
  });
});
