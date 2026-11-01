import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_PREFIX_INCREMENT } from './index.ts';

const INCREMENT = { assignment: '+=', operator: '++' };
const DECREMENT = { assignment: '-=', operator: '--' };

OXLINT_RULE_TESTER.run('prefer-prefix-increment', PREFER_PREFIX_INCREMENT, {
	valid: [
		// The old value of a postfix update is read.
		'const v = items[i++];',
		// The value of a sequence's last element is the value of the sequence.
		'const v = (f(), i++);',
		// Only a step of `1` is an update.
		'x += 2;',
		'x += y;',
	],
	invalid: [
		// A local `let` counter initialized to a number literal and only updated holds a number.
		{
			code: 'let n = 0; n += 1; n -= 1; n++;',
			output: 'let n = 0; ++n; --n; ++n;',
			errors: [update(INCREMENT), update(DECREMENT), prefix('++')],
		},
		{
			code: 'for (let i = 0; i < 3; i++) {}',
			output: 'for (let i = 0; i < 3; ++i) {}',
			errors: [prefix('++')],
		},
		// Every element of a discarded sequence is discarded.
		{
			code: 'for (;; i++, j--) {}',
			output: 'for (;; ++i, --j) {}',
			errors: [prefix('++'), prefix('--')],
		},
		// A member or an untyped identifier may hold a string, so the rewrite is a suggestion.
		{
			code: 'cases.count += 1;',
			output: null,
			errors: [{ ...update(INCREMENT), suggestions: [rewrite(INCREMENT, '++cases.count;')] }],
		},
		{
			code: 'function f(s) { s -= 1; }',
			output: null,
			errors: [
				{
					...update(DECREMENT),
					suggestions: [rewrite(DECREMENT, 'function f(s) { --s; }')],
				},
			],
		},
		// A comment outside the target would be dropped.
		{
			code: 'let n = 0; n /* step */ += 1;',
			output: null,
			errors: [{ ...update(INCREMENT), suggestions: [] }],
		},
	],
});

function prefix(operator: string) {
	return { messageId: 'preferPrefix', data: { operator } };
}

function update(data: typeof INCREMENT) {
	return { messageId: 'preferUpdate', data };
}

function rewrite(data: typeof INCREMENT, output: string) {
	return { messageId: 'rewriteAsUpdate', data, output };
}
