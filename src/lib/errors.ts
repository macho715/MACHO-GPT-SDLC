export const MCP_ERROR_CODE = {
  parse: -32700,
  invalidParams: -32602,
  methodNotFound: -32601,
  internal: -32603,
} as const;

export { jsonRpcError } from './mcp';
