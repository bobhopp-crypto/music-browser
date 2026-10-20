const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const HOT100_FIRST_YEAR = 1958;
export const HOT100_LAST_YEAR = 2024;
export const HOT100_CREDIT = "Retroverse year-end rankings, computed from weekly Billboard Hot 100 charts.";

export function hot100Years(): number[] {
  const years: number[] = [];
  for (let year = HOT100_FIRST_YEAR; year <= HOT100_LAST_YEAR; year += 1) years.push(year);
  return years;
}

export function isHot100Year(year: number): boolean {
  return Number.isInteger(year) && year >= HOT100_FIRST_YEAR && year <= HOT100_LAST_YEAR;
}

function monthName(month: string): string | null {
  return MONTHS[Number(month) - 1] ?? null;
}

export function formatChartDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const month = monthName(match[2]!);
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

export function formatChartRun(first: string, last: string): string {
  const start = ISO_DATE.exec(first);
  const end = ISO_DATE.exec(last);
  if (!start || !end) return `${first} – ${last}`;
  const startMonth = monthName(start[2]!);
  const endMonth = monthName(end[2]!);
  if (!startMonth || !endMonth) return `${first} – ${last}`;
  const startDay = Number(start[3]);
  const endDay = Number(end[3]);
  if (start[1] === end[1]) {
    if (start[2] === end[2] && startDay === endDay) return `${startMonth} ${startDay}, ${start[1]}`;
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${start[1]}`;
  }
  return `${startMonth} ${startDay}, ${start[1]} – ${endMonth} ${endDay}, ${end[1]}`;
}
