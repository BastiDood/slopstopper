import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_UNKNOWN_TYPE_ALIASES } from './index.ts';

OXLINT_RULE_TESTER.run('no-unknown-type-aliases', NO_UNKNOWN_TYPE_ALIASES, {
	valid: [
		'type Alias = string; type UserId = Alias;',
		'type Payload = string | number;',
		// Cyclic aliases end without resolving.
		'type A = B; type B = A;',
	],
	invalid: [
		{ code: 'type Payload = string | unknown;', errors: on('Payload') },
		{
			code: 'type UnknownValue = unknown; type Alias = UnknownValue;',
			errors: on('UnknownValue', 'Alias'),
		},
		{
			code: 'type Payload = string | unknown; type NestedPayload = number | Payload;',
			errors: on('Payload', 'NestedPayload'),
		},
		// A type parameter default stands in for a missing type argument.
		{ code: 'type Box<T = unknown> = T; type Payload = Box;', errors: on('Payload') },
	],
});

UNTYPED_RULE_TESTER.run('no-unknown-type-aliases', eslintRule(NO_UNKNOWN_TYPE_ALIASES), {
	// A type parameter without an argument or a default leaves the alias unexpanded.
	valid: ['type Identity<T> = T; type Payload = Identity;'],
	invalid: [
		{ code: 'type Identity<T> = T; type Payload = Identity<unknown>;', errors: on('Payload') },
	],
});

function on(...aliases: string[]) {
	return aliases.map(alias => ({ messageId: 'unknownAlias', data: { alias } }));
}
