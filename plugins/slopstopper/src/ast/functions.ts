import type { ESTree } from '@oxlint/plugins';

/** Whether a node is a function that can have a block body: a function declaration, a function expression, or an arrow function. */
export function isFunction(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the three function kinds have a block body, so `default` covers the rest.
	switch (node.type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return true;
		default:
			return false;
	}
}
