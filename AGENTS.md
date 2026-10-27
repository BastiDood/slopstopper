# Slopstopper

A monorepo of strict, composable lint, format, and TypeScript configurations for combating sloppy code from coding agents.

## Typical Workflow

After implementing a feature, fixing a bug, refactoring modules, or any other notable change to the codebase:

1. Run the linter `pnpm lint:fix`.
2. Run the formatter `pnpm fmt:fix`.
3. Run the type checker `pnpm check`.
4. Run the unit tests `pnpm test`.

## Dependency Policy

- Do not add dependencies built for ESLint 9 or earlier (including `@types/*` packages typed against ESLint 9). Reimplement the missing rules in our own lint plugin instead.
- Configure tools through their configuration files. Do not add CLI flags to package scripts or ship ignore files.
