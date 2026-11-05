# `slopstopper/require-exclusive-indeterminate`

Reports a TanStack Table `getIsSomeRowsSelected()` or `getIsSomePageRowsSelected()` call that sets the indeterminate state of a checkbox without excluding the full selection. Both checks are `true` whenever at least one row is selected, including when every row is selected, so a select-all checkbox shows as indeterminate instead of checked. Pair each with the matching full selection check on the same receiver: `getIsSomeRowsSelected() && !getIsAllRowsSelected()`, or `getIsSomePageRowsSelected() && !getIsAllPageRowsSelected()`.

The call sets an indeterminate state when its value reaches a JSX `indeterminate={…}` attribute, a Svelte `indeterminate={…}` attribute, the expression or getter of a Svelte `bind:indeterminate={…}` directive, or an `indeterminate: …` object property. The value flows through logical operators, the branches of a conditional, TypeScript assertions, optional chains, and the expression body of an arrow function. A sibling `&&` operand `!x.getIsAllRowsSelected()` on the same receiver `x`, alone or inside a further `&&`, excludes the full selection. A partial selection check anywhere else, such as one that shows bulk actions, is not reported.

## Examples

Incorrect:

```tsx
<Checkbox checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected()} />
```

```svelte
<input type="checkbox" indeterminate={table.getIsSomePageRowsSelected()} />
```

Correct:

```tsx
<Checkbox
	checked={table.getIsAllRowsSelected()}
	indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
/>
```

```svelte
<input
	type="checkbox"
	indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
/>
```

## Autofix

The rule offers a suggestion, not an autofix, since the rewrite deliberately changes the indeterminate state when every row is selected. If the checkbox should stay indeterminate then, suppress the diagnostic.

The suggestion appends `&& !x.getIsAllRowsSelected()` (or `&& !x.getIsAllPageRowsSelected()`) on the same receiver `x`, keeping an optional chain `x?.`, and adds parentheses when the call is an operand of `||` or `??`.

## Limitations

- Svelte templates are checked only by ESLint with `svelte-eslint-parser`. Oxlint produces no Svelte nodes, so it checks only JSX and object properties.
- Receivers are compared by source text, so `table` and an alias of it do not match.
- The static functions `table_getIsSomeRowsSelected(table)` and `table_getIsSomePageRowsSelected(table)` are not checked.
- The setter of a Svelte function binding `bind:indeterminate={get, set}` counts as a value as well as the getter.
