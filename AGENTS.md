# Project Agent Instructions

## Local Skills
This repository contains project-local skills under `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills`.

When a task matches one of the skills below, open the referenced file and follow it before implementation:

- `architect`: task decomposition, contracts, file ownership, and `.cursor/rules` updates. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\architect\SKILL.md`
- `brainstorming`: required before creative feature design or behavior changes; produce a design first, then implement after approval. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\brainstorming\SKILL.md`
- `frontend-design`: high-quality frontend/page/component design work. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\frontend-design\SKILL.md`
- `frontend-patterns`: React/Next.js/frontend implementation patterns. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\frontend-patterns\SKILL.md`
- `powershell-command-reliability`: preferred way to run PowerShell commands in this repo. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\powershell-command-reliability\SKILL.md`
- `ui-ux-pro-max`: design-system/style research skill with helper assets. File: `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\ui-ux-pro-max\SKILL.md`

## Skill Notes
- `write-plan` exists only as a wrapper file at `C:\Users\ImpressivePC\Desktop\Asset Manager main\.cursor\skills\write-plan\write-plan.md`; there is no local `SKILL.md` for it in this repository.
- Prefer project-local skills above generic behavior when they apply.
- Load only the specific skill file needed for the current task; do not bulk-read the entire `.cursor\skills` tree.

## MCP Discovery
Cursor MCP is configured outside the repository at `C:\Users\ImpressivePC\.cursor\mcp.json`.

Registered servers found there:
- `pencil`: stdio server via `C:\Users\ImpressivePC\.cursor\extensions\highagency.pencildev-0.6.30-universal\out\mcp-server-windows-x64.exe --app cursor`
- `Ref`: HTTP server via `https://api.ref.tools/mcp?...`

Project-local Cursor metadata also exists here:
- `C:\Users\ImpressivePC\.cursor\projects\c-Users-ImpressivePC-Desktop-Asset-Manager-main\mcps\user-pencil\SERVER_METADATA.json`
- `C:\Users\ImpressivePC\.cursor\projects\c-Users-ImpressivePC-Desktop-Asset-Manager-main\mcps\user-Ref\SERVER_METADATA.json`

Known tool metadata found:
- `Ref` exposes `ref_search_documentation` and `ref_read_url`
- `pencil` metadata is present for design/document tools used by Cursor

## Native Access Policy For This Repo
- Treat the local `.cursor\skills` directory as first-class project guidance and read matching skill files directly from disk.
- Treat Cursor MCP configuration in `C:\Users\ImpressivePC\.cursor\mcp.json` as the source of truth for external MCP availability.
- In this Codex session, only MCP servers surfaced by the host runtime are callable as tools. If a server is configured in Cursor but not surfaced here, it can be inspected from disk but not invoked natively from this session.
- As of this check, `pencil` is available to this session as native tools, while `Ref` is only discoverable from Cursor config/metadata and is not exposed as a callable tool in this runtime.
