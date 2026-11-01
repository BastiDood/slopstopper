import { defineRule, type ESTree, type SourceCode, type Variable } from '@oxlint/plugins';

import { messageLabel } from '#ast/labels.ts';

/**
 * Reports a catch clause that neither handles nor rethrows the caught error, following OpenTelemetry exception
 * recording guidance: the boundary that owns a failure records it once. A catch clause either recovers and records
 * the error here, or rethrows it (unchanged when unexpected, wrapped with `{ cause }` when translated). This covers a
 * swallowed error (bound but unused without a `throw`), an unbound `catch`, and the log and rethrow pattern that
 * records the same failure twice. A `throw` counts when it leaves the catch clause body: not inside a nested function
 * or class, and not inside the `try` block of a nested `try` statement that catches it.
 */
export const HANDLE_OR_RETHROW = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require catch clauses to either handle and record the error once, or rethrow it.',
		},
		messages: {
			unboundCatch:
				'Bind the caught error: an unbound `catch` can neither record the failure nor pass it as a `cause`. Then either recover and record it once here, or rethrow it.',
			swallowed:
				'This catch block discards `{{error}}`. Either recover from it and record it once here, or rethrow it: rethrow unexpected errors unchanged, and wrap expected ones with `{ cause }`.',
			logAndRethrow:
				'`{{call}}` records `{{error}}` and the `throw` rethrows it, so the failure is recorded twice. Rethrow without logging and let the boundary that owns the failure record it, or recover and record it here without rethrowing.',
		},
		schema: [],
	},
	create(context) {
		const throwingClauses = new Set<ESTree.CatchClause>();

		return {
			ThrowStatement(node) {
				addThrowingClauses(throwingClauses, node);
			},
			'CatchClause:exit'(node) {
				const { param } = node;
				if (param === null) {
					context.report({ node, messageId: 'unboundCatch' });
					return;
				}

				const { sourceCode } = context;
				const isThrowing = throwingClauses.delete(node);
				const variables = sourceCode.getDeclaredVariables(node);

				if (isThrowing) {
					const recording =
						param.type === 'Identifier' ? recordingCallOf(node, variables) : null;
					if (recording !== null) {
						const call = messageLabel(sourceCode.getText(recording));
						const error = errorLabel(sourceCode, param);
						context.report({ node, messageId: 'logAndRethrow', data: { call, error } });
					}
				} else if (!isReferenced(variables)) {
					const error = errorLabel(sourceCode, param);
					context.report({ node, messageId: 'swallowed', data: { error } });
				}
			},
		};
	},
});

/** The caught error for a message: the name that the clause binds, or the pattern that destructures it. */
function errorLabel(sourceCode: SourceCode, param: ESTree.BindingPattern) {
	return param.type === 'Identifier' ? param.name : messageLabel(sourceCode.getText(param));
}

/**
 * Adds every catch clause that a `throw` statement leaves, walking outward until a nested function or class, or until
 * the `try` block of a `try` statement that catches the error.
 */
function addThrowingClauses(clauses: Set<ESTree.CatchClause>, statement: ESTree.ThrowStatement) {
	let child: ESTree.Node = statement;
	let current: ESTree.Node | null = statement.parent;
	while (current !== null && !isDeferredBoundary(current.type)) {
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
		switch (current.type) {
			case 'TryStatement':
				if (current.block === child && current.handler !== null) return;
				break;
			case 'CatchClause':
				clauses.add(current);
				break;
			default:
				break;
		}
		child = current;
		current = current.parent;
	}
}

/** Whether code references the caught error at all. */
function isReferenced(variables: readonly Variable[]) {
	return variables.some(({ references }) => references.length > 0);
}

/**
 * The first call that records the caught error by taking it as an argument (see `recordingCall`), or `null` when none
 * does. Expects a clause that binds the error to a plain identifier: only such a binding counts as recorded, because a
 * destructured error forwards parts of it, not the error itself.
 */
function recordingCallOf(clause: ESTree.CatchClause, variables: readonly Variable[]) {
	for (const { references } of variables) {
		for (const { identifier } of references) {
			const call = recordingCall(clause, identifier);
			if (call !== null) return call;
		}
	}
	return null;
}

/**
 * The call or `new` expression that takes a reference to the caught error directly as an argument in the catch clause
 * body, outside any thrown expression and outside any nested function or class, or `null` when there is none.
 */
function recordingCall(clause: ESTree.CatchClause, identifier: ESTree.Node) {
	let isDirect = true;
	let call: ESTree.Node | null = null;

	for (
		let child = identifier;
		child.parent !== null && child.parent !== clause;
		child = child.parent
	) {
		const current = child.parent;
		if (current.type === 'ThrowStatement' || isDeferredBoundary(current.type)) {
			return null;
		}

		if (isDirect) {
			if (isCallArgument(current, child)) {
				call = current;
				isDirect = false;
			} else if (!isArgumentWrapper(current.type)) {
				isDirect = false;
			}
		}
	}

	return call;
}

/** Whether `node` is a call or `new` expression that takes its child `child` as an argument instead of as its callee. */
function isCallArgument(node: ESTree.Node, child: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (node.type) {
		case 'CallExpression':
		case 'NewExpression':
			return node.callee !== child;
		default:
			return false;
	}
}

/** Whether a node type starts code that does not run as part of the enclosing catch clause body: nested functions and classes. */
function isDeferredBoundary(type: ESTree.Node['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (type) {
		case 'FunctionDeclaration':
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
		case 'ClassDeclaration':
		case 'ClassExpression':
			return true;
		default:
			return false;
	}
}

/** Whether a node type forwards the caught error unchanged into an enclosing call argument, as in `logger.error({ error })`. */
function isArgumentWrapper(type: ESTree.Node['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (type) {
		case 'ObjectExpression':
		case 'Property':
		case 'ArrayExpression':
		case 'SpreadElement':
		case 'TemplateLiteral':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
			return true;
		default:
			return false;
	}
}
