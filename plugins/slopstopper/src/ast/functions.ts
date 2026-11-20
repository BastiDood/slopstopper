import type { ESTree } from '@oxlint/plugins';

import { outermostWrapper } from '#ast/members.ts';

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

/**
 * The outermost wrapper around the function expression or arrow function that returns an expression as its expression
 * body or through a `return` statement. A caller checks where that callback is passed. Expects the outermost wrapper
 * around the expression (see `outermostWrapper`). Returns `null` when the expression is no return value of such a
 * function. A return from a function declaration gives `null` too. No call takes a declaration as an argument.
 */
export function returnedCallback(wrapper: ESTree.Expression) {
	const { parent } = wrapper;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an expression body or a `return` statement makes a value the return of a function, so `default` covers the rest.
	switch (parent.type) {
		case 'ArrowFunctionExpression':
			return parent.body === wrapper ? outermostWrapper(parent) : null;
		case 'ReturnStatement': {
			const callback = enclosingCallback(parent);
			return callback === null ? null : outermostWrapper(callback);
		}
		default:
			return null;
	}
}

/**
 * The function expression or arrow function that is the nearest function around a node, or `null` when that function
 * is a declaration or no function encloses the node.
 */
export function enclosingCallback(node: ESTree.Node) {
	const callback = enclosingFunction(node);
	return callback?.type === 'FunctionDeclaration' ? null : callback;
}

/**
 * The nearest function around a node: a function declaration, a function expression, or an arrow function, or `null`
 * when no function encloses the node.
 */
export function enclosingFunction(node: ESTree.Node) {
	for (let { parent } = node; parent !== null; { parent } = parent) {
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the three function kinds end the search, so `default` covers the rest.
		switch (parent.type) {
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
				return parent;
			default:
				break;
		}
	}
	return null;
}
