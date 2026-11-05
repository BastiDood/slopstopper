# `slopstopper/require-table-state-pairs`

Reports a controlled TanStack Table v9 state slice that lacks its other half, in the options object literal passed to `useTable`, `createTable`, or `tableOptions`:

- A key `slice` of `options.state` needs the option `onSliceChange`, with the first letter of the slice capitalized, as in `state.pagination` and `onPaginationChange`. Without the handler, the table has no way to report updates, so it ignores them.
- An option `onSliceChange` needs `options.state.slice`, unless `options.atoms.slice` owns the slice. Without the state, the handler replaces the table's internal update but never feeds the value back, so the table and the handler's owner desynchronize.

The rule reports on the unmatched property. A `state` or `atoms` object can be the property's value or a getter whose body is a single `return` of an object literal (a method or function expression of that shape counts the same way), and its keys can be getters, as Svelte options often are. A handler can be a method.

## Examples

Incorrect:

```ts
const table = useTable({ features, columns, data, state: { pagination } });
const table = useTable({ features, columns, data, onSortingChange: setSorting });
```

Correct:

```ts
const table = useTable({
	features,
	columns,
	data,
	state: { pagination, sorting },
	onPaginationChange: setPagination,
	onSortingChange: setSorting,
});
const table = createTable({
	features,
	columns,
	data,
	atoms: { rowSelection: rowSelectionAtom },
	onRowSelectionChange: logSelection,
});
```

## No Autofix

The rule reports without a rewrite. The missing half needs state or a handler that only the author can write.

## Limitations

- The rule checks only an object literal passed directly, possibly through TypeScript assertions such as `satisfies`. Options built in a variable or composed across `tableOptions` calls are not checked.
- A spread or a dynamic computed key in the options object skips the whole object, since either can hide any key. One in the `state` object, or a `state` value that is no object literal, skips the whole object too. One in the `atoms` object, or an `atoms` value that is no object literal, skips only the check of handlers, since only that check reads `atoms`.
- A slice that both `state` and `atoms` provide is not reported, although the atom wins and the state entry is ignored.
- The callees match by name, without checking that they come from a TanStack Table package.
