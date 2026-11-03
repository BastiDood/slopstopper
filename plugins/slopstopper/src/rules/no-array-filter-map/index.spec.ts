import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_ARRAY_FILTER_MAP } from './index.ts';

OXLINT_RULE_TESTER.run('no-array-filter-map', NO_ARRAY_FILTER_MAP, {
	valid: [
		// Iterator helpers are lazy already.
		'const users = []; users.values().filter(active).map(email).toArray();',
		'function collect(users: IteratorObject<User>) { return users.filter(active).map(email).toArray(); }',
		// Nothing proves that these receivers are arrays.
		'const custom = { filter() { return this; }, map() {} }; custom.filter(active).map(email);',
		'function collect(users) { return users.filter(active).map(email); }',
		'let users = []; users = iterator; users.filter(active).map(email);',
		'const users = []; users[method](active).map(email);',
		// A cycle of aliases proves nothing.
		'const first = second; const second = first; first.filter(active).map(email);',
	],
	invalid: [
		{
			code: 'function collect(users: readonly User[]) { return users.map(email).filter(present); }',
			errors: mapFilter('users'),
		},
		{
			code: 'function collect(users: Array<User>) { return users.filter(active).map(email); }',
			errors: filterMap('users'),
		},
		{
			code: "const users = [] as const; users['filter'](active)['map'](email);",
			errors: filterMap('users'),
		},
		{
			code: 'const users = []; (users.filter(active)!).map(email);',
			errors: filterMap('users'),
		},
		// A copy of a known array is a known array.
		{
			code: 'const users = []; users.slice().filter(active).map(email);',
			errors: filterMap('users.slice()'),
		},
		// Each adjacent pair reports once.
		{
			code: 'const users = []; users.filter(active).map(email).filter(Boolean);',
			errors: [...mapFilter('users.filter(active)'), ...filterMap('users')],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-array-filter-map', eslintRule(NO_ARRAY_FILTER_MAP), {
	valid: [],
	invalid: [{ code: '[].filter(active).map(email);', errors: filterMap('[]') }],
});

function filterMap(receiver: string) {
	return [{ messageId: 'arrayFilterMap', data: { receiver, first: 'filter', second: 'map' } }];
}

function mapFilter(receiver: string) {
	return [{ messageId: 'arrayFilterMap', data: { receiver, first: 'map', second: 'filter' } }];
}
