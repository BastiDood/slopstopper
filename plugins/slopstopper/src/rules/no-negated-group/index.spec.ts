import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_NEGATED_GROUP } from './index.ts';

const errors = [{ messageId: 'noNegatedGroup' }];

OXLINT_RULE_TESTER.run('no-negated-group', NO_NEGATED_GROUP, {
	valid: [
		// `prefer-de-morgan` produces a negated `===` run on the way to `no-equality-chain`.
		'const v = !(x === 1 || x === 2);',
		// `no-negated-condition` swaps the branches of an `if`-`else` instead.
		'if (!(a && b)) {} else {}',
	],
	invalid: [
		{ code: 'if (!(a && b)) {}', output: 'if (!a || !b) {}', errors },
		// `!x` loses its `!`, an equality flips, and any other operand gets a `!`.
		{
			code: 'if (!(!a || b === c || f())) {}',
			output: 'if (a && b !== c && !f()) {}',
			errors,
		},
		// Outside a condition, `!x` becomes `!!x`, so that the result stays a `boolean`.
		{ code: 'const v = !(!a && b);', output: 'const v = !!a || !b;', errors },
		// An `&&` parent binds tighter than the new `||`.
		{ code: 'const v = !(a && b) && c;', output: 'const v = (!a || !b) && c;', errors },
		// A nested group with the same operator joins the chain and keeps its parentheses.
		{ code: 'while (!(a && (b && c))) {}', output: 'while (!a || (!b || !c)) {}', errors },
		// The rewrite would drop the comment between the parentheses and the group.
		{ code: 'if (!(/* keep */ a && b)) {}', output: null, errors },
	],
});

UNTYPED_RULE_TESTER.run('no-negated-group', eslintRule(NO_NEGATED_GROUP), {
	valid: [],
	invalid: [{ code: 'if (!(a || b)) {}', output: 'if (!a && !b) {}', errors }],
});
