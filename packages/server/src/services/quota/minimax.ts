/**
 * Minimax 套餐余量（通过本地 mmx CLI）
 * 命令：mmx quota show --output=json --non-interactive
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MinimaxModelQuota {
  model_name: string;
  current_interval_remaining_percent: number;
  current_weekly_remaining_percent: number;
  current_interval_total_count: number;
  current_interval_usage_count: number;
  current_weekly_total_count: number;
  current_weekly_usage_count: number;
  start_time: number;
  end_time: number;
  weekly_start_time: number;
  weekly_end_time: number;
  remains_time: number;
  weekly_remains_time: number;
}

export interface MinimaxQuotaResponse {
  models: MinimaxModelQuota[];
  fetchedAt: number;
  ok: boolean;
  error?: string;
}

export async function fetchMinimaxQuota(): Promise<MinimaxQuotaResponse> {
  try {
    const { stdout } = await execFileAsync("mmx", [
      "quota",
      "show",
      "--output=json",
      "--non-interactive",
    ], { timeout: 15_000 });
    const parsed = JSON.parse(stdout) as {
      model_remains?: MinimaxModelQuota[];
      base_resp?: { status_code: number; status_msg: string };
    };
    if (parsed.base_resp && parsed.base_resp.status_code !== 0) {
      return {
        models: [],
        fetchedAt: Date.now(),
        ok: false,
        error: parsed.base_resp.status_msg ?? "mmx 报告错误",
      };
    }
    return {
      models: parsed.model_remains ?? [],
      fetchedAt: Date.now(),
      ok: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      models: [],
      fetchedAt: Date.now(),
      ok: false,
      error: msg.includes("ENOENT")
        ? "mmx CLI 未找到（PATH 中缺少 minimax CLI）"
        : msg,
    };
  }
}
