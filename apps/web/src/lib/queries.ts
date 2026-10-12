import { useQuery } from "@tanstack/react-query";
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
