import type { ESTree } from '@oxlint/plugins';

/** The scalar kind of a literal's value: `string`, `number`, `boolean`, or `bigint`, or `null` for `null` and regular expressions. */
export function scalarKindOf(value: string | number | boolean | bigint | RegExp | null) {
	const kind = typeof value;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- A literal holds no `symbol`, `undefined`, or function, and its `object` kind (`null` or a regular expression) is no scalar, so `default` covers them.
	switch (kind) {
		case 'string':
		case 'number':
		case 'boolean':
		case 'bigint':
			return kind;
		default:
			return null;
	}
}

/** The value of a negated number literal, such as `-1`, or `null` for any other expression. */
export function negatedNumber(node: ESTree.Expression) {
	return node.type === 'UnaryExpression' &&
		node.operator === '-' &&
		node.argument.type === 'Literal' &&
		typeof node.argument.value === 'number'
		? -node.argument.value
		: null;
}
