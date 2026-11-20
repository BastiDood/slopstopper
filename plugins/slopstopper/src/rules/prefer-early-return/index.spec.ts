import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_EARLY_RETURN } from './index.ts';

OXLINT_RULE_TESTER.run('prefer-early-return', PREFER_EARLY_RETURN, {
	valid: [
		// Another statement before the second `return` is no pair.
		'function f(c) { if (c) return a; log(); return b; }',
		// An `else` is left to `no-else-return` and `unicorn/prefer-ternary`.
		'function f(c) { if (c) { return a; } else { return b; } }',
		// A ternary branch would nest, as `no-nested-ternary` forbids.
		'function f(c, d) { if (c) return d ? 1 : 2; return 3; }',
		'function f(c, d) { if (c) return 1; return d ? 2 : 3; }',
		// A conditional test would nest.
		'function f(a, b) { if (a ? b : !b) return "x"; return "y"; }',
		// Two literals are left to `no-unneeded-ternary`.
		'function f(c) { if (c) return true; return false; }',
		// The exit after the branch is only one line shorter. The margin keeps a rewrapped inversion from flipping back.
		lines(
			'function f(x) {',
			'\tif (x) {',
			'\t\ta();',
			'\t\tb();',
			'\t\treturn 1;',
			'\t}',
			'\tlog();',
			'\treturn 0;',
			'}',
		),
		// The statements after the branch do not exit.
		lines(
			'function f(x) {',
			'\tif (x) {',
			'\t\ta();',
			'\t\tb();',
			'\t\treturn 1;',
			'\t}',
			'\tlog();',
			'}',
		),
		// Without type information, a call is no exit, even one that returns `never`.
		lines(
			'function f(x) {',
			'\tif (x) {',
			'\t\ta();',
			'\t\tb();',
			'\t\treturn 1;',
			'\t}',
			'\tfail();',
			'}',
		),
		// A `return` pair and a `throw` pair do not mix.
		'function f(c) { if (c) return a; throw b; }',
		// The branch does not exit.
		lines(
			'function f(x) {',
			'\tif (x) {',
			'\t\ta();',
			'\t\tb();',
			'\t\tc();',
			'\t}',
			'\treturn 0;',
			'}',
		),
	],
	invalid: [
		{
			code: 'function f(c) { if (c) return a; return b; }',
			output: 'function f(c) { return c ? a : b; }',
			errors: [ternary('c')],
		},
		{
			code: 'function f(c) { if (c) { return a; } return b; }',
			output: 'function f(c) { return c ? a : b; }',
			errors: [ternary('c')],
		},
		// A `throw` pair chooses one thrown value.
		{
			code: 'function f(c) { if (c) throw a; throw b; }',
			output: 'function f(c) { throw c ? a : b; }',
			errors: [ternaryThrow('c')],
		},
		// A negated test is inverted, as `no-negated-condition` asks.
		{
			code: 'function f(x) { if (x !== null) return x.v; return 0; }',
			output: 'function f(x) { return x === null ? 0 : x.v; }',
			errors: [ternary('x !== null')],
		},
		// A chain whose negated operands outnumber what De Morgan's law leaves is inverted, as `prefer-de-morgan` asks.
		{
			code: 'function f(a, b) { if (a !== 1 || !b) return x; return y; }',
			output: 'function f(a, b) { return a === 1 && b ? y : x; }',
			errors: [ternary('a !== 1 || !b')],
		},
		// A test or branch that binds more loosely than the conditional keeps its parentheses.
		{
			code: 'function f() { if ((x = read())) return x; return 0; }',
			output: 'function f() { return (x = read()) ? x : 0; }',
			errors: [ternary('x = read()')],
		},
		{
			code: 'function f(c) { if (c) return (a, b); return d; }',
			output: 'function f(c) { return c ? (a, b) : d; }',
			errors: [ternary('c')],
		},
		// The rewrite would drop a comment.
		{
			code: 'function f(c) { if (c) /* why */ return a; return b; }',
			output: null,
			errors: [ternary('c')],
		},
		// A statement list of a `switch` case counts too.
		{
			code: 'function f(k, c) { switch (k) { case 1: if (c) return a; return b; } }',
			output: 'function f(k, c) { switch (k) { case 1: return c ? a : b; } }',
			errors: [ternary('c')],
		},
		// A boolean literal on one side suggests a chain.
		{
			code: 'function f(c) { if (c) return true; return d; }',
			errors: [
				chain({
					test: 'c',
					literal: 'true',
					operator: '||',
					output: 'function f(c) { return c || d; }',
				}),
			],
		},
		{
			code: 'function f(c) { if (c) return false; return d; }',
			errors: [
				chain({
					test: 'c',
					literal: 'false',
					operator: '&&',
					output: 'function f(c) { return !c && d; }',
				}),
			],
		},
		{
			code: 'function f(c) { if (c) return d; return true; }',
			errors: [
				chain({
					test: 'c',
					literal: 'true',
					operator: '||',
					output: 'function f(c) { return !c || d; }',
				}),
			],
		},
		{
			code: 'function f(c) { if (c) return d; return false; }',
			errors: [
				chain({
					test: 'c',
					literal: 'false',
					operator: '&&',
					output: 'function f(c) { return c && d; }',
				}),
			],
		},
		// The suggestion would drop a comment.
		{
			code: 'function f(c) { if (c) /* why */ return true; return d; }',
			errors: [
				{
					messageId: 'booleanReturn',
					data: { test: 'c', literal: 'true', operator: '||' },
					suggestions: [],
				},
			],
		},
		// A chain operand that binds more loosely than `&&` gets parentheses.
		{
			code: 'function f(a, b) { if (a || b) return false; return d ?? e; }',
			errors: [
				chain({
					test: 'a || b',
					literal: 'false',
					operator: '&&',
					output: 'function f(a, b) { return (!a && !b) && (d ?? e); }',
				}),
			],
		},
		// A branch longer than the exit after it is inverted.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) {',
				'\t\ta();',
				'\t\tb();',
				'\t\treturn 1;',
				'\t}',
				'\treturn 0;',
				'}',
			),
			output: lines(
				'function f(x) {',
				'\tif (!x) return 0;',
				'\ta();',
				'\tb();',
				'\treturn 1;',
				'}',
			),
			errors: [shorter('x', 3, 1)],
		},
		// Several statements after the branch go into a block. The negation distributes over a chain.
		{
			code: lines(
				'function f(a, b) {',
				'\tif (a && b) {',
				'\t\tconst value = read();',
				'\t\tuse(value);',
				'\t\tcheck(value);',
				'\t\treturn value;',
				'\t}',
				'\tlog();',
				'\treturn 0;',
				'}',
			),
			output: lines(
				'function f(a, b) {',
				'\tif (!a || !b) {',
				'\t\tlog();',
				'\t\treturn 0;',
				'\t}',
				'\tconst value = read();',
				'\tuse(value);',
				'\tcheck(value);',
				'\treturn value;',
				'}',
			),
			errors: [shorter('a && b', 4, 2)],
		},
		// A `continue` and a `throw` exit too.
		{
			code: lines(
				'for (const x of xs) {',
				'\tif (x) {',
				'\t\ta();',
				'\t\tb();',
				'\t\tcontinue;',
				'\t}',
				'\tthrow new Error();',
				'}',
			),
			output: lines(
				'for (const x of xs) {',
				'\tif (!x) throw new Error();',
				'\ta();',
				'\tb();',
				'\tcontinue;',
				'}',
			),
			errors: [shorter('x', 3, 1)],
		},
		// A `break` exits a `switch` case.
		{
			code: lines(
				'function f(k, c) {',
				'\tswitch (k) {',
				'\t\tcase 1:',
				'\t\t\tif (c) {',
				'\t\t\t\ta();',
				'\t\t\t\tb();',
				'\t\t\t\tbreak;',
				'\t\t\t}',
				'\t\t\tbreak;',
				'\t}',
				'}',
			),
			output: lines(
				'function f(k, c) {',
				'\tswitch (k) {',
				'\t\tcase 1:',
				'\t\t\tif (!c) break;',
				'\t\t\ta();',
				'\t\t\tb();',
				'\t\t\tbreak;',
				'\t}',
				'}',
			),
			errors: [shorter('c', 3, 1)],
		},
		// The text of a template literal keeps its lines as written.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) {',
				'\t\tconst s = `one',
				'\ttwo`;',
				'\t\tuse(s);',
				'\t\treturn s;',
				'\t}',
				'\treturn 0;',
				'}',
			),
			output: lines(
				'function f(x) {',
				'\tif (!x) return 0;',
				'\tconst s = `one',
				'\ttwo`;',
				'\tuse(s);',
				'\treturn s;',
				'}',
			),
			errors: [shorter('x', 4, 1)],
		},
		// The guard ends in a semicolon, so that a statement after it cannot continue it.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) {',
				'\t\t[a, b] = [b, a]',
				'\t\tc()',
				'\t\treturn a',
				'\t}',
				'\treturn 0',
				'}',
			),
			output: lines(
				'function f(x) {',
				'\tif (!x) return 0;',
				'\t[a, b] = [b, a]',
				'\tc()',
				'\treturn a',
				'}',
			),
			errors: [shorter('x', 3, 1)],
		},
		// A single statement on several lines goes into a block.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) {',
				'\t\ta();',
				'\t\tb();',
				'\t\tc();',
				'\t\td();',
				'\t\treturn 1;',
				'\t}',
				'\treturn {',
				'\t\tv: 0,',
				'\t};',
				'}',
			),
			output: lines(
				'function f(x) {',
				'\tif (!x) {',
				'\t\treturn {',
				'\t\t\tv: 0,',
				'\t\t};',
				'\t}',
				'\ta();',
				'\tb();',
				'\tc();',
				'\td();',
				'\treturn 1;',
				'}',
			),
			errors: [shorter('x', 5, 3)],
		},
		// The inversion would drop a comment.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) /* why */ {',
				'\t\ta();',
				'\t\tb();',
				'\t\treturn 1;',
				'\t}',
				'\treturn 0;',
				'}',
			),
			output: null,
			errors: [shorter('x', 3, 1)],
		},
		// A function that the statements after the branch declare would move into a block that the branch cannot see.
		{
			code: lines(
				'function f(x) {',
				'\tif (x) {',
				'\t\ta();',
				'\t\tb();',
				'\t\tc();',
				'\t\treturn helper();',
				'\t}',
				'\tfunction helper() { return 1; }',
				'\treturn 0;',
				'}',
			),
			output: null,
			errors: [shorter('x', 4, 2)],
		},
		// A declaration of the branch whose name is bound at the `if` would clash outside the block.
		{
			code: lines(
				'function f(x, value) {',
				'\tif (x) {',
				'\t\tconst value = read();',
				'\t\tuse(value);',
				'\t\treturn value;',
				'\t}',
				'\treturn 0;',
				'}',
			),
			output: null,
			errors: [shorter('x', 3, 1)],
		},
	],
});

