import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_PRIVATE_MODIFIER } from './index.ts';

OXLINT_RULE_TESTER.run('no-private-modifier', NO_PRIVATE_MODIFIER, {
	valid: [
		'class A { protected x = 1; public y = 2; z = 3; }',
		'class A { constructor(private x: number) {} }',
	],
	invalid: [
		// Fields.
		{
			code: 'class A { private /* keep */ x = 1; }',
			output: 'class A { /* keep */ #x = 1; }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; private y = this.x + 1; m() { return this.x + this.y; } }',
			output: 'class A { #x = 1; #y = this.#x + 1; m() { return this.#x + this.#y; } }',
			recursive: true,
			errors: errors('x', 'y'),
		},
		{
			code: 'class A { private accessor x = 1; m() { return this.x; } }',
			output: 'class A { accessor #x = 1; m() { return this.#x; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return { x: this.x }; } }',
			output: 'class A { #x = 1; m() { return { x: this.#x }; } }',
			errors: errors('x'),
		},
		// A plain constructor parameter is no parameter property.
		{
			code: 'class A { private x = 1; constructor(x: number) { this.x = x; } }',
			output: 'class A { #x = 1; constructor(x: number) { this.#x = x; } }',
			errors: errors('x'),
		},
		// Static members.
		{
			code: 'class A { private static readonly x = 1; static m() { return this.x + A.x; } n() { return A.x; } }',
			output: 'class A { static readonly #x = 1; static m() { return this.#x + A.#x; } n() { return A.#x; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private static x = 1; m() { return this.x; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private name = 1; m() { return A.name + this.name; } }',
			output: 'class A { #name = 1; m() { return A.name + this.#name; } }',
			errors: errors('name'),
		},
		{
			code: 'const A = class { private static x = 1; m() { return A.x; } };',
			output: null,
			errors: errors('x'),
		},
		// Inside the class, its name binds to the class itself, even when the outer binding is reassigned.
		{
			code: 'class A { private static x = 1; m() { return A.x; } }\nA = B;',
			output: 'class A { static #x = 1; m() { return A.#x; } }\nA = B;',
			errors: errors('x'),
		},
		// Methods.
		{
			code: 'class A { private async load() {} private *items() {} private async *stream() {} }',
			output: 'class A { async #load() {} *#items() {} async *#stream() {} }',
			errors: errors('load', 'items', 'stream'),
		},
		{
			code: 'class A { private f(): void; private f(x: number): void; private f(x?: number) {} m() { this.f(); } }',
			output: 'class A { #f(): void; #f(x: number): void; #f(x?: number) {} m() { this.#f(); } }',
			errors: errors('f', 'f', 'f'),
		},
		{
			code: 'class A { private f(): void; public f(x?: number) {} }',
			output: null,
			errors: errors('f'),
		},
		{
			code: 'class A { private m?(): void; }',
			output: 'class A { #m?(): void; }',
			errors: errors('m'),
		},
		// Accessors.
		{
			code: 'class A { private get v() { return 1; } private set v(x: number) {} m() { this.v = this.v + 1; } }',
			output: 'class A { get #v() { return 1; } set #v(x: number) {} m() { this.#v = this.#v + 1; } }',
			errors: errors('v', 'v'),
		},
		// Destructuring from `this`.
		{
			code: 'class A {\n\tprivate x = 1;\n\tm() {\n\t\tconst { x: alias } = this;\n\t\treturn alias;\n\t}\n}',
			output: 'class A {\n\t#x = 1;\n\tm() {\n\t\tconst alias = this.#x;\n\t\treturn alias;\n\t}\n}',
			errors: errors('x'),
		},
		{
			code: 'class A {\n\tprivate x = 1;\n\ty = 2;\n\tm() {\n\t\tlet { y, x } = this;\n\t\treturn x + y;\n\t}\n}',
			output: 'class A {\n\t#x = 1;\n\ty = 2;\n\tm() {\n\t\tlet { y } = this;\n\t\tlet x = this.#x;\n\t\treturn x + y;\n\t}\n}',
			errors: errors('x'),
		},
		{
			code: 'class A {\r\n\tprivate x = 1;\r\n\ty = 2;\r\n\tm() {\r\n\t\tlet { y, x } = this;\r\n\t}\r\n}',
			output: 'class A {\r\n\t#x = 1;\r\n\ty = 2;\r\n\tm() {\r\n\t\tlet { y } = this;\r\n\t\tlet x = this.#x;\r\n\t}\r\n}',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m(o: { y: number }) { const { y } = o; return this.x + y; } }',
			output: 'class A { #x = 1; m(o: { y: number }) { const { y } = o; return this.#x + y; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; y = 2; z = 3; m() { const { y, x, z } = this } }',
			output: 'class A { #x = 1; y = 2; z = 3; m() { const { y, z } = this const x = this.#x } }',
			errors: errors('x'),
		},
		{
			code: 'class A {\n\tprivate x = 1;\n\tprivate y = 2;\n\tm() {\n\t\tconst { x, y } = this;\n\t}\n}',
			output: 'class A {\n\t#x = 1;\n\t#y = 2;\n\tm() {\n\t\tconst y = this.#y;\n\t\tconst x = this.#x;\n\t}\n}',
			recursive: true,
			errors: errors('x', 'y'),
		},
		{
			code: 'class A { private static x = 1; static { const { x } = this; } }',
			output: 'class A { static #x = 1; static { const x = this.#x; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { const { x = 2 } = this; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; y = 2; m() { const { x, ...rest } = this; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m({ x }: A) {} }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { let x; ({ x } = this); } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { const { x } = this, y = 2; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { for (const { x } = this; x; ) {} } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m(other: A) { const { x } = other; } }',
			output: null,
			errors: errors('x'),
		},
		// Accesses that cannot be proven to target the class's own member.
		{
			code: 'class A { private x = 1; equals(other: A) { return other.x === this.x; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: "class A { private x = 1; m() { return this['x']; } }",
			output: null,
			errors: errors('x'),
		},
		// A key that is no literal can reach every member of the class.
		{
			code: 'class A { private x = 1; private y = 2; m(k: string) { return this[k]; } }',
			output: null,
			errors: errors('x', 'y'),
		},
		{
			code: 'class A { private x = 1; m(k: string) { const { [k]: v } = this; return v; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m(k: string) { return [class { n() { return this[k]; } }, function () { return this[k]; }, this.x]; } }',
			output: 'class A { #x = 1; m(k: string) { return [class { n() { return this[k]; } }, function () { return this[k]; }, this.#x]; } }',
			errors: errors('x'),
		},
		{
			code: "class A { private x = 1; static is(value: object) { return 'x' in value; } }",
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return this?.x; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x?: number; m() { delete this.x; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return function () { return this.x; }; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return () => () => this.x; } }',
			output: 'class A { #x = 1; m() { return () => () => this.#x; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m(this: A) { return this.x; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return class { y = this.x; }; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private static x = 1; m() { return class { y = A.x; }; } }',
			output: 'class A { static #x = 1; m() { return class { y = A.#x; }; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private static x = 1; m() { return class { x = 2; y = A.x; }; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; [this.x] = 2; }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; [this.x]() {} }',
			output: null,
			errors: errors('x'),
		},
		{
			code: "class A { private x = 1; m(): A['x'] { return this.x; } }",
			output: null,
			errors: errors('x'),
		},
		// An index type that is no literal names no member.
		{
			code: 'class A { private x = 1; m(): number[][number] { return this.x; } }',
			output: 'class A { #x = 1; m(): number[][number] { return this.#x; } }',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m(): typeof this.x { return this.x; } }',
			output: null,
			errors: errors('x'),
		},
		// Conflicts.
		{
			code: 'class O { #x = 1; m() { return class A { private x = 1; n(other: O) { return #x in other; } }; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; private static x = 2; }',
			output: null,
			errors: errors('x', 'x'),
		},
		{
			code: 'class A { private x: number; constructor(public x = 1) {} }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { private declare x: number; }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'declare class A { private x: number; }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'declare namespace N { class A { private x: number; } }',
			output: null,
			errors: errors('x'),
		},
		{
			code: 'class A { @dec private x = 1; }',
			output: 'class A { @dec #x = 1; }',
			errors: errors('x'),
		},
		{
			code: "class A { private 'x-y' = 1; private [key] = 2; }",
			output: null,
			errors: errors('x-y', 'key'),
		},
		// Class expressions, nesting, and outside uses.
		{
			code: 'class A { private x = 1; m() { return class B { private y = 2; n() { return this.y; } }; } }',
			output: 'class A { #x = 1; m() { return class B { #y = 2; n() { return this.#y; } }; } }',
			errors: errors('x', 'y'),
		},
		{
			code: 'class A { private x = 1; }\nnew A().x;\nconst o = { x: 1 };\no.x;',
			output: 'class A { #x = 1; }\nnew A().x;\nconst o = { x: 1 };\no.x;',
			errors: errors('x'),
		},
		{
			code: 'class A { private x = 1; m() { return this.x?.toFixed(); } }',
			output: 'class A { #x = 1; m() { return this.#x?.toFixed(); } }',
			errors: errors('x'),
		},
	],
});

UNTYPED_RULE_TESTER.run('no-private-modifier', eslintRule(NO_PRIVATE_MODIFIER), {
	valid: [],
	invalid: [
		// The typescript-eslint parser gives nodes and tokens a `range` but no `start` or `end`.
		{
			code: 'class A { private x = 1; y = 2; m() { const { y, x } = this; return this.x; } }',
			output: 'class A { #x = 1; y = 2; m() { const { y } = this; const x = this.#x; return this.#x; } }',
			errors: errors('x'),
		},
		// The typescript-eslint parser accepts a `private abstract` member, which Oxlint rejects.
		{
			code: 'abstract class A { private abstract x: number; }',
			output: null,
			errors: errors('x'),
		},
	],
});

function errors(...names: string[]) {
	return names.map(name => ({ messageId: 'privateModifier', data: { name } }));
}
