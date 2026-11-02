import { useMe } from "./queries";

/**
 * The mouth diagrams and tips (packages/shared/src/articulation.ts) stay hidden
 * from the learner until the owner has checked every letter; admins still see
 * them, to review. Flip this once they're all right.
 */
export const PRONUNCIATION_FOR_LEARNERS = false;

export function useShowPronunciation() {
  const { data: me } = useMe();
  return PRONUNCIATION_FOR_LEARNERS || me?.role === "admin";
}
