import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_TABLE_ATOMS } from './index.ts';

const TSX = { languageOptions: { parserOptions: { lang: 'tsx' } } } as const;
const JSX = { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } } as const;
const SVELTE = 'Table.svelte';
const RULE = eslintRule(PREFER_TABLE_ATOMS);

/** A store read and the rewrite that its suggestion offers: the table, the slices that it reads, and the output. */
interface AtomsSuggestion {
	table: string;
	slices: string;
	output: string;
}

/** A selector of one slice and the subscription that its suggestion offers: the table, the slice, and the output. */
interface SliceSuggestion {
	table: string;
	slice: string;
	output: string;
}

OXLINT_RULE_TESTER.run('prefer-table-atoms', PREFER_TABLE_ATOMS, {
	valid: [
		// The parameter `t` shadows the table `t`, and `this` is no table.
		'const t = useTable(options); function f(t) { return t.store.get() ?? this.store; } f(t);',
		// Selectors that read several slices, or that the rule cannot analyze, may subscribe to the store. `useSelector`
		// needs a `compare` only for a fresh literal.
		{
			code: `import { useSelector } from '@tanstack/react-store';
const a = <table.Subscribe selector={s => [s.rowSelection, s.sorting]} />;
const b = <table.Subscribe selector={select} />;
const c = <table.Subscribe selector={() => count} />;
const unused = <table.Subscribe selector={s => count} />;
const d = <table.Subscribe selector={s => Object.keys(s)} />;
const e = <table.Subscribe selector={s => s[key]} />;
const f = <table.Subscribe selector={({ rowSelection, sorting }) => [rowSelection, sorting]} />;
const g = <table.Subscribe selector={({ ...state }) => state} />;
const h = <table.Subscribe selector={({ [key]: value }) => value} />;
const i = <table.Subscribe source={table.store} selector={s => [s.rowSelection, s.sorting]} />;
useSelector(table.store, s => ({ pagination: s.pagination, sorting: s.sorting }), { compare: shallow });
useSelector(table.store, s => s.pagination.pageIndex + s.sorting.length);
useSelector(table.store, function (s) { log(s.pagination); return [s.pagination, s.sorting]; });`,
			...TSX,
		},
		// An atom source, a spread that may pass a `source`, a `Subscribe` of no table, and an atom subscription.
		{
			code: `import { useSelector } from '@tanstack/react-store';
const a = <table.Subscribe source={table.atoms.rowSelection} />;
const b = <table.Subscribe {...props} />;
const c = <other.Subscribe />;
useSelector(atom, s => s.pagination);`,
			...TSX,
		},
	],
	invalid: [
		// Uses that read no snapshot slice leave only the report.
		{
			code: 'table.store.subscribe(() => {}); f(table.store); x.f(table.store); x[table.store]; const read = table.store.get; table.store.get(now).pagination; f(table.store.get()); x[table.store.get()];',
			errors: Array.from({ length: 8 }, () => storeError('table')),
		},
		// Destructuring that is no object pattern, is empty, typed, has a rest element, a default, or a key that names no
		// identifier leaves only the report.
		{
			code: "const snapshot = table.store.get(); const {} = table.store.get(); const { sorting }: State = table.store.get(); const { ...state } = table.store.get(); const { pagination = d } = table.store.get(); const { [key]: value } = table.store.get(); const { 'page-size': size } = table.store.get();",
			errors: Array.from({ length: 7 }, () => storeError('table')),
		},
		// Slice reads that are computed, call a method, are written, follow an optional table, or hold a comment leave only
		// the report.
		{
			code: "table.store.get()[key]; table.store.get()['page-size']; table.store.get().toString(); table.store.get().pagination = p; for (table.store.get().pagination in o); for (table.store.get().pagination of o); table.store.get().pagination++; delete table.store.get().pagination; table?.store.get().pagination; table.store.get(/* now */).pagination; useTable(options).store.get().pagination;",
			errors: [
				...Array.from({ length: 10 }, () => storeError('table')),
				storeError('useTable(options)'),
			],
		},
		{
			code: 'a = table.store.get().pagination; typeof table.store.state.sorting; f(props.table.store.get().rowSelection);',
			errors: [
				atomsSuggestion({
					table: 'table',
					slices: '`pagination`',
					output: 'a = table.atoms.pagination.get(); typeof table.store.state.sorting; f(props.table.store.get().rowSelection);',
				}),
				atomsSuggestion({
					table: 'table',
					slices: '`sorting`',
					output: 'a = table.store.get().pagination; typeof table.atoms.sorting.get(); f(props.table.store.get().rowSelection);',
				}),
				atomsSuggestion({
					table: 'props.table',
					slices: '`rowSelection`',
					output: 'a = table.store.get().pagination; typeof table.store.state.sorting; f(props.table.atoms.rowSelection.get());',
				}),
			],
		},
		// Each destructured slice becomes its own declarator, under its local name.
		{
			code: 'const { pagination, sorting: order } = table.store.get();',
			errors: [
				atomsSuggestion({
					table: 'table',
					slices: '`pagination` and `sorting`',
					output: 'const pagination = table.atoms.pagination.get(), order = table.atoms.sorting.get();',
				}),
			],
		},
		// `table.Subscribe` without a `source` selects from the store; the suggestion adds the atom source.
		{
			code: 'const x = <table.Subscribe selector={s => s.rowSelection[id]} />;',
			...TSX,
			errors: [
				sliceSuggestion({
					table: 'table',
					slice: 'rowSelection',
					output: 'const x = <table.Subscribe source={table.atoms.rowSelection} selector={s => s[id]} />;',
				}),
			],
		},
		// A string import name, and a destructured selector rebased onto its value pattern.
		{
			code: 'import { "Subscribe" as Watch } from "@tanstack/react-table"; const x = <Watch source={table.store} selector={({ rowSelection }) => rowSelection} />;',
			...TSX,
			errors: [
				sliceSuggestion({
					table: 'table',
					slice: 'rowSelection',
					output: 'import { "Subscribe" as Watch } from "@tanstack/react-table"; const x = <Watch source={table.atoms.rowSelection} selector={(rowSelection) => rowSelection} />;',
				}),
			],
		},
		// `useSelector` without a selector subscribes to the whole store.
		{
			code: "import { useSelector } from '@tanstack/react-store'; useSelector(table.store, function (s) { return s.sorting; }); useSelector(table.store);",
			errors: [
				sliceSuggestion({
					table: 'table',
					slice: 'sorting',
					output: "import { useSelector } from '@tanstack/react-store'; useSelector(table.atoms.sorting, function (s) { return s; }); useSelector(table.store);",
				}),
				storeError('table'),
			],
		},
		// `useSelector` compares with `===` by default, so a fresh literal of several slices re-renders on every change.
		{
			code: "import { useSelector } from '@tanstack/react-store'; useSelector(table.store, s => [s.rowSelection, s.sorting]); useSelector(table.store, function ({ pagination, sorting }) { return { pagination, sorting } as Selected; });",
			errors: [{ messageId: 'shallowCompare' }, { messageId: 'shallowCompare' }],
		},
		// Typed parameters, a table that is no plain reference, and a comment leave only the report.
		{
			code: "import { useSelector } from '@tanstack/react-store'; useSelector(table.store, (s: State) => s.sorting); useSelector(table.store, ({ sorting }: State) => sorting); useSelector(useTable(options).store, s => s.sorting); useSelector(table.store, s => s./* now */sorting);",
			errors: [
				sliceError('table', 'sorting'),
				sliceError('table', 'sorting'),
				sliceError('useTable(options)', 'sorting'),
				sliceError('table', 'sorting'),
			],
		},
		{
			code: 'const a = <table.Subscribe />; const b = <props.table.Subscribe>{() => null}</props.table.Subscribe>;',
			...TSX,
			errors: [
				{ messageId: 'wholeStore', data: { name: 'table.Subscribe', table: 'table' } },
				{
					messageId: 'wholeStore',
					data: { name: 'props.table.Subscribe', table: 'props.table' },
				},
			],
		},
		// A `Subscribe` or `useSelector` of another library, and a store source without a selector, are raw store uses.
		{
			code: `import { Subscribe } from 'unstated'; import useSelector from 'use-selector';
const a = <Subscribe source={table.store} selector={s => [s.rowSelection, s.sorting]} />;
const b = <table.Subscribe source={table.store} />;
useSelector(table.store, s => s.sorting);`,
			...TSX,
			errors: Array.from({ length: 3 }, () => storeError('table')),
		},
	],
});

