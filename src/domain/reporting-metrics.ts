import type { Obligation } from './types.js';
import { isMutedForDate } from './task-visibility.js';

export interface ReportingEstimate {
  minutes: number;
  occurrenceCount: number;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function shiftMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

/**
 * Returns the known dated occurrences in a rolling month window. Event-only
 * obligations are intentionally excluded because their frequency cannot be
 * converted into a time estimate before the event occurs.
 */
function occurrenceDatesForWindow(obligation: Obligation, start: Date, monthCount: number) {
  const windowStart = dateKey(start);
  const windowEnd = dateKey(shiftMonth(start, monthCount));
  const sourceDates = obligation.localDeadline && !obligation.deadlineDates?.length
    ? [obligation.localDeadline]
    : obligation.deadlineDates?.length
      ? obligation.deadlineDates
      : [obligation.reportingWindowStart ?? obligation.deadline].filter((date): date is string => Boolean(date));
  const dates = new Set<string>();
  for (const sourceDate of sourceDates) {
    const month = Number(sourceDate.slice(5, 7)) - 1;
    const day = Number(sourceDate.slice(8, 10));
    if (!Number.isInteger(month) || !Number.isInteger(day)) continue;
    for (let year = start.getFullYear() - 1; year <= shiftMonth(start, monthCount - 1).getFullYear() + 1; year += 1) {
      const candidate = new Date(year, month, day);
      if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== day) continue;
      const key = dateKey(candidate);
      if (key >= windowStart && key < windowEnd) dates.add(key);
    }
  }
  return [...dates].sort();
}

/**
 * Estimates work for visible occurrences only. Official catalogue entries
 * remain in the input, while local hiding and muting are presentation choices
 * that must reduce the displayed workload estimate.
 */
export function estimateReportingMinutes(obligations: Obligation[], start: Date, monthCount: number): ReportingEstimate {
  return obligations.reduce<ReportingEstimate>((estimate, obligation) => {
    if (obligation.isHidden === true) return estimate;
    const dates = occurrenceDatesForWindow(obligation, start, monthCount);
    const visibleDates = dates.filter((date) => !obligation.hiddenByDate?.[date] && !isMutedForDate(obligation, date));
    return {
      minutes: estimate.minutes + visibleDates.length * obligation.estimatedMinutes,
      occurrenceCount: estimate.occurrenceCount + visibleDates.length,
    };
  }, { minutes: 0, occurrenceCount: 0 });
}

