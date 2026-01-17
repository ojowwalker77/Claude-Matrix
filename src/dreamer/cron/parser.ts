/**
 * Cron Expression Parsing and Validation
 *
 * Provides cron validation, natural language parsing, and next run calculations.
 * Uses croner for validation and execution scheduling.
 */

import { Cron } from 'croner';

/**
 * Validate a cron expression
 */
export function validateCron(expression: string): {
  valid: boolean;
  error?: string;
} {
  try {
    new Cron(expression);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression',
    };
  }
}

/**
 * Get the next N run times for a cron expression
 */
export function getNextRuns(
  expression: string,
  count: number = 5,
  timezone?: string
): Date[] {
  const cron = new Cron(expression, {
    timezone: timezone === 'local' ? undefined : timezone,
  });

  const runs: Date[] = [];
  let next = cron.nextRun();

  while (next && runs.length < count) {
    runs.push(next);
    next = cron.nextRun(next);
  }

  return runs;
}

/**
 * Get the next run time for a cron expression
 */
export function getNextRun(expression: string, timezone?: string): Date | null {
  const runs = getNextRuns(expression, 1, timezone);
  return runs[0] || null;
}

/**
 * Common cron presets with human-readable names
 */
export const CRON_PRESETS: Record<string, { expression: string; description: string }> = {
  'every-minute': {
    expression: '* * * * *',
    description: 'Every minute',
  },
  'every-5-minutes': {
    expression: '*/5 * * * *',
    description: 'Every 5 minutes',
  },
  'every-15-minutes': {
    expression: '*/15 * * * *',
    description: 'Every 15 minutes',
  },
  'every-30-minutes': {
    expression: '*/30 * * * *',
    description: 'Every 30 minutes',
  },
  'hourly': {
    expression: '0 * * * *',
    description: 'Every hour',
  },
  'daily-midnight': {
    expression: '0 0 * * *',
    description: 'Daily at midnight',
  },
  'daily-9am': {
    expression: '0 9 * * *',
    description: 'Daily at 9:00 AM',
  },
  'daily-6pm': {
    expression: '0 18 * * *',
    description: 'Daily at 6:00 PM',
  },
  'weekdays-9am': {
    expression: '0 9 * * 1-5',
    description: 'Weekdays at 9:00 AM',
  },
  'weekly-monday': {
    expression: '0 9 * * 1',
    description: 'Every Monday at 9:00 AM',
  },
  'weekly-friday': {
    expression: '0 17 * * 5',
    description: 'Every Friday at 5:00 PM',
  },
  'monthly-first': {
    expression: '0 9 1 * *',
    description: 'First day of month at 9:00 AM',
  },
};

/**
 * Try to parse natural language into a cron expression
 * Returns undefined if parsing fails
 */
export function naturalLanguageToCron(input: string): string | undefined {
  const lower = input.toLowerCase().trim();

  // Check presets first
  for (const [, preset] of Object.entries(CRON_PRESETS)) {
    if (lower === preset.description.toLowerCase()) {
      return preset.expression;
    }
  }

  // Common patterns
  const patterns: [RegExp, string | ((match: RegExpMatchArray) => string)][] = [
    // Every X minutes
    [/^every\s+(\d+)\s+minutes?$/i, (m) => `*/${m[1]} * * * *`],

    // Every X hours
    [/^every\s+(\d+)\s+hours?$/i, (m) => `0 */${m[1]} * * *`],

    // Every hour
    [/^every\s+hour$/i, '0 * * * *'],
    [/^hourly$/i, '0 * * * *'],

    // Daily at X (various formats)
    [/^daily\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, parseTimePattern],
    [/^every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, parseTimePattern],

    // Time without "daily" prefix (e.g., "at 9am", "at 10:30pm")
    [/^at\s+(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i, parseTimePattern],

    // Compact time format (e.g., "9am", "1015am", "10:30pm")
    [/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)$/i, parseTimePattern],

    // Weekdays at X
    [/^(?:every\s+)?weekdays?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, (m) => {
      const { hour, minute } = parseTime(m);
      return `${minute} ${hour} * * 1-5`;
    }],

    // Every Monday/Tuesday/etc at X
    [/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i, (m) => {
      const days: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6,
      };
      const dayName = m[1] ?? 'monday';
      const day = days[dayName.toLowerCase()] ?? 1;
      const { hour, minute } = parseTime(m, 2);
      return `${minute} ${hour} * * ${day}`;
    }],

    // Weekly (defaults to Monday 9am)
    [/^weekly$/i, '0 9 * * 1'],

    // Monthly (defaults to 1st at 9am)
    [/^monthly$/i, '0 9 1 * *'],
  ];

  for (const [pattern, result] of patterns) {
    const match = lower.match(pattern);
    if (match) {
      if (typeof result === 'function') {
        return result(match);
      }
      return result;
    }
  }

  return undefined;
}

/**
 * Helper to parse time from regex match
 */
function parseTime(m: RegExpMatchArray, hourIdx = 1): { hour: number; minute: number } {
  const hourStr = m[hourIdx];
  let hour = hourStr ? parseInt(hourStr, 10) : 0;
  const minuteStr = m[hourIdx + 1];
  const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
  const period = m[hourIdx + 2]?.toLowerCase();

  if (period === 'pm' && hour < 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  return { hour, minute };
}

/**
 * Pattern handler for time-based cron expressions
 */
function parseTimePattern(m: RegExpMatchArray): string {
  const { hour, minute } = parseTime(m);
  return `${minute} ${hour} * * *`;
}

/**
 * Parse schedule input - tries cron first, then natural language
 */
export function parseSchedule(input: string): {
  expression: string;
  parsed: boolean;
  error?: string;
} {
  // First check if it's already a valid cron expression
  const cronResult = validateCron(input);
  if (cronResult.valid) {
    return { expression: input, parsed: false };
  }

  // Try natural language parsing
  const nlCron = naturalLanguageToCron(input);
  if (nlCron) {
    return { expression: nlCron, parsed: true };
  }

  return {
    expression: '',
    parsed: false,
    error: `Could not parse schedule: "${input}". Use a cron expression (e.g., "0 9 * * *") or natural language (e.g., "every day at 9am").`,
  };
}
