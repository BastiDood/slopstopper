import { eslintRule, TYPED_RULE_TESTER, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { PREFER_PREFIX_INCREMENT } from './index.ts';

const RULE = eslintRule(PREFER_PREFIX_INCREMENT);

TYPED_RULE_TESTER.run('prefer-prefix-increment', RULE, {
	valid: [],
	invalid: [
		// A member of a number type is proven to hold a number.
		{
			code: 'declare const cases: { count: number }; cases.count += 1;',
			output: 'declare const cases: { count: number }; ++cases.count;',
			errors: [update()],
		},
		// `s += 1` concatenates a string, so the rewrite stays a suggestion.
		{
			code: 'declare let s: string; s += 1;',
			output: null,
			errors: [
				{
					...update(),
					suggestions: [
						{ messageId: 'rewriteAsUpdate', output: 'declare let s: string; ++s;' },
					],
				},
			],
		},
	],
});

// Without a TypeScript program, ESLint falls back to the syntax tier, which does not resolve declared types.
UNTYPED_RULE_TESTER.run('prefer-prefix-increment', RULE, {
	valid: [],
	invalid: [
		{
			code: 'declare let n: number; n += 1;',
			output: null,
			errors: [
				{
					...update(),
					suggestions: [
						{ messageId: 'rewriteAsUpdate', output: 'declare let n: number; ++n;' },
					],
				},
			],
		},
	],
});

function update() {
	return { messageId: 'preferUpdate', data: { assignment: '+=', operator: '++' } };
}
