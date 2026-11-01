import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_EQUALITY_CHAIN } from './index.ts';

TYPED_RULE_TESTER.run('no-equality-chain', eslintRule(NO_EQUALITY_CHAIN), {
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
			errors: [{ messageId: 'equalityChain', data: { discriminant: 'x', count: 2 } }],
		},
	],
});
