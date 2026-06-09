/**
 * 通用 10 分钟内存缓存（用于 quota 这类低频刷新 + 限速接口）
 */

export interface CachedValue<T> {
  data: T;
  fetchedAt: number;
}

export class TtlCache<T> {
  private entry: CachedValue<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  get(): T | null {
    if (!this.entry) return null;
    if (Date.now() - this.entry.fetchedAt > this.ttlMs) return null;
    return this.entry.data;
  }

  set(data: T): void {
    this.entry = { data, fetchedAt: Date.now() };
  }

  age(): number | null {
    return this.entry ? Date.now() - this.entry.fetchedAt : null;
  }
}
