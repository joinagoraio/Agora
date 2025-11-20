# Agora

Agora is a collaborative research workbench for teams who need to collect evidence, annotate documents, and share findings with stakeholders.

## Features

- Workspace and space management with granular access
- Rich document viewer with annotations and highlights
- Evidence capture and sharing flows
- Connector framework for ingesting external sources

## Getting Started

```bash
pnpm install
pnpm dev
```

The app runs on the default Next.js development port unless otherwise configured. Set the required environment variables (Supabase, Redis, OpenAI, etc.) by copying `.env.example` to `.env.local` and filling in your secrets.

## Testing

Run the Vitest suite via:

```bash
npm test -- --run
```

## Deployment

Deploy to Vercel with the usual Next.js workflow (`vercel` CLI or Git-integrated deployments). Ensure build-time environment variables match the ones used locally.

## Contributing

1. Create a feature branch
2. Make changes and add tests when possible
3. Run linting and tests locally
4. Open a PR describing behaviour and verification steps
