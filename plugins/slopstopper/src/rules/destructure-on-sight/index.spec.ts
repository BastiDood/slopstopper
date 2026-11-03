import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { DESTRUCTURE_ON_SIGHT } from './index.ts';

OXLINT_RULE_TESTER.run('destructure-on-sight', DESTRUCTURE_ON_SIGHT, {
	valid: [
		// A whole use: a method call that needs `this`, a member write, and an optional or computed read.
		'function f(x) { return x.m(); }',
		'function f(x) { x.a = 1; return x.b; }',
		'function f(x) { return x?.a; }',
		'function f(x, k) { return x[k]; }',
		// A read from a nested function would capture a snapshot.
		'function f(x) { return () => x.a; }',
		// Reassigned, `let`, exported, and already destructured bindings.
		'function f(x) { x = g(); return x.a; }',
		'let x = g(); h(x.a);',
		'export const x = g(); h(x.a);',
		'function f({ a }) { return a; }',
		// Without type information, a narrowing read stands for a union that destructuring would not type-check.
		"function f(x) { return x.type === 'a' ? x.b : 0; }",
	],
	invalid: [
		// Properties keep the order of their first read; the type annotation and the default stay.
		{
			code: 'function f(x: T = d) { return x.b + x.a + x.b; }',
			errors: [error('{ b, a }', 'function f({ b, a }: T = d) { return b + a + b; }')],
		},
		{
			code: 'const x = g(); h(x.a);',
			errors: [error('{ a }', 'const { a } = g(); h(a);')],
		},
		// A lone `length` keeps the binding's name.
		{
			code: 'const t = s.trim(); f(t.length);',
			errors: [
				{
					messageId: 'destructure',
					data: { name: 't' },
					suggestions: [
						{
							messageId: 'destructureInto',
							data: { name: 't', pattern: '{ length: tLength }' },
							output: 'const { length: tLength } = s.trim(); f(tLength);',
						},
					],
				},
			],
		},
		// Parameters that read only the same property are reported together and keep their names.
		{
			code: 'const c = (left, right) => left.position - right.position;',
			errors: [
				{
					messageId: 'destructureParameters',
					data: { property: 'position', names: 'left`, `right' },
					suggestions: [
						{
							messageId: 'destructureParametersInto',
							output: 'const c = ({ position: left }, { position: right }) => left - right;',
						},
					],
				},
			],
		},
		// A bare arrow parameter gets parentheses.
		{
			code: 'const f = x => x.a;',
			errors: [error('{ a }', 'const f = ({ a }) => a;')],
		},
		// A clash with another binding, a reserved word, or a `'use strict'` body leaves only the report.
		{
			code: 'function f(x, a) { return x.a + a; }',
			errors: [{ messageId: 'destructure', suggestions: [] }],
		},
		{
			code: 'function f(x) { return x.default; }',
			errors: [{ messageId: 'destructure', suggestions: [] }],
		},
		{
			code: 'function f(x) { "use strict"; return x.a; }',
			errors: [{ messageId: 'destructure', suggestions: [] }],
		},
	],
});

UNTYPED_RULE_TESTER.run('destructure-on-sight', eslintRule(DESTRUCTURE_ON_SIGHT), {
	valid: [],
	invalid: [
		{
			code: 'function f(x: T) { return x.a; }',
			errors: [error('{ a }', 'function f({ a }: T) { return a; }')],
		},
	],
});

function error(pattern: string, output: string) {
	return {
		messageId: 'destructure',
		data: { name: 'x' },
		suggestions: [{ messageId: 'destructureInto', data: { name: 'x', pattern }, output }],
	};
}
