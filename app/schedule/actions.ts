"use server";

import { getCurrentProfile } from "@/lib/auth";
import { fetchWorkoutsPage, type DayGroup } from "@/lib/schedule-feed";
import { isStaff } from "@/lib/types";

export async function loadMoreWorkouts(
  page: number,
): Promise<{ groups: DayGroup[]; hasMore: boolean } | { error: string }> {
  if (!Number.isInteger(page) || page < 1) {
    return { error: "Invalid page." };
  }
  const me = await getCurrentProfile();
  if (!me || me.status !== "active") {
    return { error: "Unauthorized." };
  }
  return fetchWorkoutsPage(page, me.id, isStaff(me.role));
}