UNTYPED_RULE_TESTER.run('prefer-early-return', eslintRule(PREFER_EARLY_RETURN), {
	valid: ['function f(c) { if (c) return a; log(); return b; }'],
	invalid: [
		{
			code: 'function f(c) { if (c) return a; return b; }',
			output: 'function f(c) { return c ? a : b; }',
			errors: [ternary('c')],
		},
	],
});

function lines(...parts: string[]) {
	return parts.join('\n');
}

function ternary(test: string) {
	return { messageId: 'ternaryExit', data: { test, keyword: 'return' } };
}

function ternaryThrow(test: string) {
	return { messageId: 'ternaryExit', data: { test, keyword: 'throw' } };
}

/** The expected labels and suggestion output of a `booleanReturn` report. */
interface ChainCase {
	test: string;
	literal: string;
	operator: string;
	output: string;
}

function chain({ test, literal, operator, output }: ChainCase) {
	return {
		messageId: 'booleanReturn',
		data: { test, literal, operator },
		suggestions: [{ messageId: 'chainReturn', data: { operator }, output }],
	};
}

function shorter(test: string, branchLines: number, tailLines: number) {
	return {
		messageId: 'shorterBranchFirst',
		data: { test, branchLines: String(branchLines), tailLines: String(tailLines) },
	};
}
