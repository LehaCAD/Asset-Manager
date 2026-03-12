# Ref MCP client

Local helper for calling the `Ref` MCP server even when this Codex runtime does not expose `Ref` as a native tool.

## Commands

```powershell
node scripts/ref-mcp-client.mjs tools
node scripts/ref-mcp-client.mjs search "next.js app router forms"
node scripts/ref-mcp-client.mjs read "https://example.com/docs/page#section"
node scripts/ref-mcp-client.mjs call ref_search_documentation '{"query":"django rest framework pagination"}'
```

## Config resolution

The client resolves config in this order:

1. `REF_MCP_URL` and optional `REF_MCP_API_KEY`
2. `C:\Users\ImpressivePC\.cursor\mcp.json` -> `mcpServers.Ref.url`

If the Cursor URL contains `apiKey=...`, the script strips it from the request URL and sends it as a bearer token instead.

## Notes

- This does not change the host runtime tool registry. It gives the repository a direct, script-level path to the same `Ref` server configured in Cursor.
- Network access is required for actual calls to `api.ref.tools`.
