import { eslintRule, TYPED_RULE_TESTER, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_POSITIONAL_SCALARS } from './index.ts';

const RULE = eslintRule(NO_POSITIONAL_SCALARS);

TYPED_RULE_TESTER.run('no-positional-scalars', RULE, {
	valid: [
		'type Id = { id: string }; function f(a: Id, b: Id, c: Id) {}',
		'type Id = string & { brand: "Id" }; function f(a: Id, b: Id, c: Id) {}',
		'function f(a: any, b: unknown, c: boolean) {}',
		'function f(a: never, b: boolean) {}',
		'function f(this: Flag, a: Flag) {} type Flag = boolean;',
		// Destructured parameters are not positional, with or without a default.
		'type Flag = boolean; function f({ a }: { a: Flag }, b: Flag) {}',
		'type Flag = boolean; function f({ a }: { a: Flag } = { a: true }, b: Flag) {}',
	],
	invalid: [
		{
			code: 'type Key = string | number | null; function f(a: Key, b: Key, c: Key) {}',
			errors: errors('string', 3),
		},
		{
			code: 'type Flag = boolean; function f(a: Flag | undefined, b: boolean) {}',
			errors: errors('boolean', 2),
		},
		{
			code: 'const DEFAULT = `x`; function f(a = DEFAULT, b: string, c: string) {}',
			errors: errors('string', 3),
		},
		// Parameter properties count by their resolved type too.
		{
			code: 'type Flag = boolean; class A { constructor(private a: Flag, private b: Flag) {} }',
			errors: errors('boolean', 2),
		},
	],
});

// Without a TypeScript program, ESLint falls back to the syntax tier, which does not resolve type references.
UNTYPED_RULE_TESTER.run('no-positional-scalars', RULE, {
	valid: ['type Id = string; function f(a: Id, b: Id, c: Id) {}'],
	invalid: [],
});

function errors(kind: string, count: number) {
	return [{ messageId: 'positionalScalars', data: { count, kind } }];
}
