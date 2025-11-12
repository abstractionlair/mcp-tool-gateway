# MCP Tool Gateway — Agent Guide

This repo contains a generic bridge and clients for calling MCP servers over a simple HTTP API. Agents working here should focus on making the gateway self‑contained, robust, and easy to adopt.

Start with docs/PLAN.md for the roadmap and priorities.

Key areas for specialization:
- Node service (HTTP API): stability, schema fidelity, multi‑server, observability
- MCP transport: stdio client (primary), optional HTTP/SSE proxy support
- Tool discovery + JSON Schemas: high‑quality input/output schemas
- Clients: Python + TS packages with retries, timeouts, structured errors
- Testing: unit + integration (Vitest + Supertest), local MCP dist targets
- Packaging & DX: Dockerfile, examples, simple config, clear README

Constraints/guidelines:
- Keep the gateway provider‑agnostic; no LLM/provider code here
- Keep endpoints minimal and stable: /call_tool, /tools, /logs, /health
- Favor explicit config over magic; support multiple servers
- Preserve ground‑truth logging (MCP_CALL_LOG)

See docs/PLAN.md and docs/ARCHITECTURE.md for details.

