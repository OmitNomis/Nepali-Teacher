import { useMe } from "./queries";

/**
 * Whether the learner sees the mouth diagrams and tips
 * (packages/shared/src/articulation.ts). Admins always do; while this is off
 * their sheet is tagged "Hidden from learner". Turn it off again to hide the
 * guides while reworking them.
 */
export const PRONUNCIATION_FOR_LEARNERS = true;

export function useShowPronunciation() {
  const { data: me } = useMe();
  return PRONUNCIATION_FOR_LEARNERS || me?.role === "admin";
}
