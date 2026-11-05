# `slopstopper/prefer-table-atoms`

Reports a use of a TanStack Table v9 table's aggregate `table.store` where the atom of one slice, `table.atoms.<slice>`, serves. The store combines every state slice, so a read or a subscription through it depends on all of them, while a slice atom depends on one.

The rule follows TanStack's own guidance:

- React deprecates `table.store` for render reads in favor of `table.atoms.<slice>.get()` and explicit subscriptions (`packages/react-table/src/useTable.ts`).
- React subscriptions should "Use `source={table.store}` with a selector for multiple slices, or a specific atom for the narrowest boundary" (`packages/react-table/skills/table-state/references/reactivity.md`). Without `source`, `table.Subscribe` selects from `table.store` (`packages/react-table/skills/table-state/SKILL.md`).
- React `table.Subscribe` compares selected values with `shallow` (`packages/react-table/src/Subscribe.ts`), while `useSelector` from `@tanstack/react-store` compares with `===` unless its third argument passes `compare` (`packages/react-store/src/useSelector.ts` in TanStack/store). A selector that returns a fresh array or object is cheap under `Subscribe` and re-renders on every change under a plain `useSelector`.
- Svelte should "Prefer a slice read; a whole-store read reruns for every registered state change", and "For raw external atoms consumed outside table UI, use `useSelector` from `@tanstack/svelte-store`; table UI uses the rune-aware `table.atoms` wrappers" (`packages/svelte-table/skills/table-state/SKILL.md`). The endorsed form is `$derived` over `table.atoms.<slice>.get()`.

The rule reports:

- A snapshot read, `table.store.get()` or `table.store.state`, and any other raw use of `table.store`, such as `table.store.subscribe(...)`, in TypeScript, JSX, and Svelte components.
- A subscription to the store through a selector whose selector is an inline function that reads exactly one top-level slice of its state, as in `(s) => s.rowSelection`, `({ rowSelection }) => rowSelection`, or `(s) => s.rowSelection[id]`. The subscriptions are `useSelector(table.store, selector)` with `useSelector` imported from `@tanstack/react-store`, `<x.Subscribe source={table.store} selector={...}>`, the `Subscribe` component imported from `@tanstack/react-table` with the same props, and `<table.Subscribe selector={...}>` without a `source`, which selects from the store. A selector that reads two or more slices, or that the rule cannot analyze, such as a function passed by reference, is allowed, with one exception below.
- A `useSelector(table.store, selector)` from `@tanstack/react-store` whose selector reads several slices and returns a fresh array or object literal, as its expression body or its single `return`, when the call passes no third argument. `useSelector` compares with `===` by default, so the fresh value re-renders on every table state change. Pass `{ compare: shallow }` from `@tanstack/react-store`. A selector that returns anything else, such as a primitive or a slice value, and a call with a third argument are allowed.
- `useSelector(table.store, ...)` from `@tanstack/svelte-store`, whatever its selector. Svelte table UI reads `table.atoms.<slice>.get()` inside `$derived` instead.
- `<table.Subscribe>` with neither a `source` nor a `selector`, which re-renders on every state change. An element with a spread attribute may pass a `source`, so it is not reported.

A `useSelector` or `Subscribe` of another library, or a store subscription without a selector, counts as a raw use of the store.

Without type information, a table is the identifier `table`, a non-computed `table` member such as `props.table`, a call to `useTable` or `createTable`, or a never-reassigned `const` whose initializer is one of these, followed through aliases and TypeScript assertions.

## Examples

Incorrect:

```tsx
const pageIndex = table.store.get().pagination.pageIndex;
const { sorting } = table.store.get();
const rowSelection = useSelector(table.store, state => state.rowSelection);
const selected = useSelector(table.store, state => [state.pagination, state.sorting]);

<table.Subscribe selector={state => state.rowSelection[row.id]}>
	{selected => <Checkbox checked={!!selected} />}
</table.Subscribe>;
<table.Subscribe>{() => <Footer table={table} />}</table.Subscribe>;
```

```svelte
<script lang="ts">
	const sorting = useSelector(table.store, state => state.sorting);
</script>

<span>{table.store.get().pagination.pageIndex}</span>
```

Correct:

```tsx
const pageIndex = table.atoms.pagination.get().pageIndex;
const sorting = table.atoms.sorting.get();
const rowSelection = useSelector(table.atoms.rowSelection);
const selected = useSelector(table.store, state => [state.pagination, state.sorting], {
	compare: shallow,
});

<table.Subscribe source={table.atoms.rowSelection} selector={selection => selection[row.id]}>
	{selected => <Checkbox checked={!!selected} />}
</table.Subscribe>;
<table.Subscribe selector={state => ({ pagination: state.pagination, sorting: state.sorting })}>
	{({ pagination, sorting }) => <Footer pagination={pagination} sorting={sorting} />}
</table.Subscribe>;
```

```svelte
<script lang="ts">
	const sorting = $derived(table.atoms.sorting.get());
</script>

<span>{table.atoms.pagination.get().pageIndex}</span>
```

## Autofix

The rule offers suggestions, not autofixes. `table.atoms` holds only the slices of registered features, so a rewrite throws where the store read gave `undefined`. If a slice is not registered by a table feature, suppress the diagnostic.

For a snapshot read, the suggestion rewrites `table.store.get().slice` and `table.store.state.slice` into `table.atoms.slice.get()`. A declarator that destructures the snapshot becomes one declarator per slice under its local name, so `const { pagination, sorting: order } = table.store.get()` becomes `const pagination = table.atoms.pagination.get(), order = table.atoms.sorting.get()`. It reports without a suggestion when the read names no slice, when the table is no plain reference such as a call, when the table link is optional, when the slice is written or called as a method, when the pattern is not an object pattern or has a type annotation, a default value, a rest element, or a key that names no identifier, or when the rewrite would drop a comment.

For a selector of one slice, the suggestion subscribes to the slice's atom and rebases the selector onto the slice value: `source={table.store}` and `useSelector(table.store, ...)` take `table.atoms.slice` instead of the store, and `<table.Subscribe selector={...}>` gains `source={table.atoms.slice}`. Each `s.slice` in the selector becomes `s`, and a destructured `({ slice: pattern })` becomes `(pattern)`. It reports without a suggestion when the selector's parameter has a type annotation, which types the whole state, when the table is no plain reference, or when the rewrite would drop a comment.

`<table.Subscribe>` without a `source` or a `selector` is reported without a rewrite, because only the author knows which slices it reads. A `useSelector` without `compare` is reported without a rewrite, because the fix needs an import of `shallow`. A Svelte `useSelector` is reported without a rewrite, because only the author knows which slices it reads.

## Type Information

With typescript-eslint type information, a table is also any expression whose type has the `store`, `atoms`, and `baseAtoms` properties of a table instance, such as `getTable().store` or a table under any name. This also applies to the object of `<x.Subscribe>`. An `any` or `unknown` type is no table.

## Limitations

- Without type information, a table under another name than `table` is recognized only through a `const` initialized by `useTable` or `createTable`. A parameter, a `let`, or a `createTableHook` table under another name is not.
- A selector is analyzed only as an inline arrow or function expression. Its first parameter must be a plain name whose every use reads a static member, or an object pattern without a rest element or a computed key.
- The rebase does not check that the selector never writes to its state.
- `table.state`, the React adapter's selected state, is not reported.
- Oxlint lints only the `<script>` blocks of Svelte components, so template reads are reported only through ESLint with `svelte-eslint-parser`.
