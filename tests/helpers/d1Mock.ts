type QueryResult = {
  results?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  success?: boolean;
};

type QueryHandler = (
  sql: string,
  args: unknown[],
  operation: 'first' | 'all' | 'run'
) => QueryResult | Record<string, unknown> | null | undefined;

type QueryCall = {
  sql: string;
  args: unknown[];
  operation: 'first' | 'all' | 'run';
};

export type D1Mock = D1Database & {
  calls: QueryCall[];
};

export function createD1Mock(handler?: QueryHandler): D1Mock {
  const calls: QueryCall[] = [];

  const db = {
    calls,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T = Record<string, unknown>>() {
              calls.push({ sql, args, operation: 'first' });
              return (handler?.(sql, args, 'first') ?? null) as T | null;
            },
            async all<T = Record<string, unknown>>() {
              calls.push({ sql, args, operation: 'all' });
              const result = handler?.(sql, args, 'all');
              return (result ?? { results: [] }) as D1Result<T>;
            },
            async run() {
              calls.push({ sql, args, operation: 'run' });
              const result = handler?.(sql, args, 'run');
              return (result ?? { success: true, meta: {} }) as D1Result;
            },
          };
        },
        async first<T = Record<string, unknown>>() {
          calls.push({ sql, args: [], operation: 'first' });
          return (handler?.(sql, [], 'first') ?? null) as T | null;
        },
        async all<T = Record<string, unknown>>() {
          calls.push({ sql, args: [], operation: 'all' });
          const result = handler?.(sql, [], 'all');
          return (result ?? { results: [] }) as D1Result<T>;
        },
        async run() {
          calls.push({ sql, args: [], operation: 'run' });
          const result = handler?.(sql, [], 'run');
          return (result ?? { success: true, meta: {} }) as D1Result;
        },
      };
    },
  };

  return db as unknown as D1Mock;
}

export function parseToolResult(result: {
  content: Array<{ type: string; text: string }>;
}): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}
