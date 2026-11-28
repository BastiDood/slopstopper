import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_CONDITIONAL_SPREAD } from './index.ts';

const OBJECT = {
	receiver: 'this object',
	collection: 'object',
	members: 'properties',
	insertion: 'assign the optional properties',
	build: 'once',
	rest: '',
};

const ARRAY = {
	receiver: 'this array',
	collection: 'array',
	members: 'elements',
	insertion: 'append the optional elements with `.push`',
	build: 'once',
	rest: '',
};

const ARGUMENTS = {
	receiver: 'these arguments',
	collection: 'argument array',
	members: 'arguments',
	insertion: 'append the optional arguments with `.push`',
	build: 'once',
	rest: '',
};

const OBJECT_BEFORE_MEMBERS = {
	...OBJECT,
	build: 'up to the spread',
	rest: ', then add the properties that follow',
};

const ARRAY_BEFORE_MEMBERS = {
	...ARRAY,
	build: 'up to the spread',
	rest: ', then add the elements that follow',
};

OXLINT_RULE_TESTER.run('no-conditional-spread', NO_CONDITIONAL_SPREAD, {
	valid: [
		// A conditional of two literals has no placeholder.
		'const result = { ...(c ? { a } : { b }) };',
		// A conditional that is not spread allocates the one value it picks.
		'const update = condition ? { value } : {};',
		// A spread of an existing value allocates nothing.
		'const result = { ...(condition ? value : null) };',
		// A value branch that names a `const` spreads an existing value.
		'const extra = { trace: true }; const request = { url, ...(flag ? extra : null) };',
		// `no-non-boolean-logical` reports an `&&` before a literal, an `||` fallback, and an `&&` or `||` value branch.
		'const items = [...(ready && [])];',
		'const items = [...(maybe || [])];',
		'const result = { e, ...(c ? d && { v: 1 } : {}) };',
		// A read in a callback or a loop copies one literal on every run.
		'const extra = verbose ? { stamp: nextId() } : {}; const out = items.map(item => ({ ...item, ...extra }));',
		'const extra = flag ? { trace: true } : {}; for (const item of items) out.push({ ...item, ...extra });',
		'const extra = flag ? { trace: true } : {}; while (next()) out.push({ ...extra });',
		'const extra = flag ? { trace: true } : {}; do out.push({ ...extra }); while (next());',
		'for (const extra = flag ? { trace: true } : {}; more(); step()) use({ ...extra });',
		'const extra = flag ? { trace: true } : {}; for (const key in table) use({ key, ...extra });',
		// An alias of another `const` is not followed further.
		'const inner = c ? { v } : {}; const extra = inner; use({ ...extra });',
		// A placeholder or fallback `const` read in a loop allocates its literal once.
		'const none = {}; for (const item of items) use({ ...item, ...(c ? real : none) });',
		'const EMPTY = []; const all = items.map(item => [...(item.tags ?? EMPTY)]);',
		// A fallback to a non-empty value is a real default.
		'const result = { ...(overrides ?? defaults) };',
		// A binding that is no same-file `const` proves nothing about its value.
		'let extra = condition ? { value } : {}; extra = other; const result = { ...extra };',
		'import { none } from "./none.ts"; const result = { ...(condition ? { value } : none) };',
		// A `const` of an empty literal that other code fills is an owned result, not a placeholder.
		'const defaults: Options = {}; if (flag) defaults.a = 1; const result = { ...(overrides ?? defaults) };',
		// An exported `const` has reads in other modules.
		'export const devTools = isDev ? { trace: true } : {}; export const request = { url, ...devTools };',
		'const devTools = isDev ? { trace: true } : {}; export { devTools }; export const request = { url, ...devTools };',
		// A component template can read the `const` where Oxlint cannot see it.
		{
			code: 'const extra = flag ? { trace: true } : {}; const request = { url, ...extra };',
			filename: 'component.svelte',
		},
		{
			code: 'const extra = flag ? { trace: true } : {}; const request = { url, ...extra };',
			filename: 'page.astro',
		},
		// A followed `const` of a plain literal is left to `unicorn/no-useless-spread`.
		'const extra = { value }; const result = { ...extra };',
		// `unicorn/no-useless-fallback-in-spread` autofixes an object fallback written at the spread.
		'const result = { ...(maybe ?? {}) };',
	],
	invalid: [
		// An empty consequent negates the condition.
		{
			code: 'const result = { ...(condition ? {} : { value }) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '(condition ? {} : { value })',
					condition: '!condition',
				}),
			],
		},
		// The negation puts `!` before the test's own parentheses.
		{
			code: 'const result = { ...((a + b) ? {} : { value }) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '((a + b) ? {} : { value })',
					condition: '!(a + b)',
				}),
			],
		},
		{
			code: 'const result = { title, ...(summary !== undefined ? { summary } : {}) };',
			errors: [
				{
					// A declaration without a type annotation gets no suggestion.
					...temporaryLiteral(OBJECT, {
						spread: '(summary !== undefined ? { summary } : …',
						condition: 'summary !== undefined',
					}),
					suggestions: [],
				},
			],
		},
		// An empty placeholder is a temporary literal of its own.
		{
			code: 'const result = { ...(condition ? value : {}) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '(condition ? value : {})',
					condition: 'condition',
				}),
			],
		},
		// `null` and `undefined` are placeholders too.
		{
			code: 'const result = { ...(condition ? { value } : null) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '(condition ? { value } : null)',
					condition: 'condition',
				}),
			],
		},
		{
			code: 'const result = { ...(condition ? { value } : undefined) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '(condition ? { value } : undefined)',
					condition: 'condition',
				}),
			],
		},
		// An array receives the same placeholders.
		{
			code: 'const tags = [...base, ...(condition ? [tag] : [])];',
			errors: [
				temporaryLiteral(ARRAY, {
					spread: '(condition ? [tag] : [])',
					condition: 'condition',
				}),
			],
		},
		// A fallback to an empty literal only makes the spread type-check.
		{
			code: 'const items = [...(maybe ?? [])];',
			errors: [
				emptyFallback(ARRAY, {
					spread: '(maybe ?? [])',
					placeholder: '[]',
					value: 'maybe',
				}),
			],
		},
		// Calls and `new` receive the same placeholders through their arguments.
		{
			code: 'new Set(...(c ? [x] : []));',
			errors: [temporaryLiteral(ARGUMENTS, { spread: '(c ? [x] : [])', condition: 'c' })],
		},
		{
			code: 'f(...(condition ? [value] : []));',
			errors: [
				temporaryLiteral(ARGUMENTS, {
					spread: '(condition ? [value] : [])',
					condition: 'condition',
				}),
			],
		},
		// An annotated declaration gets the rewrite as a suggestion.
		{
			code: 'const update: Update = { title, ...(summary !== undefined ? { summary } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(summary !== undefined ? { summary } : …',
						condition: 'summary !== undefined',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif (summary !== undefined) update.summary = summary;',
						),
					],
				},
			],
		},
		{
			code: 'const tags: string[] = [first, ...(verbose ? [extra] : []), last];',
			errors: [
				{
					...temporaryLiteral(ARRAY_BEFORE_MEMBERS, {
						spread: '(verbose ? [extra] : [])',
						condition: 'verbose',
					}),
					suggestions: [
						suggestion(
							'tags',
							'const tags: string[] = [first];\nif (verbose) tags.push(extra);\ntags.push(last);',
						),
					],
				},
			],
		},
		{
			code: 'const tags: string[] = [(log(), first), ...(verbose ? [(log(), extra)] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, {
						spread: '(verbose ? [(log(), extra)] : [])',
						condition: 'verbose',
					}),
					suggestions: [
						suggestion(
							'tags',
							'const tags: string[] = [(log(), first)];\nif (verbose) tags.push((log(), extra));',
						),
					],
				},
			],
		},
		// Object members after the spread would be missing from the base.
		{
			code: 'const request: Request = { ...(verbose ? { trace: true } : {}), url };',
			errors: [
				{
					...temporaryLiteral(OBJECT_BEFORE_MEMBERS, {
						spread: '(verbose ? { trace: true } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// A sole spread of a literal is the autofix of `unicorn/no-useless-spread`.
		{
			code: 'const update: Update = { ...(verbose ? { trace: true } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { trace: true } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// A `readonly` annotation forbids the insertion.
		{
			code: 'const tags: readonly string[] = [first, ...(verbose ? [extra] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, {
						spread: '(verbose ? [extra] : [])',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		{
			code: 'const flags: { readonly [K in Keys]?: boolean } = { a: true, ...(verbose ? { b: true } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { b: true } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// The rewrite would drop an assertion around the spread operand.
		{
			code: 'const update: Update = { title, ...((c ? { t } : {}) as U) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '((c ? { t } : {}) as U)',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		// The rewrite would drop an assertion around the placeholder.
		{
			code: 'const update: Update = { title, ...(c ? { t } : ({} as T)) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { t } : ({} as T))',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		// A base that sets its prototype would run a setter of that prototype on the assignment.
		{
			code: 'const options: Options = { __proto__: defaults, ...(verbose ? { trace: true } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { trace: true } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// An assignment to `__proto__` would set the receiver's prototype.
		{
			code: 'const update: Update = { title, ...(verbose ? { __proto__: p } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { __proto__: p } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// An assignment operand keeps its parentheses in the `if`, as `no-cond-assign` asks.
		{
			code: 'const shape: Shape = { y: 1, ...((value = read()) ? { x: value } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '((value = read()) ? { x: value } : {})',
						condition: '(value = read())',
					}),
					suggestions: [
						suggestion(
							'shape',
							'const shape: Shape = { y: 1 };\nif ((value = read())) shape.x = value;',
						),
					],
				},
			],
		},
		// A moved assignment would chain assignments. An index read would ask for array destructuring.
		{
			code: 'const shape: Shape = { y: 1, ...(flag ? { x: (value = read()) } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(flag ? { x: (value = read()) } : {})',
						condition: 'flag',
					}),
					suggestions: [],
				},
			],
		},
		{
			code: 'const shape: Shape = { y: 1, ...(flag ? { x: list[0] } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(flag ? { x: list[0] } : {})',
						condition: 'flag',
					}),
					suggestions: [],
				},
			],
		},
		// The rewrite would drop a comment between a moved key and its value.
		{
			code: 'const update: Update = { title, ...(verbose ? { t: /* c */ 1 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { t: /* c */ 1 } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// An accessor would run on the assignment.
		{
			code: 'const sized: Sized = { get size() { return 0; }, ...(verbose ? { size: 1 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(verbose ? { size: 1 } : {})',
						condition: 'verbose',
					}),
					suggestions: [],
				},
			],
		},
		// A fallback inserts its left operand, which is no literal.
		{
			code: 'const items: Item[] = [first, ...(run?.items ?? [])];',
			errors: [
				{
					...emptyFallback(ARRAY, {
						spread: '(run?.items ?? [])',
						placeholder: '[]',
						value: 'run?.items',
					}),
					suggestions: [],
				},
			],
		},
		// A quoted key that spells an identifier is written with a dot, as `typescript/dot-notation` asks.
		{
			code: "const update: Update = { title, ...(c ? { 's': s, 'd-r': 1 } : {}) };",
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: "(c ? { 's': s, 'd-r': 1 } : {})",
						condition: 'c',
					}),
					suggestions: [
						suggestion(
							'update',
							"const update: Update = { title };\nif (c) {\n\tupdate.s = s;\n\tupdate['d-r'] = 1;\n}",
						),
					],
				},
			],
		},
		// A comma expression keeps its parentheses where it moves.
		{
			code: 'const update: Update = { title, ...(c ? { s: (log(), s) } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { s: (log(), s) } : {})',
						condition: 'c',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif (c) update.s = (log(), s);',
						),
					],
				},
			],
		},
		// The negation of a group is distributed, as `no-negated-group` asks.
		{
			code: 'const update: Update = { title, ...(ready && open ? {} : { s }) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(ready && open ? {} : { s })',
						condition: '!ready || !open',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif (!ready || !open) update.s = s;',
						),
					],
				},
			],
		},
		{
			code: 'const update: Update = { title, ...((p && q) || r ? {} : { s }) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '((p && q) || r ? {} : { s })',
						condition: '(!p || !q) && !r',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif ((!p || !q) && !r) update.s = s;',
						),
					],
				},
			],
		},
		// A case chain keeps its negation as a whole, which `prefer-switch-lookup` turns into a `switch`.
		{
			code: 'const update: Update = { title, ...(k === 1 || k === 2 ? {} : {s}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(k === 1 || k === 2 ? {} : {s})',
						condition: '!(k === 1 || k === 2)',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif (!(k === 1 || k === 2)) update.s = s;',
						),
					],
				},
			],
		},
		{
			code: 'const update: Update = { title, ...((k === 1 || k === 2) && o ? {} : {s}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '((k === 1 || k === 2) && o ? {} : {s})',
						condition: '!(k === 1 || k === 2) || !o',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif (!(k === 1 || k === 2) || !o) update.s = s;',
						),
					],
				},
			],
		},
		// A comma expression keeps its parentheses in the `if` condition and in a computed key.
		{
			code: 'const update: Update = { title, ...((touch(), on) ? {s} : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '((touch(), on) ? {s} : {})',
						condition: '(touch(), on)',
					}),
					suggestions: [
						suggestion(
							'update',
							'const update: Update = { title };\nif ((touch(), on)) update.s = s;',
						),
					],
				},
			],
		},
		{
			code: 'const counts: Counts = { a: 0, ...(c ? { [(f(), k)]: 1 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { [(f(), k)]: 1 } : {})',
						condition: 'c',
					}),
					suggestions: [
						suggestion(
							'counts',
							'const counts: Counts = { a: 0 };\nif (c) counts[(f(), k)] = 1;',
						),
					],
				},
			],
		},
		// A statement that spans lines goes into a block.
		{
			code: 'const options: Options = { name, ...(c ? {\n\tlogger: {\n\t\tlevel,\n\t},\n} : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { logger: { level, }, } : {})',
						condition: 'c',
					}),
					suggestions: [
						suggestion(
							'options',
							'const options: Options = { name };\nif (c) {\n\toptions.logger = {\n\t\tlevel,\n\t};\n}',
						),
					],
				},
			],
		},
		// A `Readonly<T>` annotation forbids the insertion. A method would turn into a plain function property.
		{
			code: 'const shape: Readonly<Shape> = { y: 1, ...(c ? { x: 1 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { x: 1 } : {})', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		{
			code: 'const api: Api = { y: 1, ...(c ? { run() {} } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { run() {} } : {})',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		// A spread among the moved elements, a read-only array, and a value that is no literal get no suggestion.
		{
			code: 'const tags: string[] = [a, ...(c ? [...ys] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, { spread: '(c ? [...ys] : [])', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		{
			code: 'const tags: ReadonlyArray<string> = [a, ...(c ? [x] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, { spread: '(c ? [x] : [])', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		{
			code: 'const update: Update = { t, ...(c ? extra : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? extra : {})', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		// An empty other branch would leave the `if` empty.
		{
			code: 'const update: Update = { title, ...(c ? {} : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? {} : {})', condition: '!c' }),
					suggestions: [],
				},
			],
		},
		// A same-file `const` counts through its initializer. The advice drops it.
		{
			code: 'for (const item of items) { const extra = flag ? { trace: true } : {}; out.push({ ...item, ...extra }); }',
			errors: [
				temporaryLiteral(
					{ ...OBJECT, build: 'once and drop `extra`' },
					{ spread: 'extra', condition: 'flag' },
				),
			],
		},
		{
			code: 'const extra = flag ? [x] : []; for (let i = [...extra].length; i > 0; i--) use(i);',
			errors: [
				temporaryLiteral(
					{ ...ARRAY, build: 'once and drop `extra`' },
					{ spread: 'extra', condition: 'flag' },
				),
			],
		},
		{
			code: 'const extra = flag ? { trace: true } : {}; for (const key in { ...extra }) use(key);',
			errors: [
				temporaryLiteral(
					{ ...OBJECT, build: 'once and drop `extra`' },
					{ spread: 'extra', condition: 'flag' },
				),
			],
		},
		{
			code: 'const extra = flag ? [x] : []; for (const item of [...extra]) use(item);',
			errors: [
				temporaryLiteral(
					{ ...ARRAY, build: 'once and drop `extra`' },
					{ spread: 'extra', condition: 'flag' },
				),
			],
		},
		{
			code: 'const extra = verbose ? [timestamp] : []; log(...extra, message);',
			errors: [
				temporaryLiteral(
					{
						...ARGUMENTS,
						build: 'up to the spread and drop `extra`',
						rest: ', then add the arguments that follow',
					},
					{ spread: 'extra', condition: 'verbose' },
				),
			],
		},
		// A placeholder or fallback can name a `const` of an empty literal, also inside a followed initializer.
		{
			code: 'const none = {}; const extra = c ? { v } : none; use({ ...extra });',
			errors: [
				temporaryLiteral(
					{ ...OBJECT, build: 'once and drop `extra`' },
					{ spread: 'extra', condition: 'c' },
				),
			],
		},
		{
			// The rewrite would leave the placeholder `const` unread.
			code: 'const none: Options = {}; const result: Options = { x, ...(condition ? { value } : none) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(condition ? { value } : none)',
						condition: 'condition',
					}),
					suggestions: [],
				},
			],
		},
		{
			code: 'const EMPTY = [] as const; const tags = [...(maybe ?? EMPTY)];',
			errors: [
				emptyFallback(ARRAY, {
					spread: '(maybe ?? EMPTY)',
					placeholder: 'EMPTY',
					value: 'maybe',
				}),
			],
		},
		// A literal written in the other branch is temporary even when the placeholder `const` is not.
		{
			code: 'const none = {}; for (const item of items) use({ ...item, ...(c ? { v } : none) });',
			errors: [temporaryLiteral(OBJECT, { spread: '(c ? { v } : none)', condition: 'c' })],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-conditional-spread', eslintRule(NO_CONDITIONAL_SPREAD), {
	valid: [],
	invalid: [
		{
			code: 'const result = { ...(condition ? { value } : {}) };',
			errors: [
				temporaryLiteral(OBJECT, {
					spread: '(condition ? { value } : {})',
					condition: 'condition',
				}),
			],
		},
	],
});

interface Collection {
	receiver: string;
	collection: string;
	members: string;
	insertion: string;
	build: string;
	rest: string;
}

interface SpreadLabels {
	spread: string;
}

interface LiteralLabels extends SpreadLabels {
	condition: string;
}

interface FallbackLabels extends SpreadLabels {
	placeholder: string;
	value: string;
}

function temporaryLiteral(collection: Collection, labels: LiteralLabels) {
	return { messageId: 'temporaryLiteral', data: { ...collection, ...labels } };
}

function emptyFallback(collection: Collection, labels: FallbackLabels) {
	return { messageId: 'emptyFallback', data: { ...collection, ...labels } };
}

function suggestion(name: string, output: string) {
	return { messageId: 'insertMembers', data: { name }, output };
}
