import { query } from '../db/client.js';

// --- Types ---

export interface ActionDescription {
  /** Type of action: 'code_change' | 'doc_change' | 'config_change' | 'delete' */
  action: string;
  /** List of files being modified */
  files?: string[];
  /** Directories or modules affected */
  modules?: string[];
  /** Summary of what's being done */
  summary?: string;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  score: number;        // 0-100
  autoApprove: boolean;
  factors: string[];
  requireApproval: boolean;
}

// Default core module patterns
const CORE_MODULES = ['core/', 'src/core/', 'packages/core/', 'server/', 'db/', 'auth/', 'security/'];

/**
 * Assess the risk level of an action and determine whether it can be auto-approved.
 *
 * Auto-approve rules:
 * - Low risk: modify < 5 files, no core module, no delete → autoApprove
 * - Medium risk: modify >= 5 files OR involves core module → require approval
 * - High risk: any delete → always require approval
 */
export function assessRisk(action: ActionDescription): RiskAssessment {
  const factors: string[] = [];
  let score = 0;
  let autoApprove = false;
  let requireApproval = false;

  const files = action.files || [];
  const modules = action.modules || [];

  // Rule 1: Delete operations are high risk
  if (action.action === 'delete' || files.some((f) => f.startsWith('DELETE:'))) {
    score += 60;
    factors.push('包含删除操作');
    requireApproval = true;
  }

  // Rule 2: File count risk
  if (files.length >= 10) {
    score += 30;
    factors.push(`修改文件数较多 (${files.length})`);
    requireApproval = true;
  } else if (files.length >= 5) {
    score += 15;
    factors.push(`修改文件数中等 (${files.length})`);
  }

  // Rule 3: Core module risk
  const allPaths = [...files, ...modules.map((m) => `${m}/`)];
  const affectedCores = CORE_MODULES.filter((core) =>
    allPaths.some((p) => p.startsWith(core)),
  );
  if (affectedCores.length > 0) {
    score += 25;
    factors.push(`涉及核心模块: ${affectedCores.join(', ')}`);
  }

  // Rule 4: Config changes
  if (files.some((f) => f.endsWith('.env') || f.endsWith('.yaml') || f.endsWith('.json') || f.endsWith('config'))) {
    score += 10;
    factors.push('包含配置文件变更');
  }

  // Determine level and auto-approve
  if (score >= 50) {
    requireApproval = true;
  } else if (score >= 20) {
    // Medium - require approval for medium+
    requireApproval = true;
  } else {
    autoApprove = true;
  }

  return {
    level: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
    score: Math.min(score, 100),
    autoApprove,
    factors,
    requireApproval,
  };
}

/**
 * Evaluate a blueprint approval node against risk rules.
 * Returns true if the node should auto-approve, false if manual approval needed.
 */
export function evaluateApprovalNode(
  nodeConfig: Record<string, any>,
  upstreamOutput: string,
): { approved: boolean; reason: string } {
  // If node config has auto_approve_below_risk, try to parse upstream output as action
  if (nodeConfig.auto_approve_below_risk) {
    // Mock: treat upstream as action description
    const risk = assessRisk({
      action: 'code_change',
      files: upstreamOutput ? ['file.ts'] : [],
      summary: upstreamOutput,
    });

    if (risk.level === 'low') {
      return { approved: true, reason: `自动审批: 风险等级 ${risk.level} (${risk.score}/100)` };
    }
    return { approved: false, reason: `需人工审批: 风险等级 ${risk.level} (${risk.score}/100) - ${risk.factors.join(', ')}` };
  }

  // Default: no auto-approve
  return { approved: false, reason: '配置要求人工审批' };
}
