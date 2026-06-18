import { describe, expect, it } from 'vitest';
import { stackIdFor, stackNameFor } from '../src/discover.js';

describe('stackIdFor', () => {
  it('uses the parent directory for files literally named template', () => {
    expect(stackIdFor('serverless/core/storage/template.yaml')).toBe('serverless/core/storage');
    expect(stackNameFor('serverless/core/storage/template.yaml')).toBe('storage');
  });

  it('keeps the filename to disambiguate template-<variant> files in one dir', () => {
    expect(stackIdFor('core/frontend/template.yaml')).toBe('core/frontend');
    expect(stackIdFor('core/frontend/template-user.yaml')).toBe('core/frontend/template-user');
    expect(stackIdFor('core/frontend/template-admin.yaml')).toBe('core/frontend/template-admin');
  });

  it('uses the path without extension for normally-named templates', () => {
    expect(stackIdFor('ci/bootstrap.yaml')).toBe('ci/bootstrap');
    expect(stackNameFor('ci/bootstrap.yaml')).toBe('bootstrap');
  });
});
