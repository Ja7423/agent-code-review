import { monotonicFactory } from 'ulid';

export interface IdGenerator {
  next(): string;
}

/** ULIDs: sortable by creation time, unique across processes. */
export function createUlidGenerator(): IdGenerator {
  const ulid = monotonicFactory();
  return { next: () => ulid() };
}
