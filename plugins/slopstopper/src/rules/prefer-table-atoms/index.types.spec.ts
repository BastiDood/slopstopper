import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { PREFER_TABLE_ATOMS } from './index.ts';

/** A minimal stand-in for TanStack Table's `Table`, since the fixture project installs no TanStack package. */
const TABLE =
	'interface Atom<T> { get(): T } interface State { pagination: number } interface Grid { store: Atom<State>; atoms: { pagination: Atom<number> }; baseAtoms: { pagination: Atom<number> } } declare const grid: Grid; declare function current(): Grid;';

TYPED_RULE_TESTER.run('prefer-table-atoms', eslintRule(PREFER_TABLE_ATOMS), {
	valid: [
		// A `store` on a type without the `atoms` and `baseAtoms` of a table, or on `any`.
		'interface Atom<T> { get(): T } interface Shop { store: Atom<number> } declare const shop: Shop; shop.store.get();',
		'declare const loose: any; loose.store.get();',
		// A `Subscribe` on a type that is not a table.
		{
			code: 'interface Shop { Subscribe: unknown } declare const shop: Shop; <shop.Subscribe />;',
			filename: 'file.tsx',
		},
	],
	invalid: [
		// The type marks a table that its name does not.
		{
			code: `${TABLE} grid.store.get().pagination; current().store.get();`,
			errors: [
				{
					messageId: 'store',
					data: { table: 'grid' },
					suggestions: [
						{
							messageId: 'readAtoms',
							output: `${TABLE} grid.atoms.pagination.get(); current().store.get();`,
						},
					],
				},
				{ messageId: 'store', data: { table: 'current()' }, suggestions: [] },
			],
		},
		// The type marks a JSX table object that its name does not.
		{
			code: `${TABLE} <grid.Subscribe />;`,
			filename: 'file.tsx',
			errors: [{ messageId: 'wholeStore', data: { name: 'grid.Subscribe', table: 'grid' } }],
		},
	],
});
