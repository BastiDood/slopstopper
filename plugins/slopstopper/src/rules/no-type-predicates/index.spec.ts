import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_TYPE_PREDICATES } from './index.ts';

OXLINT_RULE_TESTER.run('no-type-predicates', NO_TYPE_PREDICATES, {
	valid: [],
	invalid: [
		{
			code: 'function isString(x: unknown): x is string { return typeof x === "string"; }',
			errors: [{ messageId: 'typePredicate', data: { subject: 'x' } }],
		},
		{
			code: 'class A { isB(): this is B { return true; } }',
			errors: [{ messageId: 'typePredicate', data: { subject: 'this' } }],
		},
		// An `asserts this` signature reports as an assertion, not as a `this` predicate.
		{
			code: 'class A { assertValid(): asserts this { } }',
			errors: [
				{ messageId: 'assertion', data: { function: '`assertValid`', subject: 'this' } },
			],
		},
	],
});
