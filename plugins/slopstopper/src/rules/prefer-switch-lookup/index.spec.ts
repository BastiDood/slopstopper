import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_SWITCH_LOOKUP } from './index.ts';

OXLINT_RULE_TESTER.run('prefer-switch-lookup', PREFER_SWITCH_LOOKUP, {
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
					messageId: 'switchChain',
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
		// A chain longer than the `membership` limit becomes a `Set`.
		{
			code: 'const v = x === 1 || x === 2 || x === 3;',
			options: [{ membership: 2 }],
			errors: [{ messageId: 'setChain', data: { discriminant: 'x', count: 3, limit: 2 } }],
		},
	],
});

OXLINT_RULE_TESTER.run('prefer-switch-lookup tables', PREFER_SWITCH_LOOKUP, {
	valid: [
		// Iterating a table needs its entries, which a `switch` does not hold.
		"const A = ['a', 'b']; for (const a of A) f(a);",
		// An exported table has reads in other modules.
		"export const A = ['a', 'b']; const f = (x: string) => A.includes(x);",
		// A value that builds a new object on every evaluation does not fit a `case`.
		'const T = { a: { v: 1 }, b: 2 }; const v = T[k];',
		// A static read uses the table as a namespace of constants.
		"const K = { A: 'a', B: 'b' }; const v = K.A + K[k];",
		// A write changes the table.
		'const T = { a: 1, b: 2 }; T[k] = 3;',
		// Passing the table on hands its entries to unknown code.
		"const M = new Map([['a', 1]]); g(M);",
		// A local class named `Set` is no keyed collection.
		"class Set { constructor(_: unknown) {} has(_: unknown) { return true; } } const S = new Set(['a']); const v = S.has(x);",
		// A computed array searched once, outside any function or loop, runs once.
		'const A = list.map(f); const v = A.includes(x);',
		// A called value from a table that holds a non-function is no dispatch.
		'function a() {} const H = { a, b: 1 }; H[k]();',
		// Reading only the size finds no entry.
		"const A = ['a', 'b']; const n = A.length;",
		// A `Set` or `Map` above its limit is left alone.
		{
			code: "const S = new Set(['a', 'b', 'c']); const v = S.has(x);",
			options: [{ membership: 2 }],
		},
		{ code: 'const T = { a: 1, b: 2 }; const v = T[k];', options: [{ values: 1 }] },
		{
			code: 'function a() {} function b() {} const H = { a, b }; H[k]();',
			options: [{ dispatch: 1 }],
		},
	],
	invalid: [
		// An inline array tested for membership.
		{
			code: "const v = ['a', 'b'].includes(x);",
			errors: table('switchMembership', 'array', 2),
		},
		// A bound array searched in a function, with `as const`.
		{
			code: "const A = ['a', 'b'] as const; const f = (x: 'a' | 'b') => A.includes(x);",
			errors: table('switchMembership', 'array', 2),
		},
		// An array that ranks a union through `indexOf` and also derives the union type.
		{
			code: "const CLASSES = ['x', 'y', 'z'] as const; type C = (typeof CLASSES)[number]; const rank = (c: C) => CLASSES.indexOf(c);",
			errors: table('switchValues', 'array', 3),
		},
		// `indexOf` compared with `-1` tests membership.
		{
			code: "const A = ['a', 'b']; const has = (x: string) => A.indexOf(x) !== -1;",
			errors: table('switchMembership', 'array', 2),
		},
		{
			code: "const S = new Set(['a', 'b']); const v = S.has(x);",
			errors: table('switchMembership', '`Set`', 2),
		},
		// A `Map` from file extensions to MIME types.
		{
			code: "const TYPES = new Map([['png', 'image/png'], ['txt', 'text/plain']]); const t = TYPES.get(ext);",
			errors: table('switchValues', '`Map`', 2),
		},
		{
			code: 'const T = { a: 1, b: 2 }; const v = T[k];',
			errors: table('switchValues', 'object', 2),
		},
		{
			code: 'const T = { a: 1, b: 2 }; const v = k in T;',
			errors: table('switchMembership', 'object', 2),
		},
		{
			code: 'const T = { a: 1, b: 2 }; const v = Object.hasOwn(T, k);',
			errors: table('switchMembership', 'object', 2),
		},
		// A table of declared handlers whose found handler is called.
		{
			code: 'function a() {} function b() {} const H = { a, b }; H[k]();',
			errors: table('switchDispatch', 'object', 2),
		},
		// An `in` test guards the call.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; if (k in H) H[k]();',
			errors: table('switchDispatch', 'object', 2),
		},
		// The found handler is called through a `const`.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; const h = H[k]; h();',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: "const H = new Map([['a', () => 1], ['b', () => 2]]); H.get(k)?.();",
			errors: table('switchDispatch', '`Map`', 2),
		},
		// An array above the `membership` limit becomes a `Set`, and every `.includes` becomes `.has`.
		{
			code: "const A = ['a', 'b', 'c']; const f = (x: string) => A.includes(x) || A.includes(x + 'x');",
			options: [{ membership: 2 }],
			output: "const A = new Set(['a', 'b', 'c']); const f = (x: string) => A.has(x) || A.has(x + 'x');",
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// An inline array above the limit has no binding to rewrite.
		{
			code: "const v = ['a', 'b', 'c'].includes(x);",
			options: [{ membership: 2 }],
			errors: [{ messageId: 'hoistSet', data: { count: 3, limit: 2 } }],
		},
		// An array of other values searched in a function becomes a `Set`, as does an array computed from a known array.
		{
			code: 'const A = [a, b]; const g = (x: string) => A.includes(x);',
			output: 'const A = new Set([a, b]); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		{
			code: 'const A = [a, b].map(f); const g = (x: string) => A.includes(x);',
			output: 'const A = new Set([a, b].map(f)); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// Only the method name says that `list.map(f)` builds an array, so the rewrite is a suggestion.
		{
			code: 'const A = list.map(f); const g = (x: string) => A.includes(x);',
			errors: [
				{
					messageId: 'preferSet',
					data: { name: 'A' },
					suggestions: [
						{
							messageId: 'suggestSet',
							data: { name: 'A' },
							output: 'const A = new Set(list.map(f)); const g = (x: string) => A.has(x);',
						},
					],
				},
			],
		},
		// A type annotation would no longer fit a `Set`, so there is no fix.
		{
			code: 'const A: string[] = list.map(f); for (const x of xs) A.includes(x);',
			output: null,
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
	],
});

function on(discriminant: string, count: number) {
	return [{ messageId: 'switchChain', data: { discriminant, count } }];
}

function table(messageId: string, kind: string, count: number) {
	return [{ messageId, data: { table: kind, count } }];
}
