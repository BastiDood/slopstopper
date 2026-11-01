import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { MERGE_EXCLUSIVE_BRANCHES } from './index.ts';

OXLINT_RULE_TESTER.run('merge-exclusive-branches', MERGE_EXCLUSIVE_BRANCHES, {
	valid: [
		// Another statement separates the `if` statements.
		'const a = f(); if (a) x(); y(); if (!a) z();',
		// An `if` with an `else` already holds a decision, whether it comes first or second.
		'const a = f(); if (a) x(); else y(); if (!a) z();',
		'const a = f(); if (a) x(); if (!a) y(); else z();',
		// Only `!` negates a condition, so `-a` neither negates `a` nor is a condition that `!-a` negates.
		'const a = f(); if (-a) x(); if (!-a) y();',
		// Only equality comparisons are conditions.
		'const a = f(); if (a < 1) x(); if (!(a < 1)) y();',
		// Regular expression literals are distinct objects, so they never compare equal.
		'if (a === /x/) x(); if (a !== /x/) y();',
		// A template literal with expressions and a negation other than a negated number may differ each time.
		`if (a === \`\${b}\`) x(); if (a !== \`\${b}\`) y();`,
		'if (a === -b) x(); if (a !== -b) y();',
		// The tests share no condition.
		'if (a) x(); if (!b) y();',
		// Calls may return a different value each time, so they never match.
		'if (f()) x(); if (!f()) y();',
		'if (f() === 1) x(); if (!(f() === 1)) y();',
		// A split that completes an equality decision on two or more values belongs to `prefer-switch`.
		'function f() { if (x === 1) return; if (x === 2) a(); if (x !== 2) b(); }',
	],
	invalid: [
		// Both tests keep their other operands, and the first branch gets braces so that the `else` binds to the outer `if`.
		{
			code: 'function g() { const t = f(); if (t && a) x(); if (!t && !b) y(); }',
			output: 'function g() { const t = f(); if (t) { if (a) x(); } else if (!b) y(); }',
			errors: on('t'),
		},
		// Whole tests merge, keeping both blocks as they are.
		{
			code: 'const a = f(); if (a) { x(); } if (!a) { y(); }',
			output: 'const a = f(); if (a) { x(); } else { y(); }',
			errors: on('a'),
		},
		// A `let` variable that is never reassigned cannot change either.
		{
			code: 'namespace N { let a = f(); if (a) x(); if (!a) y(); }',
			output: 'namespace N { let a = f(); if (a) { x(); } else y(); }',
			errors: on('a'),
		},
		// A comparison of a parameter that is never reassigned merges on the positive comparison, which `!` can negate, ...
		{
			code: 'function g(k: number) { if (k === 1) x(); if (!(k === 1)) y(); }',
			output: 'function g(k: number) { if (k === 1) { x(); } else y(); }',
			errors: on('k === 1'),
		},
		// ... like it can negate a negation.
		{
			code: 'const a = f(); if (!a) x(); if (!!a) y();',
			output: 'const a = f(); if (!a) { x(); } else y();',
			errors: on('!a'),
		},
		// Negated numbers and `undefined` compare like literals.
		{
			code: 'function g(k: number) { if (k === -1) x(); if (k !== -1) y(); }',
			output: 'function g(k: number) { if (k === -1) { x(); } else y(); }',
			errors: on('k === -1'),
		},
		{
			code: 'function g(k?: number) { if (k === undefined) x(); if (k !== undefined) y(); }',
			output: 'function g(k?: number) { if (k === undefined) { x(); } else y(); }',
			errors: on('k === undefined'),
		},
		// A member cannot change when the first consequent always exits, because the second test then never runs after it.
		{
			code: 'function g(o: Door) { if (o.ready) { log(o); return 1; } if (!o.ready) return 2; }',
			output: 'function g(o: Door) { if (o.ready) { log(o); return 1; } else return 2; }',
			errors: on('o.ready'),
		},
		// The same holds for a comparison of a member.
		{
			code: 'function g(o: Door) { if (o.k === 1) return 1; if (o.k !== 1) return 2; }',
			output: 'function g(o: Door) { if (o.k === 1) { return 1; } else return 2; }',
			errors: on('o.k === 1'),
		},
		// The positive branch comes first, so the merge reorders the statements.
		{
			code: 'function g(o: Door) { if (!o.ready) return 1; if (o.ready) return 2; }',
			output: 'function g(o: Door) { if (o.ready) { return 2; } else return 1; }',
			errors: on('o.ready'),
		},
		// Nor when the rest of the first test and its consequent only read values.
		{
			code: 'function g(o: Door) { if (o.ready && o.size > 0) { const half = o.size / 2; } if (!o.ready) y(); }',
			output: 'function g(o: Door) { if (o.ready) { if (o.size > 0) { const half = o.size / 2; } } else y(); }',
			errors: on('o.ready'),
		},
		{
			code: 'function g(o: Door) { if (o.ready); if (!o.ready) y(); }',
			output: 'function g(o: Door) { if (o.ready) { ; } else y(); }',
			errors: on('o.ready'),
		},
		inertBranch(`\`\${o.size}\``),
		inertBranch('o.items[0]'),
		inertBranch('-o.size'),
		inertBranch('o.size ?? 0'),
		inertBranch('o.open ? o.size : 0'),
		inertBranch('o.items?.length'),
		// A loop runs the iterator protocol, which can change the member.
		{
			code: 'function g(o: Door) { if (o.ready) for (const item of o.items) {} if (!o.ready) y(); }',
			errors: snapshot({
				condition: 'o.ready',
				name: 'ready',
				output: 'function g(o: Door) { const ready = o.ready;\nif (ready) { for (const item of o.items) {} } else y(); }',
			}),
		},
		// A member of a variable that may change can change too.
		{
			code: 'if (o.ready) x(); if (!o.ready) y();',
			errors: snapshot({
				condition: 'o.ready',
				name: 'ready',
				output: 'const ready = o.ready;\nif (ready) { x(); } else y();',
			}),
		},
		// The exporting module can change an imported binding.
		{
			code: "import { a } from 'm'; if (a) x(); if (!a) y();",
			errors: unsuggested('a'),
		},
		// The first consequent reassigns the `let` variable, and an identifier has no other name to snapshot it under.
		{
			code: 'switch (n) { case 1: let a = f(); if (a) a = g(); if (!a) y(); }',
			errors: unsuggested('a'),
		},
		// A call can change the member, so the suggestion snapshots it on its own line at the same indentation.
		{
			code: 'class K {\n\tstatic {\n\t\tif (this.ready) x();\n\t\tif (!this.ready) y();\n\t}\n}',
			errors: snapshot({
				condition: 'this.ready',
				name: 'ready',
				output: 'class K {\n\tstatic {\n\t\tconst ready = this.ready;\n\t\tif (ready) { x(); } else y();\n\t}\n}',
			}),
		},
		// Neither does a comparison.
		{
			code: 'let k = f(); if (k === 1) k = 2; if (k !== 1) y();',
			errors: unsuggested('k === 1'),
		},
		// The name would shadow a binding in scope, ...
		{
			code: 'function g(o: Door, ready: boolean) { if (o.ready) x(); if (!o.ready) y(); }',
			errors: unsuggested('o.ready'),
		},
		// ... or capture a global that the scope reads.
		{
			code: 'function g(o: Door) { if (o.ready) ready(); if (!o.ready) y(); }',
			errors: unsuggested('o.ready'),
		},
		// The merge would skip the call that runs before the split.
		{
			code: 'const a = f(); if (g() && a) x(); if (!a) y();',
			output: null,
			errors: on('a'),
		},
		// Parentheses group the split with the next operand.
		{
			code: 'const a = f(); if ((a && b) && c) x(); if (!a) y();',
			output: null,
			errors: on('a'),
		},
		// The merge would drop the comment next to the split, whether the test has further operands or not.
		{
			code: 'const a = f(); if (a /* why */ && b) x(); if (!a) y();',
			output: null,
			errors: on('a'),
		},
		{
			code: 'const a = f(); if (a /* why */) x(); if (!a) y();',
			output: null,
			errors: on('a'),
		},
		// A comment between the statements stays before the `else`.
		{
			code: 'const a = f();\nif (a) x();\n// otherwise\nif (!a) y();',
			output: 'const a = f();\nif (a) { x(); }\n// otherwise\nelse y();',
			errors: on('a'),
		},
		// A reported pair does not start another pair.
		{
			code: 'const a = f(); if (a) x(); if (!a) y(); if (a) z();',
			output: 'const a = f(); if (a) { x(); } else y(); if (a) z();',
			errors: on('a'),
		},
	],
});

