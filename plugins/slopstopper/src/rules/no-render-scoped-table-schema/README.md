# `slopstopper/no-render-scoped-table-schema`

Reports a TanStack Table v9 call that builds the table schema on every render: `tableFeatures(…)`, `createColumnHelper(…)`, or `helper.columns(…)` on a column helper. The features, the column helper, and the columns are static, so build them once at module scope and pass them to the table. A column helper is a `createColumnHelper(…)` call or a never-reassigned `const` that it initializes, directly or through `const` aliases. `tableFeatures` and `createColumnHelper` count when they are imported or undeclared, not when a local binding shadows them.

In a Svelte component, a call in the instance `<script>` is reported, and a call in the module script, `<script module>` or the legacy `<script context="module">`, is not. In any other file, a call inside a function named like a React component (`Table`) or hook (`useColumns`) is reported, unless a `useMemo` or `React.useMemo` callback between them holds the call. The function goes by its own name or by the variable that it initializes, through wrapper calls such as `memo(…)` and `forwardRef(…)`.

## Examples

Incorrect:

```tsx
function PeopleTable({ data }: Props) {
	const features = tableFeatures({ rowSortingFeature });
	const helper = createColumnHelper<typeof features, Person>();
	const columns = helper.columns([helper.accessor('name', { header: 'Name' })]);
	const table = useTable({ features, columns, data });
	return <DataTable table={table} />;
}
```

```svelte
<script lang="ts">
	const features = tableFeatures({ rowSortingFeature });
	const columns = createColumnHelper<typeof features, Person>().columns([]);
</script>
```

Correct:

```tsx
const features = tableFeatures({ rowSortingFeature });
const helper = createColumnHelper<typeof features, Person>();
const columns = helper.columns([helper.accessor('name', { header: 'Name' })]);

function PeopleTable({ data }: Props) {
	const table = useTable({ features, columns, data });
	return <DataTable table={table} />;
}
```

```svelte
<script module lang="ts">
	const features = tableFeatures({ rowSortingFeature });
	const columns = createColumnHelper<typeof features, Person>().columns([]);
</script>

<script lang="ts">
	const table = createTable({ features, columns, get data() { return data; } });
</script>
```

## No Autofix

The rule reports without a rewrite. Hoisting the schema moves code across scopes, and columns that read props or state must take those values from the table or its metadata instead.

## Limitations

- Svelte components are checked only by ESLint with `svelte-eslint-parser`, whose AST tells the instance script from the module script. Oxlint produces no Svelte nodes, so it reports nothing in a `.svelte` file.
- A call in a class component, or in a function whose name follows neither the component nor the hook convention, is not reported.
- `useMemo` is matched by name, without checking that it comes from React.
- A column helper reached through a `let`, a parameter, or a property is not recognized.
