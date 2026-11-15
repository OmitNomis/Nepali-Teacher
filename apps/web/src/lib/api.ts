import type { AppType } from "@nt/server/app";
import { hc, type ClientResponse, type InferResponseType, type parseResponse } from "hono/client";

export const client = hc<AppType>("/").api;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turns a hono client response into its JSON body, throwing ApiError on failure. */
export async function unwrap<T extends ClientResponse<unknown>>(
  res: T | Promise<T>,
): Promise<Awaited<ReturnType<typeof parseResponse<T>>>> {
  const r = await res;
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(r.status, body?.error ?? `Request failed (${r.status})`);
  }
  return (await r.json()) as never;
}

/** What a recording is for: an item, or a letter that only phrases have. */
export type AudioTarget = { itemId: string } | { syllable: string };

export const targetKey = (t: AudioTarget) => ("itemId" in t ? `item:${t.itemId}` : `syllable:${t.syllable}`);

export async function uploadAudio(target: AudioTarget, blob: Blob) {
  const form = new FormData();
  const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "m4a";
  form.append("file", new File([blob], `recording.${ext}`, { type: blob.type }));
  const url =
    "itemId" in target
      ? `/api/items/${encodeURIComponent(target.itemId)}/audio`
      : `/api/syllables/${encodeURIComponent(target.syllable)}/audio`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Upload failed (${res.status})`);
  }
  return (await res.json()) as { audioId: string; audioUrl: string };
}

export type ChapterSummary = InferResponseType<typeof client.chapters.$get, 200>[number];
export type ChapterDetail = InferResponseType<(typeof client.chapters)[":id"]["$get"], 200>;
export type Item = ChapterDetail["items"][number];
export type SyllableToRecord = InferResponseType<(typeof client.syllables)["missing-audio"]["$get"], 200>[number];
export type MissingItem = InferResponseType<(typeof client.items)["missing-audio"]["$get"], 200>[number];
export type LearnerProgress = InferResponseType<typeof client.progress.$get, 200>[number];
export type Me = InferResponseType<typeof client.auth.me.$get>["user"];
export type ReviewSummary = InferResponseType<typeof client.review.summary.$get, 200>;
export type ReviewSession = InferResponseType<typeof client.review.session.$get, 200>;
export type SessionCard = ReviewSession["cards"][number];
export type QuizItem = SessionCard["prompt"];
