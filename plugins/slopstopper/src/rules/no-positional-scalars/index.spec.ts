import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_POSITIONAL_SCALARS } from './index.ts';

const TSX = { languageOptions: { parserOptions: { lang: 'tsx' } } } as const;

OXLINT_RULE_TESTER.run('no-positional-scalars', NO_POSITIONAL_SCALARS, {
	valid: [
		'function f(from: string, to: string, count: number, enabled: boolean) {}',
		"function f(a: 'x' | 'y' | 'z', b: string) {}",
		'function f(a: boolean | Date, b: boolean) {}',
		'function f(a: boolean, b, { c }: { c: boolean }, [d]: [boolean], ...rest: boolean[]) {}',
		'function f(a = true, b = {}, c = null, d = -x) {}',
		'function f(a: Flag = true, b: boolean) {}',
		'function f(a = true, [b] = [true]) {}',
		'items.reduce((a: boolean, b: boolean) => a);',
		'new Promise(function (a: boolean, b: boolean) {});',
		{ code: 'const x = <Input onChange={(a: boolean, b: boolean) => {}} />;', ...TSX },
	],
	invalid: [
		{ code: 'function f(a: symbol, b: symbol, c: symbol) {}', errors: errors('symbol', 3) },
		{
			code: 'function f(a: string | number, b: string, c: string) {}',
			errors: errors('string', 3),
		},
		{
			code: 'function f(a: string | number, b: number, c: number) {}',
			errors: errors('number', 3),
		},
		{ code: 'function f(a: true, b: boolean) {}', errors: errors('boolean', 2) },
		{
			code: `function f(a: 'x', b: \`id-\${string}\`, c: string) {}`,
			errors: errors('string', 3),
		},
		{ code: 'function f(a: 1, b: -1, c: number) {}', errors: errors('number', 3) },
		{ code: 'function f(a: 1n, b: -1n, c: bigint) {}', errors: errors('bigint', 3) },
		{
			code: 'function f(a: (boolean | undefined), b: ((boolean)) | null) {}',
			errors: errors('boolean', 2),
		},
		{ code: "function f(a = 'x', b = `y`, c: string) {}", errors: errors('string', 3) },
		{
			code: 'function f(this: boolean, a: boolean, b: boolean) {}',
			errors: errors('boolean', 2),
		},
		{
			code: 'function f(a: boolean, b: boolean, c: string, d: string, e: string) {}',
			errors: errors('boolean', 2),
		},
		{
			code: 'function f(a: string, b: string) {}',
			options: [{ string: 2 }],
			errors: errors('string', 2),
		},
		{
			code: 'function f(a: boolean, b: boolean) {}',
			options: [{ string: 4 }],
			errors: errors('boolean', 2),
		},
		{ code: '((a: boolean, b: boolean) => {})(true, false);', errors: errors('boolean', 2) },
		{
			code: 'class A { constructor(private a: boolean, readonly b: boolean) {} }',
			errors: errors('boolean', 2),
		},
		{
			code: 'abstract class A { abstract m(a: boolean, b: boolean): void; }',
			errors: errors('boolean', 2),
		},
		{
			code: 'function f(a: boolean, b: boolean): void; function f(a: string, b: string, c: string): void; function f() {}',
			errors: [...errors('boolean', 2), ...errors('string', 3)],
		},
		{ code: 'interface A { m(a: boolean, b: boolean): void }', errors: errors('boolean', 2) },
		{ code: 'interface A { (a: boolean, b: boolean): void }', errors: errors('boolean', 2) },
		{ code: 'interface A { new (a: boolean, b: boolean): A }', errors: errors('boolean', 2) },
		{ code: 'type F = (a: boolean, b: boolean) => void;', errors: errors('boolean', 2) },
		{ code: 'type C = new (a: boolean, b: boolean) => object;', errors: errors('boolean', 2) },
		{
			code: 'const x = <div>{(a: boolean, b: boolean) => {}}</div>;',
			errors: errors('boolean', 2),
			...TSX,
		},
	],
});

function errors(kind: string, count: number) {
	return [{ messageId: 'positionalScalars', data: { count, kind } }];
}
