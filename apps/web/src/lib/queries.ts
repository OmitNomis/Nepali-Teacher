import { useQuery } from "@tanstack/react-query";
import { letterKey } from "@nt/shared";
import { client, unwrap } from "./api";

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(client.auth.me.$get()).then((r) => r.user),
    staleTime: Infinity,
  });

export const useChapters = (opts: { archived?: boolean } = {}) =>
  useQuery({
    queryKey: ["chapters", opts.archived ?? false],
    queryFn: () => unwrap(client.chapters.$get({ query: opts.archived ? { archived: "1" } : {} })),
  });

export const useChapter = (id: string) =>
  useQuery({
    queryKey: ["chapter", id],
    queryFn: () => unwrap(client.chapters[":id"].$get({ param: { id } })),
  });

export const useTtsStatus = () =>
  useQuery({
    queryKey: ["tts"],
    queryFn: () => unwrap(client.tts.$get()),
    staleTime: Infinity,
  });

export const useMissingAudio = () =>
  useQuery({
    queryKey: ["missing-audio"],
    queryFn: () => unwrap(client.items["missing-audio"].$get()),
  });

/** Letters only phrases have (स्ते, होस्…) that still need a human recording. */
export const useSyllablesToRecord = () =>
  useQuery({
    queryKey: ["syllables-to-record"],
    queryFn: () => unwrap(client.syllables["missing-audio"].$get()),
  });

export const useReviewSummary = () =>
  useQuery({
    queryKey: ["review-summary"],
    queryFn: () => unwrap(client.review.summary.$get()),
  });

/** A quiz session is a snapshot: never refetched while she's answering it. */
export const useReviewSession = (chapterId?: string) =>
  useQuery({
    queryKey: ["review-session", chapterId ?? null],
    queryFn: () => unwrap(client.review.session.$get({ query: chapterId ? { chapter: chapterId } : {} })),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

/** Clip URL for each letter that has one, keyed by letterKey (for tapping letters in a phrase). */
export const useLetterSounds = (enabled = true) =>
  useQuery({
    queryKey: ["letter-sounds"],
    queryFn: () => unwrap(client["letter-sounds"].$get()),
    select: (sounds) => new Map(sounds.map((s) => [letterKey(s.ne), s.audioUrl])),
    enabled,
  });
