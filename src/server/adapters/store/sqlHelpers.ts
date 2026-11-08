import type { SQLInputValue } from 'node:sqlite';

export type Row = Record<string, SQLInputValue>;

const camelToSnake = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Builds `UPDATE <table> SET a = ?, b = ? WHERE id = ?` from a patch. Column names come from the
 * caller's typed keys, never from user input.
 */
export function buildUpdate(
  table: string,
  id: string,
  patch: Readonly<Record<string, SQLInputValue | undefined>>,
) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [
    string,
    SQLInputValue,
  ][];
  const assignments = entries.map(([key]) => `${camelToSnake(key)} = ?`).join(', ');
  return {
    isEmpty: entries.length === 0,
    sql: `UPDATE ${table} SET ${assignments} WHERE id = ?`,
    params: [...entries.map(([, value]) => value), id],
  };
}

export const nullableString = (value: unknown): string | null => (value === null ? null : String(value));
