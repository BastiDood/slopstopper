import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_EQUALITY_CHAIN } from './index.ts';

OXLINT_RULE_TESTER.run('no-equality-chain', NO_EQUALITY_CHAIN, {
	valid: [
		// Only `===` counts.
		'const v = x == 1 || x == 2;',
		// Comparisons against `null`, `undefined`, or other references guard or narrow values instead of naming cases.
		'const v = x === null || x === undefined || x === y;',
		// A `let` variable can change, so it names no case.
		"let a = 'a'; const v = x === a || x === 'b';",
		// A shared constant does not make the compared values one discriminant.
		"const A = 'a'; const v = x === A || y === A;",
		// A `const` object names no case through a property that it lacks, or through a nested member.
		"const K = { A: 'a' } as const; const v = x === K.B || x === K.C;",
		'const K = { A: { B: 1, C: 2 } } as const; const v = x === K.A.B || x === K.A.C;',
		// A member of a call result is no discriminant.
		'const v = f().b === 1 || f().b === 2;',
		// The negated form is left to `prefer-de-morgan`, which turns it into the positive form.
		'const v = x !== 1 && x !== 2;',
		// `prefer-switch` reports the `if` chain that this test belongs to.
		'function f() { if (x === 0) return; if (x === 1 || x === 2) return; }',
	],
	invalid: [
		// Negated numbers name cases like other literals.
		{ code: 'const v = x === -1 || x === -2;', errors: on('x', 2) },
		// Same-file `const` literals name cases.
		{ code: "const A = 'a'; const B = `b`; const v = x === A || x === B;", errors: on('x', 2) },
		// So do enum members, on either side of the comparison.
		{ code: 'enum E { A, B } const v = x === E.A || E.B === x;', errors: on('x', 2) },
		// So do literal properties of a `const` object, with static or literal keys.
		{
			code: "const K = { A: 'a', 'B': 1 } as const; const v = x === K.A || x === K['B'];",
			errors: on('x', 2),
		},
		// A run can start after an operand that does not fit, and the report covers only the run.
		{
			code: 'const v = x === 1 || y === 1 || y === 2;',
			errors: [
				{
					messageId: 'equalityChain',
					data: { discriminant: 'y', count: 2 },
					column: 21,
					endColumn: 39,
				},
			],
		},
		// One chain can hold several runs on different values.
		{
			code: 'const v = x === 1 || x === 2 || a || y === 1 || y === 2;',
			errors: [...on('x', 2), ...on('y', 2)],
		},
		// The test of an `if` that no `prefer-switch` chain claims.
		{
			code: 'if (y === 1) {} else if (y === 2) {} else if (x === 1 || x === 2) {}',
			errors: on('x', 2),
		},
	],
});

function on(discriminant: string, count: number) {
	return [{ messageId: 'equalityChain', data: { discriminant, count } }];
}
