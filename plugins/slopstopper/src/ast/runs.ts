import type { ESTree, Reference, Scope } from '@oxlint/plugins';

/**
 * Whether a read evaluates once each time the scope of its variable runs. A read in a nested function can run any
 * number of times. So can a read in a loop inside that scope, as in
 * `const extra = c ? { v } : {}; for (const item of items) out.push({ ...item, ...extra });`.
 */
export function runsOnce({ identifier, from }: Reference, scope: Scope) {
	if (from.variableScope !== scope.variableScope) return false;
	for (
		let child: ESTree.Node = identifier;
		child !== scope.block && child.parent !== null;
		child = child.parent
	) {
		if (repeats(child.parent, child)) return false;
	}
	return true;
}

/**
 * Whether `parent` is a loop that runs `child` on every iteration: any child except a `for` init or a `for…in` or
 * `for…of` iterable. Any other parent runs `child` at most once.
 */
function repeats(parent: ESTree.Node, child: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only loops run a child more than once, so `default` covers the rest.
	switch (parent.type) {
		case 'WhileStatement':
		case 'DoWhileStatement':
			return true;
		case 'ForStatement':
			return parent.init !== child;
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.right !== child;
		default:
			return false;
	}
}
