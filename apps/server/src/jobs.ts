import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import { jobs, type Job } from "./db/schema";

export type JobHandler = (payload: unknown, job: Job) => Promise<void>;

/** Errors that shouldn't be retried (e.g. ffmpeg missing). */
export class PermanentJobError extends Error {}

const MAX_ATTEMPTS = 3;

export function enqueue(db: Pick<Db, "insert">, type: string, payload: unknown, runAt?: Date) {
  db.insert(jobs).values({ type, payload, runAt }).run();
}

/**
 * In-process job runner polling the jobs table. One job at a time is plenty
 * for a couple of users, and it keeps ffmpeg from fighting itself for CPU.
 */
export function startJobRunner(db: Db, handlers: Record<string, JobHandler>, intervalMs = 1500) {
  // jobs left "running" by a crash get another go
  db.update(jobs).set({ status: "pending" }).where(eq(jobs.status, "running")).run();

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      while (await runOne(db, handlers)) {}
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  void tick();
  return { stop: () => clearInterval(timer), tick };
}

async function runOne(db: Db, handlers: Record<string, JobHandler>) {
  const job = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, new Date())))
    .orderBy(asc(jobs.runAt), asc(jobs.id))
    .limit(1)
    .get();
  if (!job) return false;

  db.update(jobs)
    .set({ status: "running", attempts: sql`${jobs.attempts} + 1` })
    .where(eq(jobs.id, job.id))
    .run();

  const handler = handlers[job.type];
  try {
    if (!handler) throw new PermanentJobError(`No handler for job type "${job.type}"`);
    await handler(job.payload, job);
    db.update(jobs).set({ status: "done", error: null }).where(eq(jobs.id, job.id)).run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    const giveUp = err instanceof PermanentJobError || attempts >= MAX_ATTEMPTS;
    console.error(`[jobs] ${job.type}#${job.id} failed (attempt ${attempts}): ${message}`);
    db.update(jobs)
      .set({
        status: giveUp ? "failed" : "pending",
        error: message,
        runAt: new Date(Date.now() + 30_000 * attempts),
      })
      .where(eq(jobs.id, job.id))
      .run();
  }
  return true;
}
