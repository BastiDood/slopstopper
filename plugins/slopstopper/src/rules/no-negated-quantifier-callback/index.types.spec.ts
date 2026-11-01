import { eslintRule, TYPED_RULE_TESTER, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_NEGATED_QUANTIFIER_CALLBACK } from './index.ts';

const RULE = eslintRule(NO_NEGATED_QUANTIFIER_CALLBACK);
const data = { quantifier: 'every', dual: 'some' };

TYPED_RULE_TESTER.run('no-negated-quantifier-callback', RULE, {
	valid: [],
	invalid: [
		// The type checker resolves `every` to the standard method of `ReadonlyArray`.
		{
			code: 'declare const xs: readonly number[]; const v = xs.every(x => !x);',
			output: 'declare const xs: readonly number[]; const v = !xs.some(x => x);',
			errors: [{ messageId: 'negatedQuantifierCallback', data }],
		},
	],
});

// Without a TypeScript program, nothing proves that `every` is the standard method.
UNTYPED_RULE_TESTER.run('no-negated-quantifier-callback', RULE, {
	valid: [],
	invalid: [
		{
			code: 'declare const xs: readonly number[]; const v = xs.every(x => !x);',
			output: null,
			errors: [
				{
					messageId: 'negatedQuantifierCallback',
					data,
					suggestions: [
						{
							messageId: 'rewriteWithDual',
							data,
							output: 'declare const xs: readonly number[]; const v = !xs.some(x => x);',
						},
					],
				},
			],
		},
	],
});
