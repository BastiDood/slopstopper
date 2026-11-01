import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_ALIAS_OBJECT_TYPE } from './index.ts';

const ERRORS = [{ messageId: 'aliasObjectType' }];

OXLINT_RULE_TESTER.run('no-alias-object-type', NO_ALIAS_OBJECT_TYPE, {
	valid: [
		// A whole literal belongs to `typescript/consistent-type-definitions`, along with the literals inside it.
		'type X = { a: { b: 1 } };',
		// An empty object type has no useful interface to replace it.
		'type X = string & {};',
		// A mapped type is not an object type literal.
		'type X = { [K in keyof T]: T[K] } | null;',
		// An extendable intersection belongs to `needless-type-intersection`.
		'type X = Base & { a: 1 };',
		// Only the alias's type counts, not its type parameters.
		'type X<T extends { a: 1 }> = T[];',
		// Literals outside type aliases are not checked.
		'let x: { a: 1 } | null = null;',
	],
	invalid: [
		// A literal inside a reported literal is not reported again.
		{
			code: 'type X = { a: { b: 1 } } | null;',
			errors: [{ messageId: 'aliasObjectType', data: { alias: 'X' } }],
		},
		// A function type reaches its parameter types through the parameter.
		{ code: 'type X = (a: { b: 1 }) => void;', errors: ERRORS },
		// An intersection that an interface cannot extend.
		{ code: 'type X<T> = T & { a: 1 };', errors: ERRORS },
	],
});

UNTYPED_RULE_TESTER.run('no-alias-object-type', eslintRule(NO_ALIAS_OBJECT_TYPE), {
	valid: [],
	invalid: [{ code: 'type X = { a: 1 } | null;', errors: ERRORS }],
});
