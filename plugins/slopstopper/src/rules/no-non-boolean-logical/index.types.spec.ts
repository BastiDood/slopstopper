import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_NON_BOOLEAN_LOGICAL } from './index.ts';

TYPED_RULE_TESTER.run('no-non-boolean-logical', eslintRule(NO_NON_BOOLEAN_LOGICAL), {
	valid: [
		'declare const a: boolean; declare const b: boolean; const ok = a && b;',
		'declare const a: boolean; declare function isReady(): true; const ok = a || isReady();',
		// `never` and `any` are assignable to `boolean`. A throwing call leaves the boolean as the value.
		'declare const a: boolean; declare function fail(): never; const ok = a || fail();',
		'declare const a: boolean; declare const loose: any; const ok = a && loose;',
		// A truthiness read is left to `typescript/strict-boolean-expressions`.
		'declare const a: boolean; declare const items: { name: string }[]; const named = items.filter(item => a && item.name);',
	],
	invalid: [
		{
			code: 'declare const a: boolean; declare const label: string; const shown = a && label;',
			errors: [and('a && label', 'label')],
		},
		{
			code: 'declare const a: boolean; declare const maybe: boolean | undefined; const ok = a && maybe;',
			errors: [and('a && maybe', 'maybe')],
		},
		// An `&&` or `||` operand is reported on its own.
		{
			code: 'declare const a: boolean; const extra = a || (a && { v: 1 });',
			errors: [and('a && { v: 1 }', '{ v: 1 }')],
		},
		// A concise arrow body returns its value.
		{
			code: 'declare const open: boolean; declare function close(): void; const onClick = () => open && close();',
			errors: [and('open && close()', 'close()')],
		},
		// A logical assignment operand is reported on its own.
		{
			code: 'declare const a: boolean; declare const box: { items?: string[] }; const items = a || (box.items ||= []);',
			errors: [orAssign('box.items ||= []', '[]')],
		},
		// A `.filter` method of no array is no predicate that the type checker reads.
		{
			code: 'declare const a: boolean; declare const query: { filter(callback: () => string): void }; query.filter(() => a && "x");',
			errors: [and('a && "x"', '"x"')],
		},
	],
});

function and(expression: string, operand: string) {
	return { messageId: 'nonBooleanAnd', data: { expression, operand, operator: '&&' } };
}

function orAssign(expression: string, operand: string) {
	return {
		messageId: 'nonBooleanOr',
		data: { expression, operand, operator: '||=', nullish: '??=' },
	};
}
