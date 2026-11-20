import type { ESTree, SourceCode } from '@oxlint/plugins';

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

/** Whether an expression without wrappers (see `unwrap`) is `{}` or `[]`. */
export function isEmptyLiteral(node: ESTree.Expression) {
	return isEmptyObject(node) || isEmptyArray(node);
}

/** Whether an expression without wrappers (see `unwrap`) is an empty object literal. */
export function isEmptyObject(node: ESTree.Expression) {
	return node.type === 'ObjectExpression' && node.properties.length === 0;
}

/** Whether an expression without wrappers (see `unwrap`) is an empty array literal. */
export function isEmptyArray(node: ESTree.Expression) {
	return node.type === 'ArrayExpression' && node.elements.length === 0;
}

/** Whether an expression without wrappers (see `unwrap`) is the `null` literal. */
export function isNullLiteral(node: ESTree.Expression) {
	return node.type === 'Literal' && node.value === null && !('regex' in node);
}

/** Whether an expression is the global `undefined` or `void` of a literal, as in `void 0`. */
export function isUndefined(sourceCode: SourceCode, node: ESTree.Expression) {
	return node.type === 'Identifier'
		? node.name === 'undefined' && sourceCode.isGlobalReference(node)
		: node.type === 'UnaryExpression' &&
				node.operator === 'void' &&
				node.argument.type === 'Literal';
}
