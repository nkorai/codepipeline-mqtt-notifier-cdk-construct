import { App, Stack } from "aws-cdk-lib";
import { CodePipelineMqttNotifier } from "../src/CodePipelineMqttNotifier";
import { Template, Match } from "aws-cdk-lib/assertions";

describe("CodePipelineMqttNotifier", () => {
  it("synthesizes a Docker Lambda, EventBridge rule, and secrets", () => {
    const app = new App();
    const stack = new Stack(app, "TestStack");

    const notifier = new CodePipelineMqttNotifier(stack, "Notifier", {
      pipelineArnOrName:
        "arn:aws:codepipeline:us-east-1:123456789012:MyPipeline",
      mqttTopic: "pipelines/my-pipeline",
      mqttBrokerHost: "1.2.3.4",
      enableTailscale: true,
      enableMqttAuth: true,
    });

    const template = Template.fromStack(stack);

    // Check for Lambda (Docker image function)
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 120,
      MemorySize: 1024,
      Environment: Match.objectLike({
        Variables: Match.objectLike({
          MQTT_BROKER_HOST: "1.2.3.4",
          MQTT_TOPIC: "pipelines/my-pipeline",
        }),
      }),
      // Code.ImageUri: will be a hash, cannot check directly
    });

    // Check for EventBridge Rule
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: Match.objectLike({
        source: ["aws.codepipeline"],
        "detail-type": ["CodePipeline Pipeline Execution State Change"],
        resources: ["arn:aws:codepipeline:us-east-1:123456789012:MyPipeline"],
      }),
    });

    // Check that 3 secrets are present (Tailscale, MQTT username, MQTT password)
    template.resourceCountIs("AWS::SecretsManager::Secret", 3);

    // The construct should expose its secrets as properties
    expect(notifier.tailscaleAuthKeySecret).toBeDefined();
    expect(notifier.mqttBrokerUsernameSecret).toBeDefined();
    expect(notifier.mqttBrokerPasswordSecret).toBeDefined();
  });
});
