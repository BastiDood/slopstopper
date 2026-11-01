import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { PREFER_SWITCH } from './index.ts';

OXLINT_RULE_TESTER.run('prefer-switch', PREFER_SWITCH, {
	valid: [
		// Too few cases: an `if` inside an `else` block does not continue the chain.
		'if (x === 1) {} else { if (x === 2) {} }',
		// Tests that do not compare one discriminant with `===`.
		'if (x == 1) {} else if (x == 2) {}',
		'if (x === 1 || y === 2) {} else if (x === 3) {}',
		'if (f() === 1) {} else if (f() === 2) {}',
		'if (a[k] === 1) {} else if (a[k] === 2) {}',
		// Comparisons against `null` and `undefined` guard values instead of naming cases.
		'if (x === undefined) {} else if (x === null) {}',
		// Different member chains.
		'if (a.b === 1) {} else if (a.c === 2) {}',
		// An unlabeled `break` would target the new `switch`.
		'while (true) { if (x === 1) {} else if (x === 2) { if (y) break; } }',
		// A sequence continues only past a consequent that always exits.
		'function f() { if (x === 1) g(); if (x === 2) return; }',
		// A split on one value belongs to `merge-exclusive-branches`.
		'function f() { if (x === 1) return; if (x !== 1) return; g(); }',
		'function f() { if (x === 1 && p) return; if (x !== 1) return; g(); }',
		// A template literal names the same case as the equal string literal.
		"if (x === 'a') {} else if (x === `a`) {}",
	],
	invalid: [
		// A global may change between the tests, so the rewrite is a suggestion. `||` alternatives become stacked cases.
		{
			code: 'if (x === 1 || x === 2) {} else if (x === 3) {}',
			errors: mayChange('x', 'switch (x) {\n\tcase 1:\n\tcase 2:\n\t\tbreak;\n\tcase 3:\n}'),
		},
		{ code: "if ('a' === x) {} else if ('b' === x) {}", errors: mayChange('x') },
		// A test `x === A && <rest>` names case `A`, whose body checks the rest.
		{
			code: 'if (x === 1 && y === 2) {} else if (x === 3 && y === 4) {}',
			errors: mayChange(
				'x',
				'switch (x) {\n\tcase 1:\n\t\tif (y === 2) {}\n\t\tbreak;\n\tcase 3:\n\t\tif (y === 4) {}\n}',
			),
		},
		// A failed rest breaks out of the case, because no later test can hold for the same value.
		{
			code: lines(
				'function f(x: number) {',
				'\tif (x === 1 && p) return 1;',
				'\tif (x === 2 && q) return 2;',
				'\treturn 3;',
				'}',
			),
			output: lines(
				'function f(x: number) {',
				'\tswitch (x) {',
				'\t\tcase 1:',
				'\t\t\tif (p) return 1;',
				'\t\t\tbreak;',
				'\t\tcase 2:',
				'\t\t\tif (q) return 2;',
				'\t}',
				'\treturn 3;',
				'}',
			),
			errors: on('x'),
		},
		{
			code: lines(
				'function f(x: number) {',
				'\tif (x === 1 && p) {',
				'\t\ta();',
				'\t} else if (x === 2) {',
				'\t\tb();',
				'\t}',
				'}',
			),
			output: lines(
				'function f(x: number) {',
				'\tswitch (x) {',
				'\t\tcase 1:',
				'\t\t\tif (p) {',
				'\t\t\t\ta();',
				'\t\t\t}',
				'\t\t\tbreak;',
				'\t\tcase 2:',
				'\t\t\tb();',
				'\t}',
				'}',
			),
			errors: on('x'),
		},
		{
			code: 'function f(x: number) { if (x === 1 && p && q) return 1; if (x === 2) return 2; }',
			output: 'function f(x: number) { switch (x) {\n\tcase 1:\n\t\tif (p && q) return 1;\n\t\tbreak;\n\tcase 2:\n\t\treturn 2;\n} }',
			errors: on('x'),
		},
		// A trailing guard would have to run when a rest fails, so it stays after the `switch`.
		{
			code: lines(
				'function f(x: number) {',
				'\tif (x === 1) return 1;',
				'\tif (x === 2 && p) return 2;',
				'\tif (x !== 3) return 0;',
				'\treturn 3;',
				'}',
			),
			output: lines(
				'function f(x: number) {',
				'\tswitch (x) {',
				'\t\tcase 1:',
				'\t\t\treturn 1;',
				'\t\tcase 2:',
				'\t\t\tif (p) return 2;',
				'\t}',
				'\tif (x !== 3) return 0;',
				'\treturn 3;',
				'}',
			),
			errors: on('x'),
		},
		// A final `else` would also have to run when a rest fails, so there is no rewrite.
		{
			code: 'function f(x: number) { if (x === 1 && p) a(); else if (x === 2) b(); else c(); }',
			output: null,
			errors: [{ messageId: 'preferSwitchConditionalElse', data: { discriminant: 'x' } }],
		},
		// A member chain with static keys is stable. A block that declares a name keeps its braces, and the final `else` becomes `default`.
		{
			code: lines(
				'class A {',
				"\tkind = '';",
				'\tm() {',
				"\t\tif (this.kind === 'a') {",
				'\t\t\tconst y = 1;',
				'\t\t\tg(y);',
				"\t\t} else if (this.kind === 'b') {",
				'\t\t\tg(2);',
				'\t\t} else {',
				'\t\t\tg(3);',
				'\t\t}',
				'\t}',
				'}',
			),
			output: lines(
				'class A {',
				"\tkind = '';",
				'\tm() {',
				'\t\tswitch (this.kind) {',
				"\t\t\tcase 'a': {",
				'\t\t\t\tconst y = 1;',
				'\t\t\t\tg(y);',
				'\t\t\t\tbreak;',
				'\t\t\t}',
				"\t\t\tcase 'b':",
				'\t\t\t\tg(2);',
				'\t\t\t\tbreak;',
				'\t\t\tdefault:',
				'\t\t\t\tg(3);',
				'\t\t}',
				'\t}',
				'}',
			),
			errors: on('this.kind'),
		},
		{
			code: "if (a.b.c === 1) {} else if (a.b['c'] === 2) {}",
			output: 'switch (a.b.c) {\n\tcase 1:\n\t\tbreak;\n\tcase 2:\n}',
			errors: on('a.b.c'),
		},
		{
			code: 'if (a[0] === 1) {} else if (a[0] === 2) {}',
			output: 'switch (a[0]) {\n\tcase 1:\n\t\tbreak;\n\tcase 2:\n}',
			errors: on('a[0]'),
		},
		{
			code: 'if (a?.b === 1) {} else if (a.b === 2) {}',
			output: 'switch (a?.b) {\n\tcase 1:\n\t\tbreak;\n\tcase 2:\n}',
			errors: on('a?.b'),
		},
		{ code: 'if ((x) === 1) {} else if (x! === 2) {}', errors: mayChange('x') },
		{
			code: 'class A extends B { m() { if (super.k === 1) {} else if (super.k === 2) {} } }',
			output: 'class A extends B { m() { switch (super.k) {\n\tcase 1:\n\t\tbreak;\n\tcase 2:\n} } }',
			errors: on('super.k'),
		},
		{
			code: 'class A { #k = 0; m() { if (this.#k === 1) {} else if (this.#k === 2) {} } }',
			output: 'class A { #k = 0; m() { switch (this.#k) {\n\tcase 1:\n\t\tbreak;\n\tcase 2:\n} } }',
			errors: on('this.#k'),
		},
		// Only the leading run that fits counts.
		{
			code: 'if (x === 1) {} else if (x === 2) {} else if (y === 3) {} else {}',
			errors: mayChange('x'),
		},
		// A chain that fails at its head can still start at a later `else if`, whose `switch` gets its own block.
		{
			code: 'if (y) {} else if (x === 1) {} else if (x === 2) {}',
			errors: mayChange(
				'x',
				'if (y) {} else {\n\tswitch (x) {\n\t\tcase 1:\n\t\t\tbreak;\n\t\tcase 2:\n\t}\n}',
			),
		},
		// ... but no rewrite exists when it continues past its chain into the next statement.
		{
			code: 'function f(x: number) { if (y) return 0; else if (x === 1) return 1; if (x === 2) return 2; }',
			output: null,
			errors: on('x'),
		},
		// An `if` outside any statement list, such as a loop body without a block, forms a list of its own.
		{
			code: 'while (o.c) if (o.k === 1) a(); else if (o.k === 2) b();',
			output: 'while (o.c) switch (o.k) {\n\tcase 1:\n\t\ta();\n\t\tbreak;\n\tcase 2:\n\t\tb();\n}',
			errors: on('o.k'),
		},
		// A class declaration in a case body gets a block, like any block-scoped declaration.
		{
			code: 'if (x === 1) { class C {} } else if (x === 2) {}',
			errors: mayChange(
				'x',
				'switch (x) {\n\tcase 1: {\n\t\tclass C {}\n\t\tbreak;\n\t}\n\tcase 2:\n}',
			),
		},
		// Two independent runs in one `if` chain.
		{
			code: 'if (x === 1) {} else if (x === 2) {} else if (y === 1) {} else if (y === 2) {}',
			errors: [...mayChange('x'), ...mayChange('y')],
		},
		// Adjacent `if` statements form a chain when every consequent but the last always exits. The code after the chain stays after the `switch`.
		{
			code: lines(
				'function f(x: number) {',
				'\tif (x === 1) return 1;',
				'\tif (x === 2) return 2;',
				'\treturn 3;',
				'}',
			),
			output: lines(
				'function f(x: number) {',
				'\tswitch (x) {',
				'\t\tcase 1:',
				'\t\t\treturn 1;',
				'\t\tcase 2:',
				'\t\t\treturn 2;',
				'\t}',
				'\treturn 3;',
				'}',
			),
			errors: on('x'),
		},
		{
			code: 'function f() { if (x === 1) throw e; if (x === 2) g(); }',
			errors: mayChange('x'),
		},
		// The chain ends at an `if` with an `else`, or at an exit whose test does not compare the discriminant.
		{
			code: 'function f(x: number) { if (x === 1) return 1; if (x === 2) return 2; if (y) a(); else b(); }',
			output: 'function f(x: number) { switch (x) {\n\tcase 1:\n\t\treturn 1;\n\tcase 2:\n\t\treturn 2;\n} if (y) a(); else b(); }',
			errors: on('x'),
		},
		{
			code: 'function f(x: number) { if (x === 1) return 1; if (x === 2) return 2; if (y) return 3; return 4; }',
			output: 'function f(x: number) { switch (x) {\n\tcase 1:\n\t\treturn 1;\n\tcase 2:\n\t\treturn 2;\n} if (y) return 3; return 4; }',
			errors: on('x'),
		},
		// The case body runs before the complement's test, so the rewrite is a suggestion.
		{
			code: lines(
				'function f(x: number) {',
				'\tif (x === 1) return;',
				'\tif (x === 2) a();',
				'\tif (x !== 2) b();',
				'}',
			),
			errors: mayChange(
				'x',
				lines(
					'function f(x: number) {',
					'\tswitch (x) {',
					'\t\tcase 1:',
					'\t\t\treturn;',
					'\t\tcase 2:',
					'\t\t\ta();',
					'\t\t\tbreak;',
					'\t\tdefault:',
					'\t\t\tb();',
					'\t}',
					'}',
				),
			),
		},
		// A trailing guard adds a case whose body is every later statement, after the rest of the guard's test.
		{
			code: lines(
				'function f(node: Node) {',
				"\tif (node.type === 'Identifier') {",
				'\t\tg();',
				'\t\treturn true;',
				'\t}',
				"\tif (node.type !== 'MemberExpression' || node.property.type === 'PrivateIdentifier') {",
				'\t\treturn false;',
				'\t}',
				'\tconst { object } = node;',
				'\treturn h(object);',
				'}',
			),
			output: lines(
				'function f(node: Node) {',
				'\tswitch (node.type) {',
				"\t\tcase 'Identifier':",
				'\t\t\tg();',
				'\t\t\treturn true;',
				"\t\tcase 'MemberExpression': {",
				"\t\t\tif (node.property.type === 'PrivateIdentifier') {",
				'\t\t\t\treturn false;',
				'\t\t\t}',
				'\t\t\tconst { object } = node;',
				'\t\t\treturn h(object);',
				'\t\t}',
				'\t\tdefault:',
				'\t\t\treturn false;',
				'\t}',
				'}',
			),
			errors: on('node.type'),
		},
		{
			code: 'function f() { if (x === 1) return; if (x !== 2) return; g(); }',
			errors: mayChange('x'),
		},
		// No rewrite exists when parentheses group the guard's case with the rest of its test, ...
		{
			code: 'function f(x: number) { if (x === 1) return 1; if (x === 2) return 2; if ((x !== 3 || a) || b) return 0; g(); }',
			output: null,
			errors: on('x'),
		},
		// ... or when a later statement is a module declaration, which leaves the suggestion nothing to offer.
		{
			code: "if (x === 1) throw a; if (x === 2) throw b; if (x !== 3) throw c; import y from 'y';",
			errors: [
				{
					messageId: 'preferSwitchMayChange',
					data: { discriminant: 'x' },
					suggestions: [],
				},
			],
		},
		// A comment between a test and its consequent would be dropped, so there is no rewrite.
		{
			code: 'function f(x: number) { if (x === 1) /* one */ return 1; if (x === 2) return 2; }',
			output: null,
			errors: on('x'),
		},
		// A `continue` keeps its target.
		{
			code: 'for (const x of xs) { if (x === 1) { continue; } else if (x === 2) {} }',
			output: 'for (const x of xs) { switch (x) {\n\tcase 1:\n\t\tcontinue;\n\tcase 2:\n} }',
			errors: on('x'),
		},
		// A `break` whose target sits inside the branch, or a labeled `break`, keeps its target.
		{
			code: 'if (x === 1) { for (;;) { break; } } else if (x === 2) {}',
			errors: mayChange('x'),
		},
		{
			code: 'outer: for (;;) { if (x === 1) { break outer; } else if (x === 2) {} }',
			errors: mayChange('x'),
		},
	],
});

function lines(...text: string[]) {
	return text.join('\n');
}

function on(discriminant: string) {
	return [{ messageId: 'preferSwitch', data: { discriminant } }];
}

function mayChange(discriminant: string, output?: string) {
	const error = { messageId: 'preferSwitchMayChange', data: { discriminant } };
	if (typeof output === 'undefined') return [error];
	return [
		{
			...error,
			suggestions: [{ messageId: 'rewriteAsSwitch', data: { discriminant }, output }],
		},
	];
}
