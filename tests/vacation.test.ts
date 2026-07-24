import { describe, it, expect } from 'vitest';
import { calculateStreak } from '@/lib/calculate';
import type { ContributionCalendar } from '@/types';

// Helper: build a calendar from an array of { date, count } entries
function makeCalendar(days: { date: string; count: number }[]): ContributionCalendar {
  const contributionDays = days.map((d) => ({
    date: d.date,
    contributionCount: d.count,
    color: '',
    weekday: 0,
  }));
  return {
    totalContributions: contributionDays.reduce((s, d) => s + d.contributionCount, 0),
    weeks: [{ contributionDays }],
  };
}

describe('Streak Freeze / Vacation Mode — calculateStreak with vacationDates', () => {
  it('maintains streak across a single vacation day with no commits', () => {
    // 3 active days, 1 vacation day, 1 active day — streak should be 5
    const now = new Date('2025-01-10T12:00:00Z');
    const calendar = makeCalendar([
      { date: '2025-01-06', count: 5 },
      { date: '2025-01-07', count: 3 },
      { date: '2025-01-08', count: 0 }, // vacation
      { date: '2025-01-09', count: 4 },
      { date: '2025-01-10', count: 2 },
    ]);

    const withVacation = calculateStreak(calendar, 'UTC', now, 1, ['2025-01-08']);
    const withoutVacation = calculateStreak(calendar, 'UTC', now, 1, []);

    expect(withVacation.currentStreak).toBe(5);
    expect(withoutVacation.currentStreak).toBeLessThan(5); // streak was broken without vacation freeze
  });

  it('maintains longest streak across multiple consecutive vacation days', () => {
    const now = new Date('2025-01-15T12:00:00Z');
    const calendar = makeCalendar([
      { date: '2025-01-01', count: 5 },
      { date: '2025-01-02', count: 3 },
      { date: '2025-01-03', count: 0 }, // vacation
      { date: '2025-01-04', count: 0 }, // vacation
      { date: '2025-01-05', count: 0 }, // vacation
      { date: '2025-01-06', count: 6 },
      { date: '2025-01-07', count: 4 },
    ]);
    const vacDates = ['2025-01-03', '2025-01-04', '2025-01-05'];

    const result = calculateStreak(calendar, 'UTC', now, 1, vacDates);

    expect(result.longestStreak).toBe(7);
  });

  it('does not maintain streak when vacation date is not in vacationDates (no freeze)', () => {
    const now = new Date('2025-01-05T12:00:00Z');
    const calendar = makeCalendar([
      { date: '2025-01-01', count: 5 },
      { date: '2025-01-02', count: 3 },
      { date: '2025-01-03', count: 0 }, // no vacation declared
      { date: '2025-01-04', count: 4 },
      { date: '2025-01-05', count: 2 },
    ]);

    const result = calculateStreak(calendar, 'UTC', now, 0, []);
    // streak resets at 2025-01-03 without grace or vacation freeze
    expect(result.currentStreak).toBeLessThan(5);
  });

  it('returns correct stats when all vacation dates are in the past with commits before and after', () => {
    const now = new Date('2025-01-07T12:00:00Z');
    const calendar = makeCalendar([
      { date: '2025-01-01', count: 2 },
      { date: '2025-01-02', count: 0 }, // vacation
      { date: '2025-01-03', count: 3 },
      { date: '2025-01-04', count: 0 }, // vacation
      { date: '2025-01-05', count: 5 },
      { date: '2025-01-06', count: 1 },
      { date: '2025-01-07', count: 4 },
    ]);

    const result = calculateStreak(calendar, 'UTC', now, 1, ['2025-01-02', '2025-01-04']);
    expect(result.currentStreak).toBe(7);
    expect(result.longestStreak).toBe(7);
  });

  it('handles empty vacationDates gracefully (backwards compatible)', () => {
    const now = new Date('2025-01-05T12:00:00Z');
    const calendar = makeCalendar([
      { date: '2025-01-01', count: 5 },
      { date: '2025-01-02', count: 3 },
      { date: '2025-01-03', count: 4 },
      { date: '2025-01-04', count: 2 },
      { date: '2025-01-05', count: 1 },
    ]);

    const result = calculateStreak(calendar, 'UTC', now, 1);
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
  });
});
