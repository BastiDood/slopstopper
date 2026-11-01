import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

import { DESTRUCTURE_ON_SIGHT } from './index.ts';

TYPED_RULE_TESTER.run('destructure-on-sight', eslintRule(DESTRUCTURE_ON_SIGHT), {
	valid: [
		// `b` exists on only one member of the union, so destructuring it would not type-check.
		"type U = { type: 'a'; b: number } | { type: 'c' }; function f(x: U) { return x.type === 'a' ? x.b : 0; }",
	],
	invalid: [
		// Every read property exists on the type, so a narrowing read no longer exempts the binding.
		{
			code: "type P = { type: 'a' | 'c'; b: number }; function f(x: P) { return x.type === 'a' ? x.b : 0; }",
			errors: [
				{
					messageId: 'destructure',
					suggestions: [
						{
							messageId: 'destructureInto',
							output: "type P = { type: 'a' | 'c'; b: number }; function f({ type, b }: P) { return type === 'a' ? b : 0; }",
						},
					],
				},
			],
		},
	],
});
