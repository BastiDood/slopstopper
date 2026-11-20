import { eslintRule, TYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';

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

const ARRAY_BEFORE_MEMBERS = {
	...ARRAY,
	build: 'up to the spread',
	rest: ', then add the elements that follow',
};

TYPED_RULE_TESTER.run('no-conditional-spread', eslintRule(NO_CONDITIONAL_SPREAD), {
	valid: [],
	invalid: [
		// With type information, a suggestion inserts only keys that the declared type lets an assignment write.
		{
			code: 'declare const c: boolean; const counts: Record<string, number> = { a: 1, ...(c ? { b: 2 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { b: 2 } : {})', condition: 'c' }),
					suggestions: [
						suggestion(
							'counts',
							'declare const c: boolean; const counts: Record<string, number> = { a: 1 };\nif (c) counts.b = 2;',
						),
					],
				},
			],
		},
		// A computed key that is no literal may name a key that the declared type does not let an assignment write.
		{
			code: 'declare const c: boolean; declare const key: string; const counts: Record<string, number> = { a: 1, ...(c ? { [key]: 2 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { [key]: 2 } : {})',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		// A numeric key fits a `number` index signature.
		{
			code: 'declare const c: boolean; const labels: Record<number, string> = { 1: "a", ...(c ? { 2: "b" } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { 2: "b" } : {})',
						condition: 'c',
					}),
					suggestions: [
						suggestion(
							'labels',
							'declare const c: boolean; const labels: Record<number, string> = { 1: "a" };\nif (c) labels[2] = "b";',
						),
					],
				},
			],
		},
		// The base literal narrows a nullable declared type.
		{
			code: 'declare const c: boolean; let names: string[] | undefined = ["a", ...(c ? ["b"] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, { spread: '(c ? ["b"] : [])', condition: 'c' }),
					suggestions: [
						suggestion(
							'names',
							'declare const c: boolean; let names: string[] | undefined = ["a"];\nif (c) names.push("b");',
						),
					],
				},
			],
		},
		// A `readonly` property or index signature refuses the key.
		{
			code: 'interface Props { title: string; readonly summary?: string } declare const c: boolean; const props: Props = { title: "", ...(c ? { summary: "" } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { summary: "" } : {})',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		{
			code: 'declare const c: boolean; const counts: { readonly [key: string]: number } = { a: 1, ...(c ? { b: 2 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { b: 2 } : {})', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		// A union key needs the same type in every member. The base narrows the variable to one member.
		{
			code: 'type T = { k: "a"; n?: number } | { k: "b"; n?: number }; declare const c: boolean; const o: T = { k: "a", ...(c ? { n: 1 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { n: 1 } : {})', condition: 'c' }),
					suggestions: [
						suggestion(
							'o',
							'type T = { k: "a"; n?: number } | { k: "b"; n?: number }; declare const c: boolean; const o: T = { k: "a" };\nif (c) o.n = 1;',
						),
					],
				},
			],
		},
		{
			code: 'type T = { a: number; b?: string } | { a: number; b: number }; declare const c: boolean; const o: T = { a: 1, ...(c ? { b: 2 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { b: 2 } : {})', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		// A union member that takes the key only through an index signature can reject the assigned value.
		{
			code: 'type T = { k: number; a: string } | Record<string, number>; declare const c: boolean; const o: T = { k: 1, ...(c ? { a: "x" } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, {
						spread: '(c ? { a: "x" } : {})',
						condition: 'c',
					}),
					suggestions: [],
				},
			],
		},
		// A spread skips the excess property check that an assignment applies.
		{
			code: 'declare const c: boolean; const point: { a: number } = { a: 1, ...(c ? { b: 2 } : {}) };',
			errors: [
				{
					...temporaryLiteral(OBJECT, { spread: '(c ? { b: 2 } : {})', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		// A read-only array type behind an alias has no `.push`.
		{
			code: 'type Names = readonly string[]; declare const c: boolean; const names: Names = ["a", ...(c ? ["b"] : [])];',
			errors: [
				{
					...temporaryLiteral(ARRAY, { spread: '(c ? ["b"] : [])', condition: 'c' }),
					suggestions: [],
				},
			],
		},
		// A union of array types can leave `.push` taking other elements than the base allows.
		{
			code: 'declare const c: boolean; const xs: number[] | string[] = [1, ...(c ? [2] : []), 3];',
			errors: [
				{
					...temporaryLiteral(ARRAY_BEFORE_MEMBERS, {
						spread: '(c ? [2] : [])',
						condition: 'c',
					}),
					suggestions: [],
				},
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

interface LiteralLabels {
	spread: string;
	condition: string;
}

function temporaryLiteral(collection: Collection, labels: LiteralLabels) {
	return { messageId: 'temporaryLiteral', data: { ...collection, ...labels } };
}

function suggestion(name: string, output: string) {
	return { messageId: 'insertMembers', data: { name }, output };
}
