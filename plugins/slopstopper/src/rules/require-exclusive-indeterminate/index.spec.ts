import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { REQUIRE_EXCLUSIVE_INDETERMINATE } from './index.ts';

const TSX = { languageOptions: { parserOptions: { lang: 'tsx' } } } as const;

OXLINT_RULE_TESTER.run('require-exclusive-indeterminate', REQUIRE_EXCLUSIVE_INDETERMINATE, {
	valid: [
		// The full selection is excluded, and a partial selection check on another attribute sets no indeterminate state.
		{
			code: 'const box = <Checkbox indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} checked={table.getIsSomeRowsSelected()} />;',
			...TSX,
		},
		// The exclusion may come first or sit in a further `&&`, another property sets no indeterminate state, and the
		// condition of a conditional is not its value.
		'const props = { indeterminate: !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected(), checked: table.getIsSomeRowsSelected() && (ready() && !table.getIsAllRowsSelected()), selected: table.getIsSomeRowsSelected(), partial: table.getIsSomeRowsSelected() ? a : b };',
	],
	invalid: [
		{
			code: 'const box = <Checkbox indeterminate={table.getIsSomeRowsSelected()} />;',
			...TSX,
			errors: [
				inclusive(
					'table.getIsSomeRowsSelected()',
					'const box = <Checkbox indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} />;',
				),
			],
		},
		// No operand excludes the full selection of the same receiver: another receiver, the other full selection, a negated
		// flag, and another unary operator.
		{
			code: 'const props = { indeterminate: table.getIsSomePageRowsSelected() && !other.getIsAllPageRowsSelected() && !table.getIsAllRowsSelected() && !loading && typeof hint };',
			errors: [
				inclusive(
					'table.getIsSomePageRowsSelected()',
					'const props = { indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected() && !other.getIsAllPageRowsSelected() && !table.getIsAllRowsSelected() && !loading && typeof hint };',
				),
			],
		},
		// `??` needs parentheses around the rewrite.
		{
			code: "const props = { 'indeterminate': table?.getIsSomeRowsSelected() ?? false };",
			errors: [
				inclusive(
					'table?.getIsSomeRowsSelected()',
					"const props = { 'indeterminate': (table?.getIsSomeRowsSelected() && !table?.getIsAllRowsSelected()) ?? false };",
				),
			],
		},
		// The value flows through a conditional branch and an arrow body.
		{
			code: 'const props = { indeterminate: () => (ready ? table.getIsSomeRowsSelected() : false) };',
			errors: [
				inclusive(
					'table.getIsSomeRowsSelected()',
					'const props = { indeterminate: () => (ready ? table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected() : false) };',
				),
			],
		},
	],
});

UNTYPED_RULE_TESTER.run(
	'require-exclusive-indeterminate',
	eslintRule(REQUIRE_EXCLUSIVE_INDETERMINATE),
	{
		valid: [],
		invalid: [
			{
				code: 'const box = <Checkbox indeterminate={table.getIsSomeRowsSelected()} />;',
				filename: 'Table.tsx',
				errors: [
					inclusive(
						'table.getIsSomeRowsSelected()',
						'const box = <Checkbox indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} />;',
					),
				],
			},
		],
	},
);

SVELTE_RULE_TESTER.run(
	'require-exclusive-indeterminate',
	eslintRule(REQUIRE_EXCLUSIVE_INDETERMINATE),
	{
		valid: [],
		invalid: [
			// An attribute and the getter of a function binding.
			{
				code: '<input type="checkbox" indeterminate={table.getIsSomeRowsSelected()} /><input type="checkbox" bind:indeterminate={() => table.getIsSomePageRowsSelected(), next => {}} />',
				filename: 'Table.svelte',
				errors: [
					inclusive(
						'table.getIsSomeRowsSelected()',
						'<input type="checkbox" indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} /><input type="checkbox" bind:indeterminate={() => table.getIsSomePageRowsSelected(), next => {}} />',
					),
					inclusive(
						'table.getIsSomePageRowsSelected()',
						'<input type="checkbox" indeterminate={table.getIsSomeRowsSelected()} /><input type="checkbox" bind:indeterminate={() => table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(), next => {}} />',
					),
				],
			},
		],
	},
);

/** A report of a partial selection check, whose exclusion is the matching full selection check on the same receiver. */
function inclusive(call: string, output: string) {
	const exclusion = call.replace('getIsSome', 'getIsAll');
	return {
		messageId: 'inclusive',
		data: { call, exclusion },
		suggestions: [{ messageId: 'exclude', data: { exclusion }, output }],
	};
}
