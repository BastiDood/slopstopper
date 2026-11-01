import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_TYPEOF_UNDEFINED } from './index.ts';

OXLINT_RULE_TESTER.run('prefer-typeof-undefined', PREFER_TYPEOF_UNDEFINED, {
	valid: [
		// A local binding named `undefined` is not the global.
		'function f(undefined: number, x: number) { return x === undefined; }',
		// `eqeqeq` owns loose equality, which also matches `null`.
		'const v = x == undefined;',
		// The comparison already uses `typeof`.
		"const v = typeof x === 'undefined';",
		// A `typeof` compared with `undefined` is always unequal, and prefixing another `typeof` would not fix it.
		'const v = typeof x === undefined;',
		'const v = undefined === typeof x;',
		// `void` of a call is no `undefined` constant.
		'const v = x === void f();',
	],
	invalid: [
		{
			code: 'const v = x !== undefined;',
			output: "const v = typeof x !== 'undefined';",
			errors: on('!=='),
		},
		// `typeof` moves to the left of reversed operands.
		{
			code: 'const v = undefined === x;',
			output: "const v = typeof x === 'undefined';",
			errors: on('==='),
		},
		{
			code: 'const v = x === void 0;',
			output: "const v = typeof x === 'undefined';",
			errors: on('==='),
		},
		// An operand that binds looser than `typeof` gets parentheses.
		{
			code: 'const v = (a ?? b) === undefined;',
			output: "const v = typeof (a ?? b) === 'undefined';",
			errors: on('==='),
		},
		// A comment outside the kept operand blocks the fix.
		{
			code: 'const v = x === /* absent */ undefined;',
			output: null,
			errors: on('==='),
		},
	],
});

function on(operator: string) {
	return [{ messageId: 'preferTypeofUndefined', data: { operator } }];
}
