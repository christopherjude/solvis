import type { Category } from '../types.js';

/** Per-resource-type metadata for node building. The main extension point. */
export interface ResourceTypeSpec {
  category: Category;
  /** Property names worth surfacing in the detail panel, in priority order. */
  keyProps?: string[];
}

/**
 * Registry of known CloudFormation resource types. Unknown types fall back to
 * `categoryFromType` heuristics, so this only needs entries that improve
 * categorization or (later) carry dedicated edge rules.
 *
 * Keep this general-purpose: never key behavior on a specific project's names.
 */
export const RESOURCE_REGISTRY: Record<string, ResourceTypeSpec> = {
  // compute
  'AWS::Lambda::Function': { category: 'compute', keyProps: ['Runtime', 'Handler', 'MemorySize', 'Timeout'] },
  'AWS::Lambda::LayerVersion': { category: 'compute', keyProps: ['CompatibleRuntimes'] },
  'AWS::Lambda::EventSourceMapping': { category: 'integration', keyProps: ['EventSourceArn', 'FunctionName'] },
  'AWS::Lambda::Permission': { category: 'security', keyProps: ['Action', 'Principal', 'FunctionName'] },
  'AWS::EC2::Instance': { category: 'compute', keyProps: ['InstanceType', 'ImageId'] },
  'AWS::AutoScaling::AutoScalingGroup': { category: 'compute', keyProps: ['MinSize', 'MaxSize', 'DesiredCapacity'] },
  'AWS::ECS::Service': { category: 'compute', keyProps: ['LaunchType', 'DesiredCount'] },
  'AWS::ECS::TaskDefinition': { category: 'compute' },

  // storage / database
  'AWS::S3::Bucket': { category: 'storage', keyProps: ['BucketName'] },
  'AWS::DynamoDB::Table': { category: 'database', keyProps: ['BillingMode', 'KeySchema'] },
  'AWS::RDS::DBInstance': { category: 'database', keyProps: ['Engine', 'DBInstanceClass', 'MultiAZ'] },
  'AWS::RDS::DBCluster': { category: 'database', keyProps: ['Engine', 'EngineMode'] },
  'AWS::ElastiCache::CacheCluster': { category: 'database', keyProps: ['Engine'] },

  // integration / messaging
  'AWS::SQS::Queue': { category: 'integration', keyProps: ['FifoQueue', 'VisibilityTimeout'] },
  'AWS::SNS::Topic': { category: 'integration', keyProps: ['TopicName', 'FifoTopic'] },
  'AWS::SNS::Subscription': { category: 'integration', keyProps: ['Protocol', 'Endpoint', 'TopicArn'] },
  'AWS::Events::Rule': { category: 'integration', keyProps: ['ScheduleExpression', 'EventPattern'] },
  'AWS::StepFunctions::StateMachine': { category: 'integration' },
  'AWS::ApiGateway::RestApi': { category: 'integration', keyProps: ['Name'] },
  'AWS::ApiGatewayV2::Api': { category: 'integration', keyProps: ['Name', 'ProtocolType'] },
  'AWS::ApiGatewayV2::Route': { category: 'integration', keyProps: ['RouteKey', 'Target'] },
  'AWS::ApiGatewayV2::Integration': { category: 'integration', keyProps: ['IntegrationType', 'IntegrationUri'] },

  // network
  'AWS::EC2::VPC': { category: 'network', keyProps: ['CidrBlock'] },
  'AWS::EC2::Subnet': { category: 'network', keyProps: ['CidrBlock', 'AvailabilityZone'] },
  'AWS::EC2::SecurityGroup': { category: 'network', keyProps: ['GroupDescription'] },
  'AWS::EC2::InternetGateway': { category: 'network' },
  'AWS::EC2::NatGateway': { category: 'network' },
  'AWS::EC2::RouteTable': { category: 'network' },
  'AWS::EC2::VPCEndpoint': { category: 'network', keyProps: ['ServiceName', 'VpcEndpointType'] },

  // security / identity
  'AWS::IAM::Role': { category: 'security', keyProps: ['RoleName'] },
  'AWS::IAM::Policy': { category: 'security', keyProps: ['PolicyName'] },
  'AWS::IAM::ManagedPolicy': { category: 'security' },
  'AWS::IAM::InstanceProfile': { category: 'security' },
  'AWS::KMS::Key': { category: 'security', keyProps: ['Description', 'Enabled'] },
  'AWS::SecretsManager::Secret': { category: 'security', keyProps: ['Name'] },
  'AWS::Cognito::UserPool': { category: 'identity', keyProps: ['UserPoolName', 'MfaConfiguration'] },
  'AWS::Cognito::UserPoolClient': { category: 'identity', keyProps: ['ClientName'] },

  // frontend
  'AWS::Amplify::App': { category: 'frontend', keyProps: ['Name', 'Repository'] },
  'AWS::CloudFront::Distribution': { category: 'frontend' },

  // observability
  'AWS::Logs::LogGroup': { category: 'observability', keyProps: ['RetentionInDays'] },
  'AWS::CloudWatch::Alarm': { category: 'observability', keyProps: ['MetricName', 'Threshold'] },
};

/** Service-prefix fallback for resource types not in the registry. */
const SERVICE_CATEGORY: Record<string, Category> = {
  Lambda: 'compute',
  EC2: 'network',
  ECS: 'compute',
  EKS: 'compute',
  Batch: 'compute',
  AutoScaling: 'compute',
  S3: 'storage',
  EFS: 'storage',
  DynamoDB: 'database',
  RDS: 'database',
  ElastiCache: 'database',
  Redshift: 'database',
  SQS: 'integration',
  SNS: 'integration',
  Events: 'integration',
  StepFunctions: 'integration',
  ApiGateway: 'integration',
  ApiGatewayV2: 'integration',
  AppSync: 'integration',
  IAM: 'security',
  KMS: 'security',
  SecretsManager: 'security',
  Cognito: 'identity',
  Amplify: 'frontend',
  CloudFront: 'frontend',
  Logs: 'observability',
  CloudWatch: 'observability',
};

/** Derive a category from a `AWS::Service::Type` string when not in the registry. */
export function categoryFromType(resourceType: string): Category {
  const parts = resourceType.split('::');
  const service = parts[1];
  if (service && service in SERVICE_CATEGORY) return SERVICE_CATEGORY[service]!;
  return 'other';
}

export function specFor(resourceType: string): ResourceTypeSpec {
  return RESOURCE_REGISTRY[resourceType] ?? { category: categoryFromType(resourceType) };
}