UNTYPED_RULE_TESTER.run('prefer-table-atoms', RULE, {
	valid: [
		'const t = useTable(options); function f(t) { return t.store.get(); }',
		{ code: 'const x = <table.Subscribe source={table.atoms.rowSelection} />;', ...JSX },
	],
	invalid: [
		{
			code: 'const { pagination } = table.store.get();',
			errors: [
				atomsSuggestion({
					table: 'table',
					slices: '`pagination`',
					output: 'const pagination = table.atoms.pagination.get();',
				}),
			],
		},
		{
			code: 'const x = <table.Subscribe selector={s => s.rowSelection} />;',
			...JSX,
			errors: [
				sliceSuggestion({
					table: 'table',
					slice: 'rowSelection',
					output: 'const x = <table.Subscribe source={table.atoms.rowSelection} selector={s => s} />;',
				}),
			],
		},
	],
});

SVELTE_RULE_TESTER.run('prefer-table-atoms', RULE, {
	valid: [
		// The `each` binding `grid` shadows the table `grid`.
		{
			code: '<script lang="ts">\n\tconst grid = createTable(options);\n</script>\n\n{#each grids as grid}{grid.store.get()}{/each}',
			filename: SVELTE,
		},
	],
	invalid: [
		{
			code: '<script lang="ts">\n\tconst grid = createTable(options);\n\tconst sorting = $derived(grid.store.get().sorting);\n</script>',
			filename: SVELTE,
			errors: [
				atomsSuggestion({
					table: 'grid',
					slices: '`sorting`',
					output: '<script lang="ts">\n\tconst grid = createTable(options);\n\tconst sorting = $derived(grid.atoms.sorting.get());\n</script>',
				}),
			],
		},
		{
			code: '<script lang="ts">\n\timport { useSelector } from \'@tanstack/svelte-store\';\n\tconst grid = createTable(options);\n\tconst sorting = useSelector(grid.store, s => s.sorting);\n</script>\n\n<pre>{JSON.stringify(grid.store.get())}</pre>',
			filename: SVELTE,
			errors: [{ messageId: 'svelteSelector', data: { table: 'grid' } }, storeError('grid')],
		},
	],
});

function storeError(table: string) {
	return { messageId: 'store', data: { table }, suggestions: [] };
}

function atomsSuggestion({ table, slices, output }: AtomsSuggestion) {
	return {
		messageId: 'store',
		data: { table },
		suggestions: [{ messageId: 'readAtoms', data: { table, slices }, output }],
	};
}

function sliceError(table: string, slice: string) {
	return { messageId: 'singleSlice', data: { table, slice }, suggestions: [] };
}

function sliceSuggestion({ table, slice, output }: SliceSuggestion) {
	return {
		messageId: 'singleSlice',
		data: { table, slice },
		suggestions: [{ messageId: 'subscribeAtom', data: { table, slice }, output }],
	};
}
