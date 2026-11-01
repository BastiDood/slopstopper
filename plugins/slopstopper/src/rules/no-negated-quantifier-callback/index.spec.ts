import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_NEGATED_QUANTIFIER_CALLBACK } from './index.ts';

const EVERY = { quantifier: 'every', dual: 'some' };
const SOME = { quantifier: 'some', dual: 'every' };

OXLINT_RULE_TESTER.run('no-negated-quantifier-callback', NO_NEGATED_QUANTIFIER_CALLBACK, {
	valid: [
		'const v = xs.every(x => p(x));',
		'const v = xs.filter(x => !p(x));',
		// An index or array parameter, a `thisArg`, or an optional call is left alone.
		'const v = xs.every((x, i) => !p(x, i));',
		'const v = xs.every(x => !p(x), context);',
		'const v = xs?.every(x => !p(x));',
		'const v = a?.xs.every(x => !p(x));',
		// An `async` callback returns a promise, which is always truthy.
		'const v = xs.every(async x => !p(x));',
		// Inverting the result would invert the type predicate.
		'const v = xs.every((x): x is A => !p(x));',
		'const v = xs.every(function (x) { g(); return !p(x); });',
	],
	invalid: [
		{
			code: 'const v = xs.every(x => !p(x));',
			errors: suggested(EVERY, 'const v = !xs.some(x => p(x));'),
		},
		{
			code: 'const v = xs.some(function (x) { return !p(x); });',
			errors: suggested(SOME, 'const v = !xs.every(function (x) { return p(x); });'),
		},
		// A negated call drops both negations.
		{
			code: 'const v = !xs.some(x => !p(x));',
			errors: suggested(SOME, 'const v = xs.every(x => p(x));'),
		},
		// A `!` before a call that binds tighter than `!` gets parentheses.
		{
			code: 'const v = xs.every(x => !p(x)).toString();',
			errors: suggested(EVERY, 'const v = (!xs.some(x => p(x))).toString();'),
		},
		// A comment between the outer `!` and the call would be dropped, so there is no rewrite.
		{
			code: 'const v = ! /* all */ xs.some(x => !p(x));',
			errors: [{ messageId: 'negatedQuantifierCallback', data: SOME, suggestions: [] }],
		},
	],
});

function suggested(data: typeof EVERY, output: string) {
	return [
		{
			messageId: 'negatedQuantifierCallback',
			data,
			suggestions: [{ messageId: 'rewriteWithDual', data, output }],
		},
	];
}
