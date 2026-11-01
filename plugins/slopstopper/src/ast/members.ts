import type { ESTree } from '@oxlint/plugins';

/**
 * Whether a member is the callee of a call or the tag of a tagged template, so that it reads a method. Expects the
 * outermost wrapper around the member (see `outermostWrapper`).
 */
export function isCallee(wrapper: ESTree.Expression) {
	const { parent } = wrapper;
	return (
		(parent.type === 'CallExpression' && parent.callee === wrapper) ||
		(parent.type === 'TaggedTemplateExpression' && parent.tag === wrapper)
	);
}

/**
 * The outermost of the wrappers around an expression that do not change the `this` that a call through them sees, or
 * the expression itself when nothing wraps it.
 */
export function outermostWrapper(node: ESTree.Expression): ESTree.Expression {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (parent.type) {
		case 'ChainExpression':
		case 'TSNonNullExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return outermostWrapper(parent);
		default:
			return node;
	}
}
