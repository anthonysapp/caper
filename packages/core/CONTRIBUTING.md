# Contributing to Caper

Caper is a personal fork in active development. Contributions are welcome — bug reports, fixes, ideas — but please be aware that the project's direction is set by my own game-dev needs first, and merging will tilt toward changes that align with that direction.

## Bug reports

Open an issue on [github.com/anthonysapp/caper/issues](https://github.com/anthonysapp/caper/issues) with:

- A short description of what you expected vs what happened.
- A minimal reproduction (a kitchen-sink scene change is ideal).
- Your Caper version (from `packages/core/package.json`) and Node version.
- Browser + OS if it's a runtime/render bug.

## Pull requests

- Run `pnpm framework:build`, `pnpm kitchen-sink:build`, and `pnpm --filter @caper/core test` before opening the PR; all three should be green.
- Follow [Conventional Commits](https://www.conventionalcommits.org) — this repo uses `commitlint` and release-please reads commit messages to drive version bumps.
- Keep PRs focused. One concern per PR is far easier to review than five bundled together.
- If the change touches the framework's public surface (anything exported from `@caper/core`), call it out in the PR description so I can think about the migration story.
- For framework changes, the kitchen-sink is the integration test — exercise the change there and confirm it still runs end-to-end.

## What I'm less likely to merge

- Adding a new third-party dependency to `@caper/core`. The framework's dep set is deliberately small.
- Reintroducing systems the fork removed (springroll, physics-matter, physics-snap, the storage-adapter / plugin split). These were cut for reasons documented in `plan/audit.md` and `plan/fork-plan.md`.
- Stylistic refactors of code that already works.
- Features that depend on infrastructure I don't run (CI services, hosted databases, paid analytics, etc.).

If in doubt, open an issue first to talk it through before writing code.

## Development setup

```sh
pnpm install
pnpm kitchen-sink:dev    # the demo app — your sandbox for testing changes
```

Repo conventions, common commands, and the architecture overview live in [CLAUDE.md](./CLAUDE.md). The fork's roadmap and execution log live in [plan/](./plan/).
