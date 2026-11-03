import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_REDUCE_ACCUMULATOR_COPY } from './index.ts';

TYPED_RULE_TESTER.run('no-reduce-accumulator-copy', eslintRule(NO_REDUCE_ACCUMULATOR_COPY), {
	valid: [
		// `concat` resolves to `String#concat`, which copies no array.
		'declare const xs: string[]; xs.reduce((acc, x) => acc.concat(x));',
	],
	invalid: [
		// Without an initial value, only the type checker proves that `concat` is the array method.
		{
			code: 'declare const xs: number[][]; xs.reduce((acc, x) => acc.concat(x));',
			errors: [
				{
					messageId: 'arrayMethodCopy',
					data: {
						call: 'acc.concat(x)',
						accumulator: 'acc',
						reducer: 'reduce',
						mutator: 'push',
					},
				},
			],
		},
	],
});
