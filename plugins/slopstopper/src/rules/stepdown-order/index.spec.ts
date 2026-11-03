import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { STEPDOWN_ORDER } from './index.ts';

OXLINT_RULE_TESTER.run('stepdown-order', STEPDOWN_ORDER, {
	valid: [
		{
			name: 'mutual recursion',
			code: 'function isEven(n: number): boolean { return n === 0 || isOdd(n - 1); }\nfunction isOdd(n: number): boolean { return n !== 0 && isEven(n - 1); }',
		},
		{
			name: 'type position does not count as a use',
			code: 'function helper() { return 1; }\nfunction caller(value: ReturnType<typeof helper>) { return value; }',
		},
		{
			name: 'type reference with the same name does not count as a use',
			code: 'function helper() {}\ninterface helper { value: number }\nfunction caller(value: helper) { return value; }',
		},
		{
			name: 'this inside a nested function does not count',
			code: 'class Box { step() {} run() { return function inner(this: Box) { this.step(); }; } }',
		},
		{
			name: 'this inside a nested class does not count for the outer class',
			code: 'class Outer { step() {} run() { return class Inner { go() { this.step(); } step() {} }; } }',
		},
		{
			name: 'this inside a computed field key does not count',
			code: 'class Box { step() { return 1; } [this.step()] = 1; }',
		},
		{
			name: 'instance access does not match a static method',
			code: 'class Box { static step() {} run() { this.step(); } }',
		},
		{
			name: 'computed access does not count',
			code: "class Box { step() {} run() { this['step'](); } }",
		},
		{
			name: 'bare this does not count',
			code: 'class Box { step() {} run() { return use(this); } }',
		},
		{
			name: 'this inside a nested function declaration does not count',
			code: 'class Box { step() {} run() { return inner; function inner(this: Box) { this.step(); } } }',
		},
		{
			name: 'this outside a class does not count',
			code: 'function step() {}\nconst run = () => this.step();',
		},
		{
			name: 'class name outside the class body does not count',
			code: 'class Box { static step() {} static run() {} }\nBox.step();',
		},
	],
	invalid: [
		{
			name: 'helper above one of several callers moves below the last one',
			code: 'function first() { helper(); }\nfunction helper() {}\nfunction second() { helper(); }\nfunction third() { helper(); }',
			output: 'function first() { helper(); }\nfunction second() { helper(); }\nfunction third() { helper(); }\nfunction helper() {}',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`helper`', user: '`second`' },
					line: 2,
				},
			],
		},
		{
			name: 'helpers follow their caller depth-first in order of first use',
			code: 'function d() {}\nfunction other() {}\nfunction c() {}\nfunction b() { d(); }\nfunction a() { b(); c(); }',
			output: 'function other() {}\nfunction a() { b(); c(); }\nfunction b() { d(); }\nfunction d() {}\nfunction c() {}',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`d`', user: '`b`' }, line: 1 },
				{ messageId: 'helperAboveUser', data: { helper: '`c`', user: '`a`' }, line: 3 },
				{ messageId: 'helperAboveUser', data: { helper: '`b`', user: '`a`' }, line: 4 },
			],
		},
		{
			name: 'expression statement and default export use a function',
			code: 'function helper() {}\nhelper();\nexport default helper;',
			output: 'helper();\nexport default helper;\nfunction helper() {}',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`helper`', user: 'the statement on line 2' },
				},
			],
		},
		{
			name: 'an export list uses the functions it exports',
			code: 'function helper() {}\nexport { helper };',
			output: 'export { helper };\nfunction helper() {}',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`helper`', user: 'the statement on line 2' },
				},
			],
		},
		{
			name: 'anonymous default class is labeled by line',
			code: 'function helper() { return { a: 1 }; }\nexport default class { a = helper(); }',
			output: 'export default class { a = helper(); }\nfunction helper() { return { a: 1 }; }',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`helper`', user: 'the statement on line 2' },
				},
			],
		},
		{
			name: 'destructuring declaration is labeled by line',
			code: 'function helper() { return { a: 1 }; }\nconst { a } = helper();',
			output: 'const { a } = helper();\nfunction helper() { return { a: 1 }; }',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`helper`', user: 'the statement on line 2' },
				},
			],
		},
		{
			name: 'class declaration uses a function in a field initializer',
			code: 'function helper() { return 1; }\nclass Box { value = helper(); }',
			output: 'class Box { value = helper(); }\nfunction helper() { return 1; }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`Box`' } }],
		},
		{
			name: 'functions settle below their last user between statements',
			code: 'function b() {}\nfunction a() { b(); }\nconst x = a();\nconst y = b();',
			output: 'const x = a();\nfunction a() { b(); }\nconst y = b();\nfunction b() {}',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`b`', user: '`a`' }, line: 1 },
				{ messageId: 'helperAboveUser', data: { helper: '`a`', user: '`x`' }, line: 2 },
			],
		},
		{
			name: 'cycle moves as one block below its outside caller',
			code: 'function isOdd(n: number): boolean { return n !== 0 && isEven(n - 1); }\nfunction isEven(n: number): boolean { return n === 0 || isOdd(n - 1); }\nfunction main() { return isEven(4); }',
			output: 'function main() { return isEven(4); }\nfunction isOdd(n: number): boolean { return n !== 0 && isEven(n - 1); }\nfunction isEven(n: number): boolean { return n === 0 || isOdd(n - 1); }',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`isEven`', user: '`main`' },
					line: 2,
				},
			],
		},
		{
			name: 'comments directly above and trailing a function move with it',
			code: '/** Helps. */\nfunction helper() {}\n\n// Section.\n\n/** Calls. */\n// Line.\nfunction caller() { helper(); } // Trailing.',
			output: '/** Calls. */\n// Line.\nfunction caller() { helper(); } // Trailing.\n\n// Section.\n\n/** Helps. */\nfunction helper() {}',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'comment that trails the previous statement stays with it',
			code: 'const value = 1; // Value.\nfunction helper() {}\nfunction caller() { helper(); }',
			output: 'const value = 1; // Value.\nfunction caller() { helper(); }\nfunction helper() {}',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'comment between a function and the next statement on one line blocks the fix',
			code: 'function helper() {} /* Shared. */ const value = 1;\nfunction caller() { helper(); }',
			output: null,
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'detached overload signature blocks the fix',
			code: 'function helper(value: number): void;\nconst value = 1;\nfunction helper(value: number) { return value; }\nfunction caller() { helper(value); }',
			output: null,
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'repeated function name blocks the fix',
			code: 'function helper() { return 1; }\nfunction caller() { return helper(); }\nfunction helper() { return 2; }',
			output: null,
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'nested scopes are fixed independently in successive passes',
			code: 'function helper() {}\nfunction caller() {\n\thelper();\n\treturn inner();\n\tfunction leaf() {}\n\tfunction inner() { leaf(); }\n}',
			output: 'function caller() {\n\thelper();\n\treturn inner();\n\tfunction inner() { leaf(); }\n\tfunction leaf() {}\n}\nfunction helper() {}',
			recursive: true,
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
				{ messageId: 'helperAboveUser', data: { helper: '`leaf`', user: '`inner`' } },
			],
		},
		{
			name: 'block in a module moves functions across other statements',
			code: 'if (Math.random() > 0.5) {\n\tfunction leaf() {}\n\tconsole.log(1);\n\tfunction inner() { leaf(); }\n\tinner();\n}',
			output: 'if (Math.random() > 0.5) {\n\tconsole.log(1);\n\tinner();\n\tfunction inner() { leaf(); }\n\tfunction leaf() {}\n}',
			languageOptions: { sourceType: 'module' },
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`leaf`', user: '`inner`' } },
				{
					messageId: 'helperAboveUser',
					data: { helper: '`inner`', user: 'the statement on line 5' },
				},
			],
		},
		{
			name: 'block in a sloppy script keeps functions on their side of other statements',
			code: 'if (Math.random() > 0.5) {\n\tfunction leaf() {}\n\tconsole.log(1);\n\tfunction inner() { leaf(); }\n\tinner();\n}',
			output: null,
			languageOptions: { sourceType: 'script' },
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`leaf`', user: '`inner`' } },
				{
					messageId: 'helperAboveUser',
					data: { helper: '`inner`', user: 'the statement on line 5' },
				},
			],
		},
		{
			name: 'functions inside a namespace',
			code: 'namespace Space {\n\tfunction helper() {}\n\texport function caller() { helper(); }\n}',
			output: 'namespace Space {\n\texport function caller() { helper(); }\n\tfunction helper() {}\n}',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
			],
		},
		{
			name: 'namespace keeps functions on their side of other statements',
			code: 'namespace Space {\n\tfunction helper() { return 1; }\n\texport const value = helper();\n}',
			output: null,
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`value`' } },
			],
		},
		{
			name: 'functions inside a static block',
			code: 'class Box { static {\n\tfunction helper() {}\n\tfunction caller() { helper(); }\n\tcaller();\n} }',
			output: 'class Box { static {\n\tcaller();\n\tfunction caller() { helper(); }\n\tfunction helper() {}\n} }',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`helper`', user: '`caller`' } },
				{
					messageId: 'helperAboveUser',
					data: { helper: '`caller`', user: 'the statement on line 4' },
				},
			],
		},
		{
			name: 'field initializer uses a method',
			code: 'class Box { step() { return 1; } value = this.step(); }',
			output: 'class Box { value = this.step(); step() { return 1; } }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`value`' } }],
		},
		{
			name: 'static block uses a static method',
			code: 'class Box { static step() {} static { this.step(); } }',
			output: 'class Box { static { this.step(); } static step() {} }',
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`step`', user: 'the static block on line 1' },
				},
			],
		},
		{
			name: 'two helpers above one caller follow it in order of use',
			code: 'class Box { jump() {} step() {} run() { this.step(); this.jump(); } }',
			output: 'class Box { run() { this.step(); this.jump(); } step() {} jump() {} }',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`jump`', user: '`run`' } },
				{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } },
			],
		},
		{
			name: 'overloaded method moves with its signatures and is reported once',
			code: 'class Box { step(): void; step() {} run() { this.step(); } }',
			output: 'class Box { run() { this.step(); } step(): void; step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'index signature and abstract method stay in place',
			code: 'abstract class Box { step() {} [key: string]: unknown; abstract go(): void; run() { this.step(); } }',
			output: 'abstract class Box { [key: string]: unknown; abstract go(): void; run() { this.step(); } step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'private method above its caller',
			code: 'class Box { #step() {} run() { this.#step(); } }',
			output: 'class Box { run() { this.#step(); } #step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`#step`', user: '`run`' } }],
		},
		{
			name: 'static method via this above its caller',
			code: 'class Box { static step() {} static run() { this.step(); } }',
			output: 'class Box { static run() { this.step(); } static step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'this inside a nested arrow counts',
			code: 'class Box { step() {} run() { return [1].map(() => this.step()); } }',
			output: 'class Box { run() { return [1].map(() => this.step()); } step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'outer class name inside a nested class counts for the outer member',
			code: 'class Outer { static step() {} run() { return class Inner { go() { Outer.step(); } }; } }',
			output: 'class Outer { run() { return class Inner { go() { Outer.step(); } }; } static step() {} }',
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'adjacent getter and setter stay together',
			code: 'class Box { compute() { return 1; } get value() { return this.compute(); } set value(next: number) {} }',
			output: 'class Box { get value() { return this.compute(); } set value(next: number) {} compute() { return 1; } }',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`compute`', user: '`value`' } },
			],
		},
		{
			name: 'comment between two members on one line blocks the fix',
			code: 'class Box { step() {} /* Shared. */ run() { this.step(); } }',
			output: null,
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'repeated method name blocks the fix',
			code: 'class Box { step() {} step() {} run() { this.step(); } }',
			output: null,
			// Oxlint rejects duplicate class members in TypeScript.
			languageOptions: { parserOptions: { lang: 'js' } },
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'method named like an accessor pair blocks the fix',
			code: 'class Box { get value() { return 1; } step() {} run() { this.step(); } set value(next) {} value() {} }',
			output: null,
			languageOptions: { parserOptions: { lang: 'js' } },
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'decorated member blocks the fix',
			code: 'class Box { @log step() {} run() { this.step(); } }',
			output: null,
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } }],
		},
		{
			name: 'computed method key blocks the fix',
			code: 'class Box { step() {} [Symbol.iterator]() { this.step(); } }',
			output: null,
			errors: [
				{
					messageId: 'helperAboveUser',
					data: { helper: '`step`', user: '`Symbol.iterator`' },
				},
			],
		},
		{
			name: 'field without a semicolon above a moved method blocks the fix',
			code: 'class Box {\n\t*items() {}\n\tvalue = 1\n\trun() { return this.items(); }\n}',
			output: null,
			errors: [{ messageId: 'helperAboveUser', data: { helper: '`items`', user: '`run`' } }],
		},
	],
});

// The typescript-eslint parser gives nodes and tokens a `range` but no `start` or `end`.
UNTYPED_RULE_TESTER.run('stepdown-order', eslintRule(STEPDOWN_ORDER), {
	// A signature without a body is no helper.
	valid: ['declare function helper(): void;\nfunction caller() { helper(); }'],
	invalid: [
		{
			name: 'helpers via this and the class name follow their caller in order of use',
			code: 'class Box { static jump() {} step() {} run() { this.step(); Box.jump(); } }',
			output: 'class Box { run() { this.step(); Box.jump(); } step() {} static jump() {} }',
			errors: [
				{ messageId: 'helperAboveUser', data: { helper: '`jump`', user: '`run`' } },
				{ messageId: 'helperAboveUser', data: { helper: '`step`', user: '`run`' } },
			],
		},
	],
});
