import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../src/cfn/parse.js';
import { buildGraph } from '../src/graph/build.js';
import type { LoadedTemplate } from '../src/cfn/template.js';

function load(stackId: string, stackName: string, src: string): LoadedTemplate {
  return { stackId, stackName, templatePath: `${stackId}.yaml`, template: parseTemplate(src) };
}

describe('buildGraph', () => {
  it('creates one node per resource with the right category', () => {
    const g = buildGraph([
      load(
        'app',
        'app',
        `
Resources:
  MyFn:
    Type: AWS::Lambda::Function
    Properties: { Runtime: python3.12 }
  MyTable:
    Type: AWS::DynamoDB::Table
`,
      ),
    ]);
    expect(g.nodes).toHaveLength(2);
    const fn = g.nodes.find((n) => n.logicalId === 'MyFn')!;
    expect(fn.category).toBe('compute');
    expect(fn.keyProperties.Runtime).toBe('python3.12');
    expect(g.nodes.find((n) => n.logicalId === 'MyTable')!.category).toBe('database');
  });

  it('draws intra-stack reference and DependsOn edges', () => {
    const g = buildGraph([
      load(
        'app',
        'app',
        `
Resources:
  Table:
    Type: AWS::DynamoDB::Table
  Fn:
    Type: AWS::Lambda::Function
    DependsOn: Table
    Properties:
      Environment:
        Variables:
          TABLE: !Ref Table
`,
      ),
    ]);
    const refs = g.edges.filter((e) => e.source === 'app::Fn' && e.target === 'app::Table');
    expect(refs.some((e) => e.label === 'Ref')).toBe(true);
    expect(refs.some((e) => e.label === 'DependsOn')).toBe(true);
  });

  it('links cross-stack Export <-> ImportValue', () => {
    const producer = load(
      'storage',
      'app-storage',
      `
Resources:
  Table:
    Type: AWS::DynamoDB::Table
Outputs:
  TableArn:
    Value: !GetAtt Table.Arn
    Export:
      Name: !Sub "\${AWS::StackName}-TableArn"
`,
    );
    const consumer = load(
      'compute',
      'app-compute',
      `
Resources:
  Fn:
    Type: AWS::Lambda::Function
    Properties:
      Environment:
        Variables:
          TABLE_ARN: !ImportValue app-storage-TableArn
`,
    );
    const g = buildGraph([producer, consumer]);
    const edge = g.edges.find((e) => e.kind === 'cross-stack');
    expect(edge).toBeDefined();
    expect(edge!.source).toBe('compute::Fn');
    expect(edge!.target).toBe('storage::Table');
  });

  it('extracts IAM role -> resource permission edges and trust principals', () => {
    const g = buildGraph([
      load(
        'app',
        'app',
        `
Resources:
  Queue:
    Type: AWS::SQS::Queue
  Role:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Statement:
          - Effect: Allow
            Principal: { Service: lambda.amazonaws.com }
            Action: sts:AssumeRole
      Policies:
        - PolicyName: p
          PolicyDocument:
            Statement:
              - Effect: Allow
                Action: [sqs:SendMessage, sqs:GetQueueUrl]
                Resource: !GetAtt Queue.Arn
`,
      ),
    ]);
    const iam = g.edges.find((e) => e.kind === 'iam');
    expect(iam).toBeDefined();
    expect(iam!.source).toBe('app::Role');
    expect(iam!.target).toBe('app::Queue');
    expect(iam!.detail!.actions).toEqual(['sqs:SendMessage', 'sqs:GetQueueUrl']);
    const role = g.nodes.find((n) => n.logicalId === 'Role')!;
    expect(role.keyProperties.trustedPrincipals).toEqual(['lambda.amazonaws.com']);
  });

  it('records a warning for an unresolved import without throwing', () => {
    const g = buildGraph([
      load(
        'app',
        'app',
        `
Resources:
  Fn:
    Type: AWS::Lambda::Function
    Properties:
      Role: !ImportValue some-totally-unknown-export-xyz
`,
      ),
    ]);
    expect(g.warnings.some((w) => w.code === 'unresolved-import')).toBe(true);
  });
});
