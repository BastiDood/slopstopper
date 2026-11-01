import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_DE_MORGAN } from './index.ts';

OXLINT_RULE_TESTER.run('prefer-de-morgan', PREFER_DE_MORGAN, {
	valid: [
		// A guard against `null` and another reference is no equality chain, so the `!==` chain is left alone.
		'const v = x !== null && x !== y;',
		// The rewrite would not reduce the negations: `!(a || b || !c)` also has two.
		'if (!a && !b && c) {} else {}',
		// `??` has no De Morgan dual.
		'const v = !a ?? !b;',
		// Nothing removes the outer `!` of a guard without `else`, ...
		'if (!a && !b) {}',
		// ... of an `if` whose `else` continues the chain, ...
		'if (!a && !b) {} else if (c) {}',
		// ... of a value, ...
		'const v = !a && !b;',
		// ... or of a chain nested in another chain.
		'if ((!a || !b) && c) {} else {}',
		// `!==` comparisons against different values do not become one `===` run.
		'const v = x !== 1 && y !== 2;',
	],
	invalid: [
		// Constants that name cases count like literals.
		{
			code: 'enum E { A, B } const v = x !== E.A && x !== E.B;',
			output: 'enum E { A, B } const v = !(x === E.A || x === E.B);',
			errors: on(2, 1),
		},
		// The negated equality chain becomes the positive chain that `no-equality-chain` reports.
		{
			code: 'const v = x !== 1 && x !== 2;',
			output: 'const v = !(x === 1 || x === 2);',
			errors: on(2, 1),
		},
		// `!!x` loses one `!`, and `!=` flips to `==`.
		{
			code: 'const v = !!a && b != c ? 1 : 2;',
			output: 'const v = !(!a || b == c) ? 1 : 2;',
			errors: on(2, 1),
		},
		// Nested chains with the same operator form one chain, keeping their parentheses and comments.
		{
			code: 'const v = (!a && !b) /* keep */ && !c ? 1 : 2;',
			output: 'const v = !((a || b) /* keep */ || c) ? 1 : 2;',
			errors: on(3, 1),
		},
		// A positive identifier gets a `!`, and a positive `===` flips to `!==`.
		{
			code: 'if (!a || !b || !c || !d || e || x === 1) {} else {}',
			output: 'if (!(a && b && c && d && !e && x !== 1)) {} else {}',
			errors: on(4, 3),
		},
		// A positive `==` flips to `!=`.
		{
			code: 'if (!a || !b || !c || x == 1) {} else {}',
			output: 'if (!(a && b && c && x != 1)) {} else {}',
			errors: on(3, 2),
		},
		// A positive operand that binds looser than `!` gets parentheses, and a parenthesized one gets its `!` outside them.
		{
			code: 'if (!a && !b && !c && !d && x < 1 && (e as boolean)) {} else {}',
			output: 'if (!(a || b || c || d || !(x < 1) || !(e as boolean))) {} else {}',
			errors: on(4, 3),
		},
	],
});

function on(before: number, after: number) {
	return [{ messageId: 'preferDeMorgan', data: { before, after } }];
}
