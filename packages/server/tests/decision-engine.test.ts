import { describe, it, expect } from 'vitest';
import { assessRisk } from '../src/services/decision-engine.js';

describe('assessRisk', () => {
  it('should auto-approve low-risk changes (few files, no core module)', () => {
    const result = assessRisk({
      action: 'code_change',
      files: ['README.md', 'package.json'],
      modules: [],
    });
    expect(result.autoApprove).toBe(true);
    expect(result.requireApproval).toBe(false);
    expect(result.level).toBe('low');
  });

  it('should require approval for medium-risk changes (10+ files)', () => {
    const result = assessRisk({
      action: 'code_change',
      files: Array.from({ length: 10 }, (_, i) => `file${i}.ts`),
      modules: [],
    });
    expect(result.autoApprove).toBe(false);
    expect(result.requireApproval).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('should require approval when core modules are affected', () => {
    const result = assessRisk({
      action: 'code_change',
      files: ['src/core/auth.ts'],
      modules: ['core'],
    });
    expect(result.autoApprove).toBe(false);
    expect(result.factors.some(f => f.includes('核心'))).toBe(true);
  });

  it('should flag high risk for delete operations', () => {
    const result = assessRisk({
      action: 'delete',
      files: ['DELETE:src/old-module.ts'],
      modules: [],
    });
    expect(result.level).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.requireApproval).toBe(true);
  });

  it('should flag config file changes', () => {
    const result = assessRisk({
      action: 'code_change',
      files: ['.env', 'config.yaml'],
      modules: [],
    });
    expect(result.factors.some(f => f.includes('配置'))).toBe(true);
  });

  it('should combine multiple risk factors', () => {
    const result = assessRisk({
      action: 'code_change',
      files: [
        'src/core/auth.ts', 'src/core/db.ts',
        'api/handler.ts', 'config.yaml',
        'deploy.sh', 'Dockerfile', 'README.md',
      ],
      modules: ['core'],
    });
    expect(result.requireApproval).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.factors.length).toBeGreaterThanOrEqual(2);
  });
});
