/** Shared date helpers for the dob and validity rules. */

/** Parse a strict ISO YYYY-MM-DD string into a Date (UTC), or null if invalid. */
export const parseISODate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // Guard against JS date rollover (e.g. 2023-02-30 -> Mar 2).
  if (date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
};

/** Whole years elapsed from `date` until `now`. */
export const yearsBetween = (date: Date, now: Date): number => {
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const m = now.getUTCMonth() - date.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < date.getUTCDate())) {
    years -= 1;
  }
  return years;
};

export default {
  parseISODate,
  yearsBetween,
};
