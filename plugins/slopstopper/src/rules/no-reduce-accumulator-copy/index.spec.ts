import { eslintRule, UNTYPED_RULE_TESTER } from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_REDUCE_ACCUMULATOR_COPY } from './index.ts';

OXLINT_RULE_TESTER.run('no-reduce-accumulator-copy', NO_REDUCE_ACCUMULATOR_COPY, {
	valid: [
		'items.reduce((acc, item) => Object.assign(acc, item), {});',
		// Copies of values other than the accumulator.
		'items.reduce((acc, item) => { acc.push(Object.assign({}, item)); return acc; }, []);',
		'items.reduce((acc, item) => { acc.push(item.slice()); return acc; }, []);',
		// Nothing proves that the accumulator is an array.
		"items.reduce((acc, item) => acc.concat(item), '');",
		// A third argument means no standard `reduce`.
		'items.reduce((acc, item) => Object.assign({}, acc), {}, extra);',
		'items.map((acc, item) => Object.assign({}, acc));',
		// The nearest function is not the callback.
		'items.reduce((acc, item) => { function copy(acc) { return Object.assign({}, acc); } return acc; }, {});',
		'items.reduce((acc, item) => { const snapshot = () => Object.assign({}, acc); return acc; }, {});',
		// The inner `acc` shadows the accumulator.
		'items.reduce((acc, item) => { { const acc = {}; Object.assign({}, acc); } return acc; }, {});',
		// `Object` and `Array` are not the globals.
		'const Object = custom; items.reduce((acc, item) => Object.assign({}, acc), {});',
		'const Array = custom; items.reduce((acc, item) => Array.from(acc), []);',
		// A reassigned alias proves nothing.
		'items.reduce((acc, item) => { let alias = acc; alias = item; return Object.assign({}, alias); }, {});',
	],
	invalid: [
		{
			code: 'items.reduce(function (acc, item) { return Object.assign({}, item, acc); }, {});',
			errors: on('objectCopy', { call: 'Object.assign({}, item, acc)' }),
		},
		{
			code: "items['reduce'](((acc, item) => Object['assign']({}, acc, item)), {});",
			errors: on('objectCopy', { call: "Object['assign']({}, acc, item)" }),
		},
		{
			code: 'items.reduce((acc = {}, item) => Object.assign({}, acc, item), {});',
			errors: on('objectCopy', { call: 'Object.assign({}, acc, item)' }),
		},
		{
			code: 'items.reduce((acc, item) => { const alias = acc; return Object.assign({}, alias, item); }, {});',
			errors: on('objectCopy', { call: 'Object.assign({}, alias, item)' }),
		},
		{
			code: 'items.reduce((acc, item) => Object.assign({}, acc as State, item), {});',
			errors: on('objectCopy', { call: 'Object.assign({}, acc as State, item)' }),
		},
		{
			code: "items.reduceRight((acc, item, index) => acc['concat']([item]), [] as Item[]);",
			errors: on('arrayMethodCopy', {
				call: "acc['concat']([item])",
				reducer: 'reduceRight',
				mutator: 'push',
			}),
		},
		{
			code: 'items.reduce((acc, item) => { const alias = acc; return alias.concat(item); }, []);',
			errors: on('arrayMethodCopy', { call: 'alias.concat(item)', mutator: 'push' }),
		},
		{
			code: 'const initial = []; items.reduce((acc, item) => acc.concat(item), initial);',
			errors: on('arrayMethodCopy', { call: 'acc.concat(item)', mutator: 'push' }),
		},
		{
			code: 'items.reduce((acc, item) => acc.toSpliced(acc.length, 0, item), []);',
			errors: on('arrayMethodCopy', {
				call: 'acc.toSpliced(acc.length, 0, item)',
				mutator: 'splice',
			}),
		},
		{
			code: 'items.reduce((acc, item) => acc.toSorted(), []);',
			errors: on('arrayMethodCopy', { call: 'acc.toSorted()', mutator: 'sort' }),
		},
		{
			code: 'items.reduce((acc, item) => acc.toReversed(), []);',
			errors: on('arrayMethodCopy', { call: 'acc.toReversed()', mutator: 'reverse' }),
		},
		{
			code: 'items.reduce((acc, item) => acc.with(0, item), []);',
			errors: on('withCopy', { call: 'acc.with(0, item)' }),
		},
		{
			code: 'items.reduce((acc, item) => { const next = acc.slice(); next.push(item); return next; }, []);',
			errors: on('arrayCopy', { call: 'acc.slice()' }),
		},
		{
			code: 'items.reduce((acc, item) => { const next = Array.from(acc); next.push(item); return next; }, []);',
			errors: on('arrayCopy', { call: 'Array.from(acc)' }),
		},
	],
});

UNTYPED_RULE_TESTER.run('no-reduce-accumulator-copy', eslintRule(NO_REDUCE_ACCUMULATOR_COPY), {
	valid: [],
	invalid: [
		{
			code: 'items.reduce((acc, item) => Object.assign({}, acc, item), {});',
			errors: on('objectCopy', { call: 'Object.assign({}, acc, item)' }),
		},
	],
});

function on(messageId: string, data: Record<string, string>) {
	return [{ messageId, data: { accumulator: 'acc', reducer: 'reduce', ...data } }];
}
