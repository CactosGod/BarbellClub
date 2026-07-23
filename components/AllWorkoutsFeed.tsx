"use client";

import { useEffect, useRef, useState } from "react";
import { loadMoreWorkouts } from "@/app/schedule/actions";
import { ScheduleDay } from "@/components/ScheduleDay";
import type { DayGroup } from "@/lib/schedule-feed";

function mergeGroups(existing: DayGroup[], incoming: DayGroup[]): DayGroup[] {
  const map = new Map<string, DayGroup["sessions"]>();
  for (const g of existing) map.set(g.date, [...g.sessions]);
  for (const g of incoming) {
    const list = map.get(g.date) ?? [];
    const seen = new Set(list.map((s) => s.id));
    for (const s of g.sessions) {
      if (!seen.has(s.id)) list.push(s);
    }
    map.set(g.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, sessions]) => ({ date, sessions }));
}

export default function AllWorkoutsFeed({
  initialGroups,
  initialHasMore,
  today,
}: {
  initialGroups: DayGroup[];
  initialHasMore: boolean;
  today: string;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef(0);
  const hasMoreRef = useRef(initialHasMore);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadingRef.current || !hasMoreRef.current) return;

        loadingRef.current = true;
        setLoading(true);
        setError(null);
        const nextPage = pageRef.current + 1;

        void loadMoreWorkouts(nextPage).then((res) => {
          if ("error" in res) {
            setError(res.error);
            loadingRef.current = false;
            setLoading(false);
            return;
          }
          pageRef.current = nextPage;
          setGroups((prev) => mergeGroups(prev, res.groups));
          setHasMore(res.hasMore);
          hasMoreRef.current = res.hasMore;
          loadingRef.current = false;
          setLoading(false);
        });
      },
      { rootMargin: "320px 0px" },
    );

    io.observe(node);
    return () => io.disconnect();
  }, []);

  if (groups.length === 0) {
    return <p className="text-sm text-neutral-600">No sessions here.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <ScheduleDay
          key={g.date}
          date={g.date}
          isToday={g.date === today}
          sessions={g.sessions}
          backHref="/?view=list"
          today={today}
        />
      ))}

      <div ref={sentinelRef} className="h-8" aria-hidden />

      {loading && (
        <p className="pb-4 text-center text-xs text-neutral-500">Loading…</p>
      )}
      {error && (
        <p className="pb-4 text-center text-xs text-red">{error}</p>
      )}
      {!hasMore && !loading && (
        <p className="pb-4 text-center text-xs text-neutral-600">
          End of history
        </p>
      )}
    </div>
  );
}
