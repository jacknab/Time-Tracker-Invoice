# Workspace

## Overview

Time tracker and invoice generator for a freelance web developer working with one client (Tom Lam) at $8/hour.

## Artifacts

- `time-tracker` (web app at `/`) — React + Vite frontend
- `api-server` (at `/api`) — Express + Drizzle backend

## Stack

- pnpm workspaces, TypeScript 5.9, Node.js 24
- API: Express 5, OpenAPI -> Orval codegen (React Query hooks + Zod)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite + Tailwind + wouter

## Data Model

- `tasks` — title, description, status (active/completed/archived)
- `time_entries` — taskId, description, startedAt, endedAt, invoiceId
- `invoices` — invoiceNumber, totals, status (unpaid/paid), notes

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/schemas
- `pnpm --filter @workspace/db run push` — push DB schema
