import { describe, expect, it } from 'vitest';
import { tools } from './index';

describe('tool contract snapshot', () => {
  it('matches the registered tool schemas and contract hashes', () => {
    expect(
      tools.map((tool) => ({
        name: tool.name,
        schema_version: tool.schema_version,
        contract_hash: tool.contract_hash,
        inputSchema: tool.inputSchema,
      }))
    ).toMatchSnapshot();
  });
});
