/** Cycle-count math. */
export interface CountLineLike {
  expectedQty: number;
  countedQty: number | null;
}

export function lineVariance(line: CountLineLike): number {
  return (line.countedQty ?? 0) - line.expectedQty;
}

export interface CountSummary {
  lines: number;
  linesWithVariance: number;
  netVariance: number;
  absVariance: number;
  accuracyPct: number | null;
}

export function accuracyPct(matching: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((matching / total) * 1000) / 10;
}

export function summarizeCount(lines: CountLineLike[]): CountSummary {
  let linesWithVariance = 0;
  let netVariance = 0;
  let absVariance = 0;
  for (const line of lines) {
    const v = lineVariance(line);
    if (v !== 0) linesWithVariance++;
    netVariance += v;
    absVariance += Math.abs(v);
  }
  return {
    lines: lines.length,
    linesWithVariance,
    netVariance,
    absVariance,
    accuracyPct: accuracyPct(lines.length - linesWithVariance, lines.length),
  };
}
