export interface MemoryMetricsSnapshot {
  timestamp: string;
  recallRate: number;
  hitRate: number;
  falseRecallRate: number;
  migrationSuccessRate: number;
  cacheHitRate: number;
  avgRetrievalLatencyMs: number;
}

export interface MemoryMetricsState {
  totalSearches: number;
  searchesWithHits: number;
  totalRequested: number;
  totalReturned: number;
  lowConfidenceHits: number;
  retrievalLatencyMs: number[];
  cacheHits: number;
  cacheMisses: number;
  migrationAttempts: number;
  migrationSuccesses: number;
  migrationFailures: number;
  snapshots: MemoryMetricsSnapshot[];
}

export interface MemoryDashboardMetrics {
  generatedAt: string;
  summary: {
    recallRate: number;
    hitRate: number;
    falseRecallRate: number;
    migrationSuccessRate: number;
    cacheHitRate: number;
    retrievalLatencyMs: {
      avg: number;
      p95: number;
      max: number;
    };
    counters: {
      totalSearches: number;
      searchesWithHits: number;
      totalRequested: number;
      totalReturned: number;
      lowConfidenceHits: number;
      migrationAttempts: number;
      migrationSuccesses: number;
      migrationFailures: number;
      cacheHits: number;
      cacheMisses: number;
    };
  };
  timeline: MemoryMetricsSnapshot[];
}

export class MemoryMetricsTracker {
  private metricsState: MemoryMetricsState;

  constructor() {
    this.metricsState = this.createInitialMetricsState();
  }

  get state(): MemoryMetricsState {
    return this.metricsState;
  }

  createInitialMetricsState(): MemoryMetricsState {
    return {
      totalSearches: 0,
      searchesWithHits: 0,
      totalRequested: 0,
      totalReturned: 0,
      lowConfidenceHits: 0,
      retrievalLatencyMs: [],
      cacheHits: 0,
      cacheMisses: 0,
      migrationAttempts: 0,
      migrationSuccesses: 0,
      migrationFailures: 0,
      snapshots: [],
    };
  }

  getDashboardMetrics(timelineLimit: number = 24): MemoryDashboardMetrics {
    const metrics = this.calculateCurrentMetrics();
    const safeLimit = Math.max(1, Math.min(200, timelineLimit));
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        recallRate: metrics.recallRate,
        hitRate: metrics.hitRate,
        falseRecallRate: metrics.falseRecallRate,
        migrationSuccessRate: metrics.migrationSuccessRate,
        cacheHitRate: metrics.cacheHitRate,
        retrievalLatencyMs: {
          avg: metrics.avgRetrievalLatencyMs,
          p95: metrics.p95RetrievalLatencyMs,
          max: metrics.maxRetrievalLatencyMs,
        },
        counters: {
          totalSearches: this.metricsState.totalSearches,
          searchesWithHits: this.metricsState.searchesWithHits,
          totalRequested: this.metricsState.totalRequested,
          totalReturned: this.metricsState.totalReturned,
          lowConfidenceHits: this.metricsState.lowConfidenceHits,
          migrationAttempts: this.metricsState.migrationAttempts,
          migrationSuccesses: this.metricsState.migrationSuccesses,
          migrationFailures: this.metricsState.migrationFailures,
          cacheHits: this.metricsState.cacheHits,
          cacheMisses: this.metricsState.cacheMisses,
        },
      },
      timeline: this.metricsState.snapshots.slice(-safeLimit),
    };
  }

  recordSearchMetrics(
    requestedLimit: number,
    returnedCount: number,
    lowConfidenceHits: number,
    latencyMs: number,
  ): void {
    this.metricsState.totalSearches += 1;
    this.metricsState.totalRequested += Math.max(0, requestedLimit);
    this.metricsState.totalReturned += Math.max(0, returnedCount);
    this.metricsState.lowConfidenceHits += Math.max(0, lowConfidenceHits);
    if (returnedCount > 0) {
      this.metricsState.searchesWithHits += 1;
    }
    this.metricsState.retrievalLatencyMs.push(Math.max(0, latencyMs));
    if (this.metricsState.retrievalLatencyMs.length > 500) {
      this.metricsState.retrievalLatencyMs.shift();
    }
    this.appendMetricsSnapshot();
  }

  recordCacheResult(hit: boolean): void {
    if (hit) {
      this.metricsState.cacheHits += 1;
    } else {
      this.metricsState.cacheMisses += 1;
    }
    this.appendMetricsSnapshot();
  }

  recordMigrationAttempt(count: number): void {
    this.metricsState.migrationAttempts += count;
  }

  recordMigrationSuccess(): void {
    this.metricsState.migrationSuccesses += 1;
  }

  recordMigrationFailure(): void {
    this.metricsState.migrationFailures += 1;
  }

  appendMetricsSnapshot(): void {
    const current = this.calculateCurrentMetrics();
    this.metricsState.snapshots.push({
      timestamp: new Date().toISOString(),
      recallRate: current.recallRate,
      hitRate: current.hitRate,
      falseRecallRate: current.falseRecallRate,
      migrationSuccessRate: current.migrationSuccessRate,
      cacheHitRate: current.cacheHitRate,
      avgRetrievalLatencyMs: current.avgRetrievalLatencyMs,
    });
    if (this.metricsState.snapshots.length > 500) {
      this.metricsState.snapshots.shift();
    }
  }

  calculateCurrentMetrics(): {
    recallRate: number;
    hitRate: number;
    falseRecallRate: number;
    migrationSuccessRate: number;
    cacheHitRate: number;
    avgRetrievalLatencyMs: number;
    p95RetrievalLatencyMs: number;
    maxRetrievalLatencyMs: number;
  } {
    const recallRate =
      this.metricsState.totalRequested > 0
        ? this.metricsState.totalReturned / this.metricsState.totalRequested
        : 0;
    const hitRate =
      this.metricsState.totalSearches > 0
        ? this.metricsState.searchesWithHits / this.metricsState.totalSearches
        : 0;
    const falseRecallRate =
      this.metricsState.totalReturned > 0
        ? this.metricsState.lowConfidenceHits / this.metricsState.totalReturned
        : 0;
    const migrationSuccessRate =
      this.metricsState.migrationAttempts > 0
        ? this.metricsState.migrationSuccesses /
          this.metricsState.migrationAttempts
        : 0;
    const totalCache =
      this.metricsState.cacheHits + this.metricsState.cacheMisses;
    const cacheHitRate =
      totalCache > 0 ? this.metricsState.cacheHits / totalCache : 0;
    const latency = [...this.metricsState.retrievalLatencyMs].sort(
      (a, b) => a - b,
    );
    const avgRetrievalLatencyMs =
      latency.length > 0
        ? latency.reduce((sum, value) => sum + value, 0) / latency.length
        : 0;
    const p95Index =
      latency.length > 0
        ? Math.min(latency.length - 1, Math.floor(latency.length * 0.95))
        : 0;
    const p95RetrievalLatencyMs = latency.length > 0 ? latency[p95Index] : 0;
    const maxRetrievalLatencyMs =
      latency.length > 0 ? latency[latency.length - 1] : 0;
    return {
      recallRate,
      hitRate,
      falseRecallRate,
      migrationSuccessRate,
      cacheHitRate,
      avgRetrievalLatencyMs,
      p95RetrievalLatencyMs,
      maxRetrievalLatencyMs,
    };
  }
}
