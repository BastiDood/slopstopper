import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_WHILE_TRUE } from './index.ts';

const ERRORS = [{ messageId: 'preferWhileTrue' }];

OXLINT_RULE_TESTER.run('prefer-while-true', PREFER_WHILE_TRUE, {
	valid: ['for (let i = 0; ; ) {}', 'for (; x; ) {}', 'for (; ; i++) {}', 'while (true) {}'],
	invalid: [
		// The label and the body stay as they are, and so does a comment after the head.
		{
			code: 'outer: for ( ; ; ) /* forever */ { break outer; }',
			output: 'outer: while (true) /* forever */ { break outer; }',
			errors: ERRORS,
		},
		{ code: 'for (;;) f();', output: 'while (true) f();', errors: ERRORS },
		// A comment inside the head would be dropped.
		{ code: 'for (; /* forever */ ;) {}', output: null, errors: ERRORS },
	],
});

UNTYPED_RULE_TESTER.run('prefer-while-true', eslintRule(PREFER_WHILE_TRUE), {
	valid: [],
	invalid: [{ code: 'for (;;) {}', output: 'while (true) {}', errors: ERRORS }],
});