UNTYPED_RULE_TESTER.run('merge-exclusive-branches', eslintRule(MERGE_EXCLUSIVE_BRANCHES), {
	valid: [],
	invalid: [
		{
			code: 'const a = f(); if (a) { x(); } if (!a) { y(); }',
			output: 'const a = f(); if (a) { x(); } else { y(); }',
			errors: on('a'),
		},
	],
});

interface Snapshot {
	condition: string;
	name: string;
	output: string;
}

/** A split on `o.ready` whose first consequent only declares `const value = <expression>`, which reads members without writing. */
function inertBranch(expression: string) {
	return {
		code: `function g(o: Door) { if (o.ready) { const value = ${expression}; } if (!o.ready) y(); }`,
		output: `function g(o: Door) { if (o.ready) { const value = ${expression}; } else y(); }`,
		errors: on('o.ready'),
	};
}

function on(condition: string) {
	return [{ messageId: 'exclusiveBranches', data: { condition } }];
}

function snapshot({ condition, name, output }: Snapshot) {
	return [
		{
			messageId: 'exclusiveBranchesMayChange',
			data: { condition },
			suggestions: [{ messageId: 'snapshotCondition', data: { condition, name }, output }],
		},
	];
}

function unsuggested(condition: string) {
	return [{ messageId: 'exclusiveBranchesMayChange', data: { condition }, suggestions: [] }];
}
