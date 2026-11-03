import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_INFERRABLE_RETURN_TYPE } from './index.ts';

OXLINT_RULE_TESTER.run('no-inferrable-return-type', NO_INFERRABLE_RETURN_TYPE, {
	valid: [
		// `never` without any `return`.
		'function fail(): never { throw new Error(); }',
		// Two or more value-returning `return` statements.
		'function f(x: boolean): number | string { if (x) return 1; return "a"; }',
		// Recursion by function name.
		'function fact(n: number): number { return n <= 1 ? 1 : n * fact(n - 1); }',
		// Recursion by variable name.
		'const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));',
		// Recursion by `this.<method>`, including through arrow functions.
		'class A { #m(n: number): number { return n <= 0 ? 0 : this.#m(n - 1); } }',
		'class A { m(n: number): number { return [n].map((x) => this.m(x - 1))[0]; } }',
		'class A { m = (n: number): number => (n <= 0 ? 0 : this.m(n - 1)); }',
		'const o = { m(n: number): number { return n <= 0 ? 0 : this.m(n - 1); } };',
		// Static string-literal and computed keys match `this.<method>` and `this['<method>']` uniformly.
		"class A { ['m'](n: number): number { return n <= 0 ? 0 : this.m(n - 1); } }",
		// So do number literals, which name the same property as their string spelling.
		"class A { 1(n: number): number { return n <= 0 ? 0 : this['1'](n - 1); } }",
		// Type predicates belong to `no-type-predicates`.
		'function isString(x: unknown): x is string { return typeof x === "string"; }',
	],
	invalid: [
		// The suggestion removes the annotation with the whitespace before its colon.
		withData(invalid('function f() : number { return 1; }', 'function f() { return 1; }'), {
			annotation: ': number',
			function: '`f`',
		}),
		// Returns of nested functions do not count toward the outer function.
		invalid(
			'function f(): number { const g = () => { return 2; }; return g(); }',
			'function f() { const g = () => { return 2; }; return g(); }',
		),
		// `never` on a function that returns, through a bare `return` or an expression body.
		invalid(
			'function f(): never { if (x) return; throw new Error(); }',
			'function f() { if (x) return; throw new Error(); }',
		),
		withData(invalid('const f = (): never => fail();', 'const f = () => fail();'), {
			annotation: ': never',
			function: '`f`',
		}),
		// Recursion through a different method does not count.
		withData(
			invalid(
				'class A { m(): number { return this.n(); } }',
				'class A { m() { return this.n(); } }',
			),
			{ annotation: ': number', function: '`m`' },
		),
		invalid(
			'class A { m(): number { return [1].map(function () { return this.m(); })[0]; } }',
			'class A { m() { return [1].map(function () { return this.m(); })[0]; } }',
		),
		// References outside the body are not recursion.
		invalid('const f = (): number => 1; f();', 'const f = () => 1; f();'),
	],
});

function invalid(code: string, output: string) {
	return {
		code,
		errors: [
			{ messageId: 'inferrable', suggestions: [{ messageId: 'removeAnnotation', output }] },
		],
	};
}

function withData(
	test: ReturnType<typeof invalid>,
	data: { annotation: string; function: string },
) {
	return { ...test, errors: test.errors.map(error => Object.assign(error, { data })) };
}
