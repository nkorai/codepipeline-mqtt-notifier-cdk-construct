import { Construct } from 'constructs';
import { aws_events as events, aws_lambda as lambda, aws_iam as iam, aws_events_targets as targets, Duration } from 'aws-cdk-lib';

export interface CodePipelineMqttNotifierProps {
  /**
   * CodePipeline ARN or name to subscribe to.
   */
  pipelineArnOrName: string;

  /**
   * The MQTT broker host (private, e.g. your Tailscale IP)
   */
  mqttBrokerHost: string;

  /**
   * MQTT topic to publish messages to.
   */
  mqttTopic: string;

  /**
   * Optional Lambda environment overrides.
   */
  environment?: Record<string, string>;
}

export class CodePipelineMqttNotifier extends Construct {
  constructor(scope: Construct, id: string, props: CodePipelineMqttNotifierProps) {
    super(scope, id);

    // Lambda to send messages to MQTT
    const lambdaFn = new lambda.Function(this, 'MqttNotifierLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/mqtt-notifier'), // You'll make this dir next
      timeout: Duration.seconds(30),
      environment: {
        MQTT_BROKER_HOST: props.mqttBrokerHost,
        MQTT_TOPIC: props.mqttTopic,
        ...(props.environment || {})
      },
      // You'll add secrets for Tailscale auth, MQTT creds etc. later
    });

    // Let the Lambda be invoked by EventBridge
    lambdaFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['codepipeline:GetPipelineExecution'],
      resources: ['*'], // you can scope later
    }));

    // EventBridge rule for CodePipeline state changes
    new events.Rule(this, 'CodePipelineStateChangeRule', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        resources: [props.pipelineArnOrName],
      },
      targets: [new targets.LambdaFunction(lambdaFn)],
    });
  }
}
