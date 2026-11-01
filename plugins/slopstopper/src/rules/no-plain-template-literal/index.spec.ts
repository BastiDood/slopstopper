import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_PLAIN_TEMPLATE_LITERAL } from './index.ts';

const ERRORS = [{ messageId: 'noPlainTemplateLiteral' }];
const UNFIXED = [{ messageId: 'noPlainTemplateLiteral', suggestions: [] }];

OXLINT_RULE_TESTER.run('no-plain-template-literal', NO_PLAIN_TEMPLATE_LITERAL, {
	valid: [
		'const v = tag`a`;',
		'const v = `a\nb`;',
		// oxlint-disable-next-line eslint/no-template-curly-in-string -- The code under test holds a template.
		'const v = `a${b}`;',
		// The string would spell a placeholder, which `no-template-curly-in-string` reports.
		// oxlint-disable-next-line eslint/no-template-curly-in-string -- The code under test holds a template.
		'const v = `\\${a}`;',
	],
	invalid: [
		{
			code: 'const v = `a`;',
			output: "const v = 'a';",
			errors: [
				{
					messageId: 'noPlainTemplateLiteral',
					data: { template: '`a`', replacement: "'a'" },
				},
			],
		},
		// A type-level template without types is a `TemplateLiteral` inside a `TSLiteralType`, the same type as `'a'`.
		{ code: 'type A = `a`;', output: "type A = 'a';", errors: ERRORS },
		// The raw text keeps its escapes.
		{ code: 'const v = `a\\nb`;', output: String.raw`const v = 'a\nb';`, errors: ERRORS },
		// A single quote falls back to escaping the cooked value.
		{ code: "const v = `it's\\t`;", output: String.raw`const v = 'it\'s\t';`, errors: ERRORS },
		{ code: 'const v = `\\``;', output: "const v = '`';", errors: ERRORS },
		// A template statement in a directive prologue suggests the quoted directive instead of fixing it.
		{
			code: "function f() { 'use strict'; `use custom`; }",
			output: null,
			errors: [
				{
					messageId: 'templateDirective',
					data: { template: '`use custom`', replacement: "'use custom'" },
					suggestions: [
						{
							messageId: 'quoteDirective',
							output: "function f() { 'use strict'; 'use custom'; }",
						},
					],
				},
			],
		},
		// Past the prologue, or in a block that has none, a quoted string statement is no directive, but it is never fixed.
		{ code: 'f(); `a`;', output: null, errors: UNFIXED },
		{ code: '{ `a`; }', output: null, errors: UNFIXED },
	],
});

UNTYPED_RULE_TESTER.run('no-plain-template-literal', eslintRule(NO_PLAIN_TEMPLATE_LITERAL), {
	valid: [],
	invalid: [{ code: 'const v = `a`;', output: "const v = 'a';", errors: ERRORS }],
});
