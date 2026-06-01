import { describe, it, expect } from 'vitest';
import { assessRisk, evaluateApprovalNode } from '../src/services/decision-engine.js';

// blueprint-engine and other services require DB connection.
// These tests verify the decision engine (pure logic) and approval evaluation.
// DB-dependent tests require a running PostgreSQL instance.

describe('assessRisk (edge cases)', () => {
  it('handles empty file list gracefully', () => {
    const result = assessRisk({
      action: 'code_change',
      files: [],
      modules: [],
    });
    expect(result.autoApprove).toBe(true);
    expect(result.score).toBe(0);
  });

  it('handles missing fields gracefully', () => {
    const result = assessRisk({
      action: 'code_change',
    } as any);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(typeof result.autoApprove).toBe('boolean');
  });

  it('defaults to low risk for simple documentation changes', () => {
    const result = assessRisk({
      action: 'code_change',
      files: ['docs/README.md', 'docs/CHANGELOG.md'],
    });
    expect(result.level).toBe('low');
    expect(result.autoApprove).toBe(true);
  });
});

describe('evaluateApprovalNode', () => {
  it('auto-approves when risk is low', () => {
    const result = evaluateApprovalNode(
      { auto_approve_below_risk: true },
      'some upstream output',
    );
    expect(result.approved).toBe(true);
    expect(result.reason).toContain('自动审批');
  });

  it('rejects when upstream indicates higher risk', () => {
    const result = evaluateApprovalNode(
      { auto_approve_below_risk: true },
      '',
    );
    expect(typeof result.approved).toBe('boolean');
    expect(result.reason).toBeTruthy();
  });

  it('defaults to manual approval without auto_approve config', () => {
    const result = evaluateApprovalNode({}, 'output');
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('人工审批');
  });
});
