export interface Env {
  DB: D1Database;
  API_KEY: string;
  ENVIRONMENT?: string;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  schema_version?: string;
  contract_hash?: string;
};

export type ContractedToolDefinition = ToolDefinition & {
  schema_version: string;
  contract_hash: string;
};

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (args: Record<string, unknown>, db: D1Database) => Promise<ToolResult>;

export const TOOL_SCHEMA_VERSION = 'v3.1';

const ALLOWED_ID_TABLES = new Set(['session', 'tasks', 'discussion_thread']);

export const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

export const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
  isError: true,
});

export const cors = (): HeadersInit => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Content-Type': 'application/json',
});

export const auth = (request: Request, env: Env): boolean => {
  const token =
    request.headers.get('x-api-key') ??
    request.headers.get('authorization')?.replace('Bearer ', '');

  return token === env.API_KEY;
};

export const jsonRpcError = (
  id: string | number | null,
  code: number,
  message: string
): { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } } => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

export async function nextId(db: D1Database, table: string, prefix: string): Promise<string> {
  if (!ALLOWED_ID_TABLES.has(table)) {
    throw new Error(`Unsupported id table: ${table}`);
  }

  // MAX(suffix)+1 — COUNT(*) regenerates an existing id after a middle row is
  // deleted (gap), causing a UNIQUE constraint collision. MAX is gap-safe.
  const row = await db
    .prepare(`SELECT MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)) AS m FROM ${table}`)
    .first<{ m: number | null }>();
  return `${prefix}-${String((row?.m ?? 0) + 1).padStart(3, '0')}`;
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

export const buildToolContractHash = (tool: ToolDefinition): string => {
  const payload = {
    schema_version: TOOL_SCHEMA_VERSION,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations ?? {},
  };
  return `fnv1a32:${fnv1a32(stableStringify(payload))}`;
};

export const withToolContracts = (toolDefinitions: ToolDefinition[]): ContractedToolDefinition[] =>
  toolDefinitions.map((tool) => ({
    ...tool,
    schema_version: TOOL_SCHEMA_VERSION,
    contract_hash: buildToolContractHash(tool),
  }));
