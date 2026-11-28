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
		// An exported table above its limit stays for other modules, which can depend on the array itself.
		{
			code: "export const A = ['a', 'b', 'c']; const f = (x: string) => A.includes(x);",
			options: [{ membership: 2 }],
		},
		// An exported array that is no case table gets no `Set` either.
		'export const A = list.map(f); const g = (x: string) => A.includes(x);',
		// A local `Object` shadows the global, so its `hasOwn` is no membership test.
		'function f(Object: { hasOwn(o: unknown, k: string): boolean }) { const T = { a: 1, b: 2 }; return Object.hasOwn(T, k); }',
		// A write in this file shows that an exported table is no constant.
		'export const T = { a: 1, b: 2 }; export function set(k: string, v: number) { T[k] = v; } export const get = (k: string) => T[k];',
		"export const S = new Set(['a', 'b']); S.add(k); export const has = (x: string) => S.has(x);",
		"export const M = new Map([['a', 1], ['b', 2]]); M.delete(k); export const get = (x: string) => M.get(x);",
		"export const A = ['a', 'b']; A.push('c'); export const has = (x: string) => A.includes(x);",
		// A literal key, written as a template, a negated number, a boolean, or `null`, reads one known entry.
		"const T = { true: 'y', null: 'z' }; const v = T[true] + T[null] + T[k];",
		'const T = { a: 1, b: 2 }; const v = T[`a`] + T[k];',
		'const T = { a: 1, b: 2 }; const v = T[-1] + T[k];',
		// An inline table that is passed on, or that is no receiver of the lookup, is no lookup table.
		'f({ a: 1, b: 2 });',
		'const v = Object.hasOwn(k, { a: 1, b: 2 });',
		// A value that builds a new object on every evaluation does not fit a `case`.
		'const T = { a: { v: 1 }, b: 2 }; const v = T[k];',
		// A static read uses the table as a namespace of constants.
		"const K = { A: 'a', B: 'b' }; const v = K.A + K[k];",
		// A write changes the table, also as a destructuring or loop target.
		'const T = { a: 1, b: 2 }; T[k] = 3;',
		'const T = { a: 1, b: 2 }; [T[x], T[y]] = [T[y], T[x]];',
		'const T = { a: 1, b: 2 }; ({ v: T[x] } = o);',
		'const T = { a: 1, b: 2 }; for (T[x] of xs);',
		"const A = ['a', 'b']; [A.length] = [0];",
		// A handler table whose value is a `const` that holds no function cannot dispatch.
		"const LABEL = 'a'; function b() {} const H = { a: LABEL, b }; H[k]();",
		// Updates and `delete` write the table.
		'const T = { a: 1, b: 2 }; T[k]++;',
		'const T = { a: 1, b: 2 }; delete T[k];',
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
		// A table without entries has no case for a `switch`.
		'const A: string[] = []; const v = A.includes(x);',
		'const M = new Map<string, number>([]); const v = M.get(k);',
		// A called handler that is also read as a value is no dispatch.
		'const H = { a: () => 1, b: () => 2 }; log(H[k]); H[k]();',
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
		// The array argument of a `Set` or `Map` can carry `as const`, and `Object.hasOwn` can sit behind an assertion.
		{
			code: "const S = new Set(['a', 'b'] as const); const v = S.has(x);",
			errors: table('switchMembership', '`Set`', 2),
		},
		{
			code: 'const T = { a: 1, b: 2 }; const v = (Object as ObjectConstructor).hasOwn(T, k);',
			errors: table('switchMembership', 'object', 2),
		},
		{
			code: "const M = new Map([['a', 1], ['b', 2]] as const); const v = M.get(k);",
			errors: table('switchValues', '`Map`', 2),
		},
		{
			code: "const v = new Set(['a', 'b'] satisfies string[]).has(x);",
			errors: table('switchMembership', '`Set`', 2),
		},
		// Inline `Set`, `Map`, and object tables.
		{
			code: "const v = new Set(['a', 'b']).has(x);",
			errors: table('switchMembership', '`Set`', 2),
		},
		{
			code: "const t = new Map([['a', 1], ['b', 2]]).get(k);",
			errors: table('switchValues', '`Map`', 2),
		},
		{
			code: 'const v = ({ a: 1, b: 2 })[k];',
			errors: table('switchValues', 'object', 2),
		},
		{
			code: 'const v = Object.hasOwn({ a: 1, b: 2 }, k);',
			errors: table('switchMembership', 'object', 2),
		},
		{
			code: 'const v = k in { a: 1, b: 2 };',
			errors: table('switchMembership', 'object', 2),
		},
		// A type query of a member reads no entry.
		{
			code: 'const T = { a: 1, b: 2 }; type A = typeof T.a; const v = T[k];',
			errors: table('switchValues', 'object', 2),
		},
		// A type parameter named `Set` names no value, so the global still builds the rewrite.
		{
			code: 'function f<Set>() { const A = [a, b]; return (x: string) => A.includes(x); }',
			output: 'function f<Set>() { const A = new Set([a, b]); return (x: string) => A.has(x); }',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// A found value that is exported can be called or read elsewhere, so it is a value read.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; export const h = H[k]; h();',
			errors: table('switchValues', 'object', 2),
		},
		// An exported table stays for other modules, so each lookup of it in this file is reported instead.
		{
			code: "export const CLASSES = ['x', 'y', 'z'] as const; export type C = (typeof CLASSES)[number]; const rank = (c: C) => CLASSES.indexOf(c);",
			errors: exported('CLASSES', 3, 'that returns each value'),
		},
		// Iteration in this file does not keep the lookups of an exported table from being reported.
		{
			code: "export const A = ['a', 'b']; for (const a of A) f(a); const g = (x: string) => A.includes(x);",
			errors: exported('A', 2, 'whose fall-through cases return `true`'),
		},
		// The membership test beside a value read is part of the same `switch`, so only the value read is reported.
		{
			code: "export const M = new Map([['a', 1], ['b', 2]]); const v = M.has(k) ? M.get(k) : 0;",
			errors: [
				{
					messageId: 'switchExportedLookup',
					data: { name: 'M', count: 2, how: 'that returns each value' },
					column: 69,
				},
			],
		},
		// The guard of a dispatch call is part of the call's `switch`, so only the call is reported.
		{
			code: 'export const H = { a: () => 1, b: () => 2 }; if (k in H) H[k]();',
			errors: [
				{
					messageId: 'switchExportedLookup',
					data: { name: 'H', count: 2, how: 'whose cases call each handler' },
					column: 57,
				},
			],
		},
		// An inline array above the limit has no binding to rewrite.
		{
			code: "const v = ['a', 'b', 'c'].includes(x);",
			options: [{ membership: 2 }],
			errors: [{ messageId: 'hoistSet', data: { count: 3, limit: 2 } }],
		},
		// A table with exactly as many entries as the limit is still reported.
		{
			code: 'const T = { a: 1, b: 2 }; const v = T[k];',
			options: [{ values: 2 }],
			errors: table('switchValues', 'object', 2),
		},
		// Comparing `indexOf` with `0` or a positive bound reads the position, not membership.
		{
			code: "const A = ['a', 'b']; const first = (x: string) => A.indexOf(x) === 0;",
			errors: table('switchValues', 'array', 2),
		},
		{
			code: "const A = ['a', 'b']; const later = (x: string) => A.indexOf(x) > 0;",
			errors: table('switchValues', 'array', 2),
		},
		// Membership bounds count on either side of the comparison.
		{
			code: "const A = ['a', 'b']; const has = (x: string) => -1 < A.indexOf(x) && 0 <= A.indexOf(x);",
			errors: table('switchMembership', 'array', 2),
		},
		// A found handler that is only tested before it is called still dispatches.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; H[k] && H[k]();',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: 'const H = { a: () => 1, b: () => 2 }; function f(k: string) { const h = H[k]; if (!h) throw new Error(k); h(); }',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: "const H = new Map([['a', () => 1]]); const h = H.get(k); if (typeof h === 'function') h();",
			errors: table('switchDispatch', '`Map`', 1),
		},
		// An alias or a wrapper call can hold a function, so it counts as a handler.
		{
			code: 'function f1() {} function f2() {} const g1 = f1; const g2 = memoize(f2); const H = { a: g1, b: g2 }; H[k]();',
			errors: table('switchDispatch', 'object', 2),
		},
		// A comparison with `undefined` and a conditional test guard a dispatch call too.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; const h = H[k]; if (h === undefined) throw new Error(k); h();',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: 'const H = { a: () => 1, b: () => 2 }; const r = H[k] ? H[k]() : 0;',
			errors: table('switchDispatch', 'object', 2),
		},
		// `split`, `splice`, and `toArray` return arrays, but their receivers are unknown, so the rewrite is a suggestion.
		{
			code: "const A = s.split(','); const f = (x: string) => A.includes(x);",
			errors: [
				{
					messageId: 'preferSet',
					data: { name: 'A' },
					suggestions: [
						{
							messageId: 'suggestSet',
							data: { name: 'A' },
							output: "const A = new Set(s.split(',')); const f = (x: string) => A.has(x);",
						},
					],
				},
			],
		},
		// A type-only `Set` names no value, so the global still builds the rewrite.
		{
			code: "import type { Set } from 'immutable'; const A = [a, b]; const g = (x: string) => A.includes(x);",
			output: "import type { Set } from 'immutable'; const A = new Set([a, b]); const g = (x: string) => A.has(x);",
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// Imported and undeclared handlers can be functions, so their table dispatches.
		{
			code: "import { create, remove } from './handlers'; const HANDLERS = { create, remove }; HANDLERS[action](payload);",
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: 'const H = { a: api.create, b: api.remove }; H[k]?.(payload);',
			errors: table('switchDispatch', 'object', 2),
		},
		// More guards of a dispatch call: a nullish comparison, a bare test, and a `has` test.
		{
			code: 'const H = { a: () => 1, b: () => 2 }; const h = H[k]; if (h != null) h();',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: 'const H = { a: () => 1, b: () => 2 }; if (H[k]) H[k]();',
			errors: table('switchDispatch', 'object', 2),
		},
		{
			code: "const H = new Map([['a', () => 1], ['b', () => 2]]); if (H.has(k)) H.get(k)();",
			errors: table('switchDispatch', '`Map`', 2),
		},
		{
			code: "const S = new Map([['a', 1], ['b', 2]]); const v = S.has(k);",
			errors: table('switchMembership', '`Map`', 2),
		},
		// The membership bounds of `indexOf` with the call on the left.
		{
			code: "const A = ['a', 'b']; const f = (x: string) => A.indexOf(x) > -1 || A.indexOf(x) <= -1 || A.indexOf(x) >= 0 || A.indexOf(x) < 0;",
			errors: table('switchMembership', 'array', 2),
		},
		// A local or imported `Set` would replace the global in the rewrite, so there is none.
		{
			code: "import { Set } from 'immutable'; const A = [a, b]; const g = (x: string) => A.includes(x);",
			output: null,
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// An array above the limit that is also searched with `indexOf` still becomes a `Set`, without a rewrite.
		{
			code: "const A = ['a', 'b', 'c']; const f = (x: string) => A.includes(x) || A.indexOf(x) !== -1;",
			options: [{ membership: 2 }],
			output: null,
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// `new Array`, `Array.of`, and new-array methods such as `flat` and `with` on a known array build arrays of their own.
		{
			code: 'const A = new Array(a, b); const g = (x: string) => A.includes(x);',
			output: 'const A = new Set(new Array(a, b)); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		{
			code: 'const A = Array.of(a, b); const g = (x: string) => A.includes(x);',
			output: 'const A = new Set(Array.of(a, b)); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		{
			code: 'const A = [[a], [b]].flat().with(0, c); const g = (x: string) => A.includes(x);',
			output: 'const A = new Set([[a], [b]].flat().with(0, c)); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// A tested value of a table that holds no functions is a value read.
		{
			code: 'const T = { a: 1, b: 0 }; if (T[k]) f();',
			errors: table('switchValues', 'object', 2),
		},
		// A computed `.includes` key keeps its quotes in the rewrite.
		{
			code: "const A = [a, b]; const g = (x: string) => A['includes'](x);",
			output: "const A = new Set([a, b]); const g = (x: string) => A['has'](x);",
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// `Array.from` builds an array that no other name holds.
		{
			code: 'const A = Array.from(list); const g = (x: string) => A.includes(x);',
			output: 'const A = new Set(Array.from(list)); const g = (x: string) => A.has(x);',
			errors: [{ messageId: 'preferSet', data: { name: 'A' } }],
		},
		// Another name can still change an aliased array or the receiver of `sort`, so the rewrite is a suggestion.
		{
			code: 'const ITEMS = [a, b]; const add = (s: string) => ITEMS.push(s); const KNOWN = ITEMS; const isKnown = (s: string) => KNOWN.includes(s);',
			errors: [
				{
					messageId: 'preferSet',
					data: { name: 'KNOWN' },
					suggestions: [
						{
							messageId: 'suggestSet',
							data: { name: 'KNOWN' },
							output: 'const ITEMS = [a, b]; const add = (s: string) => ITEMS.push(s); const KNOWN = new Set(ITEMS); const isKnown = (s: string) => KNOWN.has(s);',
						},
					],
				},
			],
		},
		{
			code: 'const ORDERED = items.sort(); const g = (x: string) => ORDERED.includes(x);',
			errors: [
				{
					messageId: 'preferSet',
					data: { name: 'ORDERED' },
					suggestions: [
						{
							messageId: 'suggestSet',
							data: { name: 'ORDERED' },
							output: 'const ORDERED = new Set(items.sort()); const g = (x: string) => ORDERED.has(x);',
						},
					],
				},
			],
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

function exported(name: string, count: number, how: string) {
	return [{ messageId: 'switchExportedLookup', data: { name, count, how } }];
}
