import type { ESTree } from '@oxlint/plugins';

/**
 * Whether a member is the callee of a call or the tag of a tagged template, so that it reads a method. Expects the
 * outermost wrapper around the member (see `outermostWrapper`).
 */
export function isCallee(wrapper: ESTree.Node) {
	const { parent } = wrapper;
	return (
		(parent?.type === 'CallExpression' && parent.callee === wrapper) ||
		(parent?.type === 'TaggedTemplateExpression' && parent.tag === wrapper)
	);
}

/**
 * The outermost of the TypeScript assertions around an identifier (see `outermostWrapper`), or the identifier itself
 * when none wraps it. An optional chain never wraps a bare identifier.
 */
export function outermostUse(identifier: ESTree.Node) {
	const { parent } = identifier;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only TypeScript assertions wrap an identifier without changing its value, so `default` covers the rest.
	switch (parent?.type) {
		case 'TSNonNullExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return outermostWrapper(parent);
		default:
			return identifier;
	}
}

/** Whether a name starts a type query, as `x` in `typeof x` or `typeof x.y`. */
export function isTypeQueryName(name: ESTree.Node) {
	let node = name;
	while (node.parent?.type === 'TSQualifiedName' && node.parent.left === node) node = node.parent;
	return node.parent?.type === 'TSTypeQuery';
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
