// Italian office hours scheduling helper.
// Office: Mon-Fri, 10:00-12:00 and 14:00-17:00 Europe/Rome.
// Break: 12:00-14:00. Outside that window → push to next valid slot.

const TZ = "Europe/Rome";

type Parts = { y: number; mo: number; d: number; h: number; mi: number; wd: number };

function romeParts(date: Date): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of fmt) m[p.type] = p.value;
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: +m.year, mo: +m.month, d: +m.day,
    h: +m.hour === 24 ? 0 : +m.hour,
    mi: +m.minute,
    wd: wdMap[m.weekday] ?? 1,
  };
}

// Convert a Rome wall-clock time (y,mo,d,h,mi) to a UTC Date.
function romeWallToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  // Initial guess: treat wall time as if it were UTC.
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  // Compute Rome offset at that instant.
  const p = romeParts(new Date(guess));
  const asUtcOfParts = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, 0);
  const offset = asUtcOfParts - guess; // ms Rome is ahead of UTC
  return new Date(guess - offset);
}

// Returns a Date >= input that falls inside Italian office hours.
export function clampToOfficeHours(input: Date): Date {
  let cursor = input;
  for (let i = 0; i < 14; i++) {
    const p = romeParts(cursor);
    const isWeekday = p.wd >= 1 && p.wd <= 5;
    if (isWeekday) {
      if (p.h < 10) return romeWallToUtc(p.y, p.mo, p.d, 10, 0);
      if (p.h < 12) return cursor;
      if (p.h < 14) return romeWallToUtc(p.y, p.mo, p.d, 14, 0);
      if (p.h < 17) return cursor;
    }
    // Roll to next day 10:00 Rome local.
    const tomorrowUtc = new Date(romeWallToUtc(p.y, p.mo, p.d, 10, 0).getTime() + 24 * 60 * 60 * 1000);
    const tp = romeParts(tomorrowUtc);
    cursor = romeWallToUtc(tp.y, tp.mo, tp.d, 10, 0);
  }
  return input;
}
