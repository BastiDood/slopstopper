import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_CONDITIONAL_EMPTY_OBJECT_SPREAD } from './index.ts';

OXLINT_RULE_TESTER.run('no-conditional-empty-object-spread', NO_CONDITIONAL_EMPTY_OBJECT_SPREAD, {
	valid: [
		'const result = { ...values };',
		'const result = { ...(condition ? a : b) };',
		// The conditional is not spread into an object literal.
		'f(...(condition ? {} : values));',
	],
	invalid: [
		// An empty consequent negates the condition.
		{
			code: 'const result = { ...(condition ? {} : { value }) };',
			errors: on('(condition ? {} : { value })', '!condition'),
		},
		{
			code: 'const result = { ...(!ready ? {} : { value }) };',
			errors: on('(!ready ? {} : { value })', 'ready'),
		},
		{
			code: 'const result = { ...(a && b ? {} : { value }) };',
			errors: on('(a && b ? {} : { value })', '!(a && b)'),
		},
	],
});

UNTYPED_RULE_TESTER.run(
	'no-conditional-empty-object-spread',
	eslintRule(NO_CONDITIONAL_EMPTY_OBJECT_SPREAD),
	{
		valid: [],
		invalid: [
			{
				code: 'const result = { ...(condition ? { value } : {}) };',
				errors: on('(condition ? { value } : {})', 'condition'),
			},
		],
	},
);

function on(spread: string, condition: string) {
	return [{ messageId: 'conditionalEmptySpread', data: { spread, condition } }];
}
