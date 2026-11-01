import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { NO_INFERRABLE_RETURN_TYPE } from './index.ts';

TYPED_RULE_TESTER.run('no-inferrable-return-type', eslintRule(NO_INFERRABLE_RETURN_TYPE), {
	valid: [
		// A computed key whose type is one string literal resolves to its value, both as a method key and in `this[KEY]`.
		"const KEY = 'walk'; class A { [KEY](n: number): number { return n <= 0 ? 0 : this[KEY](n - 1); } }",
	],
	invalid: [
		// A computed key of a wider type stays dynamic, so the recursion is unknown.
		{
			code: 'declare const KEY: string; class A { [KEY](n: number): number { return this[KEY](n - 1); } }',
			errors: [
				{
					messageId: 'inferrable',
					data: { annotation: ': number', function: 'this function' },
					suggestions: [
						{
							messageId: 'removeAnnotation',
							output: 'declare const KEY: string; class A { [KEY](n: number) { return this[KEY](n - 1); } }',
						},
					],
				},
			],
		},
	],
});
