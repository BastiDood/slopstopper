import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_CLASS_OVER_FACTORY } from './index.ts';

const ERRORS = [{ messageId: 'preferClass' }];

OXLINT_RULE_TESTER.run('prefer-class-over-factory', PREFER_CLASS_OVER_FACTORY, {
	valid: [
		// A nested function is not module-level, so neither it nor its enclosing function is a factory.
		'function f() { function g() { return { h() {} }; } g(); }',
		// A framework hook is a method, not a module-level function.
		'defineRule({ create(context) { return { Program() {} }; } });',
		// Only data members.
		"function f() { return { range: [0, 1], text: 'x' }; }",
		// Another value return.
		'function f(a: boolean) { if (a) return null; return { g() {} }; }',
		// Only `const` declarations name a factory.
		'let f = () => ({ g() {} });',
		// An `export` inside a namespace is not at the top level of the module.
		'namespace N { export function f() { return { g() {} }; } }',
	],
	invalid: [
		// A type assertion around the object literal keeps it a factory.
		{
			code: 'function f() { return { g() {} } satisfies G; }',
			errors: errors({ factory: '`f`', class: 'a class `F`', parameters: 'no parameters' }),
		},
		// An exported arrow with an expression body and an arrow property.
		{
			code: 'export const f = (x: number) => ({ get: () => x });',
			errors: errors({ factory: '`f`', class: 'a class `F`', parameters: '`x`' }),
		},
		// An anonymous default export with a function property.
		{
			code: 'export default function () { return { g: function () {} }; }',
			errors: errors({
				factory: 'this factory',
				class: 'a class',
				parameters: 'no parameters',
			}),
		},
		// A return inside a nested function does not count toward the enclosing function.
		{
			code: 'function f() { [1].map(() => { return 1; }); return { g() {} }; }',
			errors: ERRORS,
		},
		// A bare `return` returns no value.
		{ code: 'function f(a: boolean) { if (a) return; return { g() {} }; }', errors: ERRORS },
	],
});

UNTYPED_RULE_TESTER.run('prefer-class-over-factory', eslintRule(PREFER_CLASS_OVER_FACTORY), {
	valid: [],
	invalid: [{ code: 'function f() { return { g() {} }; }', errors: ERRORS }],
});

function errors(data: { factory: string; class: string; parameters: string }) {
	return [{ messageId: 'preferClass', data }];
}
