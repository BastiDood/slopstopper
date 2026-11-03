import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_MULTIPLE_OPTIONAL_PARAMETERS } from './index.ts';

const TWO = [{ messageId: 'multipleOptional', data: { count: 2 } }];

OXLINT_RULE_TESTER.run('no-multiple-optional-parameters', NO_MULTIPLE_OPTIONAL_PARAMETERS, {
	valid: [
		'function f(a: number, options: Partial<Options> = {}) {}',
		'function f(a?: number, ...rest: number[]) {}',
	],
	invalid: [
		{ code: 'function f({ a }?: Options, b?: number) {}', errors: TWO },
		{ code: 'function f([a]?: [number], b = 1) {}', errors: TWO },
		{ code: 'const f = (a?: number, b = 1) => {};', errors: TWO },
		{ code: 'class A { constructor(private a?: number, readonly b = 1) {} }', errors: TWO },
		{ code: 'abstract class A { abstract m(a?: number, b?: number): void; }', errors: TWO },
		{
			code: 'function f(a?: number, b?: number): void; function f(a?: string, b?: string): void; function f() {}',
			errors: [...TWO, ...TWO],
		},
		{ code: 'interface A { m(a?: number, b?: number): void }', errors: TWO },
		{ code: 'interface A { (a?: number, b?: number): void }', errors: TWO },
		{ code: 'interface A { new (a?: number, b?: number): A }', errors: TWO },
		{ code: 'type F = (a?: number, b?: number) => void;', errors: TWO },
		{ code: 'type C = new (a?: number, b?: number) => object;', errors: TWO },
	],
});
