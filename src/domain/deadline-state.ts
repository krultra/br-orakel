import type { TaskStatus } from './types.js';

export type DeadlineState = 'none' | 'normal' | 'soon' | 'overdue' | 'completed';

export function deadlineState(status: TaskStatus, date?: string, automated = false, now = new Date()): DeadlineState {
  if (!date) return 'none';
  if (status === 'completed') return 'completed';

  // Compare calendar dates, not the first day of the current month. A deadline
  // that passed earlier this month is overdue even if the task is still open.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${date}T12:00:00`);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'overdue';
  if (automated) return 'normal';
  if (days <= 14) return 'soon';
  return 'normal';
}

export function deadlineStateLabel(state: DeadlineState) {
  return ({ none: '', normal: '', soon: 'Nær frist', overdue: 'Forfalt', completed: 'Levert' } as Record<DeadlineState, string>)[state];
}
