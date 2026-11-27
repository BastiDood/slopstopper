import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { PREFER_SWITCH_LOOKUP } from './index.ts';

TYPED_RULE_TESTER.run('prefer-switch-lookup', eslintRule(PREFER_SWITCH_LOOKUP), {
	valid: [
		// A union comparand names no single case, ...
		'declare const x: string; declare const A: "a"; declare const U: "a" | "b"; const v = x === A || x === U;',
		// ... and neither does an `any` comparand.
		'declare const x: string; declare const A: "a"; declare const N: any; const v = x === N || x === A;',
	],
	invalid: [
		// Declared constants have no initializer, but their literal types name cases.
		{
			code: 'declare const x: unknown; declare const A: "a"; declare const T: true; const v = x === A || x === T;',
			errors: [{ messageId: 'switchChain', data: { discriminant: 'x', count: 2 } }],
		},
		// The same comparands name the keys of a table.
		{
			code: 'declare const A: "a"; declare const B: "b"; const T = [A, B]; const f = (x: "a" | "b") => T.includes(x);',
			errors: [{ messageId: 'switchMembership', data: { table: 'array', count: 2 } }],
		},
	],
});
