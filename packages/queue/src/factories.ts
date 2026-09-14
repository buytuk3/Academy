/**
 * @workspace/queue — factories.ts
 * Canonical Queue / Worker / QueueEvents factory. Every queue in the
 * platform must be created through these factories.
 */
import {
  Queue,
  Worker,
  QueueEvents,
  type Processor,
  type QueueOptions,
  type JobsOptions,
} from "bullmq";
import { redis, queuePrefix } from "./client.js";

export function makeQueueOptions(
  overrides: { attempts?: number; backoff?: JobsOptions["backoff"]; priority?: number } = {},
): QueueOptions {
  return {
    connection: redis,
    prefix: queuePrefix,
    defaultJobOptions: {
      attempts: overrides.attempts ?? 3,
      backoff: overrides.backoff ?? { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
      removeOnFail: { count: 5000, age: 30 * 24 * 3600 },
      ...(overrides.priority !== undefined ? { priority: overrides.priority } : {}),
    },
  };
}

export function createQueue<T = any>(name: string, opts: Partial<QueueOptions> = {}): Queue<T> {
  return new Queue<T>(name, { connection: redis, prefix: queuePrefix, ...opts } as QueueOptions);
}

export function createWorker<T = any, R = any>(
  name: string,
  processor: Processor<T, R>,
  opts: { concurrency?: number; autorun?: boolean } = {},
): Worker<T, R> {
  return new Worker<T, R>(name, processor, {
    connection: redis,
    prefix: queuePrefix,
    concurrency: opts.concurrency ?? 3,
    autorun: opts.autorun ?? true,
  });
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: redis, prefix: queuePrefix });
}
