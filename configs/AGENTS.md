# Configuration Packages

- The consumer owns every project-specific detail: `files`, globals, env, paths, ignore patterns, and Tailwind stylesheets. Never impose these from a package.
- Each package exports `compose` from its root and one subpath per entry. Never add a barrel.
- An entry is a `SCREAMING_CASE` constant. Use a factory with a single positional argument only when the consumer must supply a value.
- Development `exports` point at the TypeScript sources and `publishConfig.exports` point at the build output. Keep both in sync when adding an entry.
- The repository's own lint and format configs load package sources through Node.js type stripping, so those packages must stay erasable-syntax-only.
- Use plain mutable arrays: the upstream config types are mutable, so `readonly` belongs on properties only.
- Config generation runs once at module load. Precompute module constants; avoid array-method chains and throwaway allocations.
- Test files share module state, so tests must never mutate exported entries. Test only project-owned logic.
