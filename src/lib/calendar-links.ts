function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toGoogleDateUtc(input: Date) {
  const y = input.getUTCFullYear();
  const m = pad(input.getUTCMonth() + 1);
  const d = pad(input.getUTCDate());
  const hh = pad(input.getUTCHours());
  const mm = pad(input.getUTCMinutes());
  const ss = pad(input.getUTCSeconds());
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function toOutlookDateUtc(input: Date) {
  return input.toISOString();
}

type CalendarLinkInput = {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
};

export function buildGoogleCalendarLink(input: CalendarLinkInput) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);
  url.searchParams.set("dates", `${toGoogleDateUtc(input.start)}/${toGoogleDateUtc(input.end)}`);
  if (input.details) url.searchParams.set("details", input.details);
  if (input.location) url.searchParams.set("location", input.location);
  return url.toString();
}

export function buildOutlookCalendarLink(input: CalendarLinkInput) {
  const url = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  url.searchParams.set("path", "/calendar/action/compose");
  url.searchParams.set("rru", "addevent");
  url.searchParams.set("subject", input.title);
  url.searchParams.set("startdt", toOutlookDateUtc(input.start));
  url.searchParams.set("enddt", toOutlookDateUtc(input.end));
  if (input.details) url.searchParams.set("body", input.details);
  if (input.location) url.searchParams.set("location", input.location);
  return url.toString();
}
