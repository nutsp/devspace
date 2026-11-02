/** Compare calendar days without a DST-dependent millisecond difference. */
export function milestoneMarkerOffset(target: string, chartStart: Date, dayWidth: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || !Number.isFinite(chartStart.getTime()) || !(dayWidth > 0)) return null;
  const [year, month, day] = target.split("-").map(Number);
  const targetDay = Date.UTC(year, month - 1, day);
  const startDay = Date.UTC(chartStart.getFullYear(), chartStart.getMonth(), chartStart.getDate());
  return ((targetDay - startDay) / 86400000 + 0.5) * dayWidth;
}
export function groupMilestonesByDate<T extends { id: string; target_date: string | null }>(
  rows: T[]
): { date: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.target_date) continue;
    const list = groups.get(row.target_date) ?? [];
    list.push(row);
    groups.set(row.target_date, list);
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- Sort a copy for the existing ES target.
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items }));
}

/** Keep same-day targets individually reachable without an unbounded marker stack. */
export function splitMilestoneMarkers<T>(items: T[]): { visible: T[]; overflow: T[] } {
  return { visible: items.slice(0, 4), overflow: items.slice(4) };
}
