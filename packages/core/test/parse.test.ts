import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../src/cfn/parse.js';

describe('parseTemplate', () => {
  it('normalizes short-form intrinsic tags to long form', () => {
    const tpl = parseTemplate(`
Resources:
  Fn:
    Type: AWS::Lambda::Function
    Properties:
      Role: !GetAtt Role.Arn
      Environment:
        Variables:
          TABLE: !Ref Table
          ARN: !Sub "\${AWS::StackName}-thing"
          IMPORT: !ImportValue other-stack-Export
`);
    const props = (tpl.Resources!.Fn as any).Properties;
    expect(props.Role).toEqual({ 'Fn::GetAtt': ['Role', 'Arn'] });
    expect(props.Environment.Variables.TABLE).toEqual({ Ref: 'Table' });
    expect(props.Environment.Variables.ARN).toEqual({ 'Fn::Sub': '${AWS::StackName}-thing' });
    expect(props.Environment.Variables.IMPORT).toEqual({ 'Fn::ImportValue': 'other-stack-Export' });
  });

  it('parses JSON templates too', () => {
    const tpl = parseTemplate('{"Resources":{"B":{"Type":"AWS::S3::Bucket"}}}');
    expect(tpl.Resources!.B!.Type).toBe('AWS::S3::Bucket');
  });
});
