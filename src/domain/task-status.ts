import type { TaskStatus } from './types.js';

export function statusForDate(baseStatus: TaskStatus, date: string | undefined, statusByDate?: Record<string, TaskStatus>): TaskStatus {
  if (!date || !statusByDate) return baseStatus;
  // Once a recurring task has per-instance statuses, an unset date is a new
  // instance and must not inherit the aggregate status of another instance.
  return statusByDate[date] ?? 'not_started';
}

export function aggregateRecurringStatus(baseStatus: TaskStatus, dates: string[] | undefined, statusByDate?: Record<string, TaskStatus>): TaskStatus {
  if (!dates?.length || !statusByDate) return baseStatus;
  const statuses = dates.map((date) => statusByDate[date]).filter((status): status is TaskStatus => Boolean(status));
  if (!statuses.length) return baseStatus;
  if (dates.every((date) => statusByDate[date] === 'completed')) return 'completed';
  if (statuses.some((status) => status === 'in_progress' || status === 'completed')) return 'in_progress';
  return baseStatus;
}
