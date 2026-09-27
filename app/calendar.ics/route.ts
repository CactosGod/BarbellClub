import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubLocalToIso, clubToday, isWodHidden } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const MINUTES = 90;
const LOCATION = "East Breeze CrossFit, Linnavuorentie 28, 00950 Helsinki";

type FeedSession = {
  id: number;
  date: string;
  start_time: string | null;
  title: string;
  wod_description: string | null;
  reveal_at: string | null;
};

// Public upcoming-session feed. Google Calendar fetches this without a member
// cookie, so hidden WODs stay out of the description.
export async function GET(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return new NextResponse("Calendar feed is not configured.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const origin = requestOrigin(request);
  const today = clubToday();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sessions")
    .select("id, date, start_time, title, wod_description, reveal_at")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return new NextResponse("Couldn't build the calendar.\n", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = renderCalendar((data ?? []) as FeedSession[], origin);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function renderCalendar(sessions: FeedSession[], origin: string): string {
  const now = icsUtc(new Date());
  const events = sessions.map((s) => renderEvent(s, origin, now));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KMPP Barbell Club//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:KMPP Barbell Club",
    "X-WR-TIMEZONE:Europe/Helsinki",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function renderEvent(s: FeedSession, origin: string, stamp: string): string {
  const hm = (s.start_time ?? "10:00:00").slice(0, 5);
  const start = new Date(clubLocalToIso(`${s.date}T${hm}`));
  const end = new Date(start.getTime() + MINUTES * 60_000);
  const url = `${origin}/session/${s.id}`;
  const description = [url];
  if (s.wod_description && !isWodHidden(s.reveal_at)) {
    description.push(s.wod_description);
  }

  return [
    "BEGIN:VEVENT",
    `UID:session-${s.id}@kmpp-barbell`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    fold(`SUMMARY:${icsText(`Barbell Club: ${s.title}`)}`),
    fold(`LOCATION:${icsText(LOCATION)}`),
    fold(`DESCRIPTION:${icsText(description.join("\n"))}`),
    fold(`URL:${url}`),
    "END:VEVENT",
  ].join("\r\n");
}

function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string): string {
  const limit = 73;
  if (line.length <= limit) return line;
  const parts = [line.slice(0, limit)];
  for (let i = limit; i < line.length; i += 72) {
    parts.push(` ${line.slice(i, i + 72)}`);
  }
  return parts.join("\r\n");
}
