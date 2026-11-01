import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NEEDLESS_TYPE_INTERSECTION } from './index.ts';

OXLINT_RULE_TESTER.run('needless-type-intersection', NEEDLESS_TYPE_INTERSECTION, {
	valid: [
		// Keyword constituents, such as the primitive of a branded type.
		"type UserId = string & { __brand: 'UserId' };",
		// Type parameters that an interface cannot extend.
		'type X<T> = T & { a: 1 };',
		// The nearest binding wins: a type parameter shadows an outer interface of the same name.
		'interface Base { a: 1 } function f<Base>() { type X = Base & { b: 2 }; }',
		// A constituent that is not an object type literal or a reference.
		"type X = Base & import('./module');",
		// An intersection that is not the alias's top-level type.
		'type X = (Base & { a: 1 }) | null;',
	],
	invalid: [
		needless('type X = Base & { a: 1 };', 'X'),
		needless('type X = ns.Base & { a: 1 };', 'X'),
		needless("type X = import('./module').Base & { a: 1 };", 'X'),
		// A name declared in the file that is not a type parameter.
		needless('interface Base { a: 1 } type X = Base & { b: 2 };', 'X'),
	],
});

function needless(code: string, name: string) {
	return { code, errors: [{ messageId: 'needlessIntersection', data: { name } }] };
}
