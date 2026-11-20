import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_NON_BOOLEAN_LOGICAL } from './index.ts';

OXLINT_RULE_TESTER.run('no-non-boolean-logical', NO_NON_BOOLEAN_LOGICAL, {
	valid: [
		// Without type information, an operand that can be a boolean is not reported.
		'const ok = ready && loaded;',
		'const ok = ready && isLoaded(item);',
		'const ok = ready && count > 0;',
		'const ok = ready && true;',
		'const ok = ready && value instanceof Date;',
		'const ok = ready && delete cache[key];',
		'const ok = ready && key in table;',
		'const ok = ready && !failed;',
		// A nullish default is no truth value.
		'const items = list ?? [];',
		// `typescript/strict-boolean-expressions` checks the right operand where only truthiness is read.
		'if (ready && { v }) run();',
		'while (ready || []) step();',
		'for (; ready && "x"; ) step();',
		'const label = ready && {} ? "a" : "b";',
		'const negated = !(ready && []);',
		'const ok = (ready && {}) || other;',
		'if (a || (b && { v })) run();',
		// `no-unused-expressions` reports an expression statement.
		'ready && run({ v });',
		// `typescript/strict-boolean-expressions` reads the return of an array predicate callback.
		'const named = items.filter(item => ready && "x");',
		'const found = items.find(item => { return ready && { item }; });',
		// A nullish assignment and a boolean assignment are not reported.
		'options.items ??= [];',
		'state.ready ||= loaded;',
		// `typescript/strict-boolean-expressions` checks a logical assignment that is read for its truthiness.
		'if ((box.items ||= [])) run();',
		'const both = (cache.items ||= []) && ready;',
	],
	invalid: [
		{
			code: 'const extra = c && { v };',
			errors: [and('c && { v }', '{ v }')],
		},
		{
			code: 'const items = list || [];',
			errors: [or('list || []', '[]')],
		},
		{
			code: 'const name = given || "anonymous";',
			errors: [or('given || "anonymous"', '"anonymous"')],
		},
		{
			code: 'const label = c && `#id`;',
			errors: [and('c && `#id`', '`#id`')],
		},
		{
			code: 'const markup = c && html`<b />`;',
			errors: [and('c && html`<b />`', 'html`<b />`')],
		},
		{
			code: 'const handler = enabled && (() => run());',
			errors: [and('enabled && (() => run())', '() => run()')],
		},
		{
			code: 'const cache = c && new Map();',
			errors: [and('c && new Map()', 'new Map()')],
		},
		{
			code: 'const value = c && undefined;',
			errors: [and('c && undefined', 'undefined')],
		},
		{
			code: 'const kind = c && typeof value;',
			errors: [and('c && typeof value', 'typeof value')],
		},
		{
			code: 'const total = c && a + b;',
			errors: [and('c && a + b', 'a + b')],
		},
		{
			code: 'const items = c && (list ?? []);',
			errors: [and('c && (list ?? [])', 'list ?? []')],
		},
		{
			code: 'const item = c && (d ? { v } : read());',
			errors: [and('c && (d ? { v } : read())', 'd ? { v } : read()')],
		},
		{
			code: 'const loaded = c && import("./a.ts");',
			errors: [and('c && import("./a.ts")', 'import("./a.ts")')],
		},
		// TypeScript assertions do not hide the operand.
		{
			code: 'const extra = c && ({ v } as Extra);',
			errors: [and('c && ({ v } as Extra)', '{ v } as Extra')],
		},
		// The right operand of an enclosing chain passes its use on.
		{
			code: 'const extra = a || (b && { v });',
			errors: [and('b && { v }', '{ v }')],
		},
		// A `.map` callback, a spread, and a JSX child use the value.
		{
			code: 'const names = items.map(item => ready && "x");',
			errors: [and('ready && "x"', '"x"')],
		},
		{
			code: 'const request = { url, ...(verbose && { trace: true }) };',
			errors: [and('verbose && { trace: true }', '{ trace: true }')],
		},
		{
			code: 'const view = <div>{open && <Panel />}</div>;',
			filename: 'view.tsx',
			errors: [and('open && <Panel />', '<Panel />')],
		},
		// A logical assignment assigns its value.
		{
			code: 'options.items ||= [];',
			errors: [orAssign('options.items ||= []', '[]')],
		},
		{
			code: 'state.extra &&= { v };',
			errors: [andAssign('state.extra &&= { v }', '{ v }')],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-non-boolean-logical', eslintRule(NO_NON_BOOLEAN_LOGICAL), {
	valid: ['const ok = ready && loaded;'],
	invalid: [
		{
			code: 'const extra = c && { v };',
			errors: [and('c && { v }', '{ v }')],
		},
	],
});

function and(expression: string, operand: string) {
	return { messageId: 'nonBooleanAnd', data: { expression, operand, operator: '&&' } };
}

function andAssign(expression: string, operand: string) {
	return { messageId: 'nonBooleanAnd', data: { expression, operand, operator: '&&=' } };
}

function or(expression: string, operand: string) {
	return {
		messageId: 'nonBooleanOr',
		data: { expression, operand, operator: '||', nullish: '??' },
	};
}

function orAssign(expression: string, operand: string) {
	return {
		messageId: 'nonBooleanOr',
		data: { expression, operand, operator: '||=', nullish: '??=' },
	};
}
