import { defineRule, type ESTree, type Reference, type SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { assertNotNull } from '#assert.ts';
import { unwrap } from '#ast/discriminant.ts';
import { enclosingFunction } from '#ast/functions.ts';
import { methodName, methodTarget } from '#ast/known-arrays.ts';
import { outermostWrapper } from '#ast/members.ts';
import { variableMethodOf } from '#ast/tanstack-mutations.ts';

/**
 * Reports a use of a TanStack Query mutation's `mutateAsync` in favor of `mutate` with its callbacks, which handle the
 * outcome and never reject. A use inside a `Promise` combinator is exempt, because concurrent mutations need the
 * promises. There is no rewrite: moving the code after an `await` into callbacks is a restructuring.
 */
export const NO_STANDALONE_MUTATE_ASYNC = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow `mutateAsync` of a TanStack Query mutation outside of concurrent mutations in a `Promise` combinator.',
		},
		messages: {
			standalone:
				'Call `mutate` and handle the outcome in its callbacks. Use `mutateAsync` only for concurrent mutations inside a `Promise` combinator such as `Promise.all`.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;

		return {
			Program() {
				const { scopes, globalScope } = sourceCode.scopeManager;
				// Each variable is traced once, and only the references of one that holds `mutateAsync` are checked.
				for (const { variables } of scopes) {
					for (const variable of variables) {
						const { references } = variable;
						if (
							references.length > 0 &&
							variableMethodOf(sourceCode, variable) === 'mutateAsync'
						) {
							for (const reference of references) checkRead(reference);
						}
					}
				}
				// An unresolved reference reads the method of its own name.
				const { through } = assertNotNull(globalScope);
				for (const reference of through) {
					if (reference.identifier.name === 'mutateAsync') checkRead(reference);
				}
			},
			MemberExpression(node) {
				if (methodName(node) !== 'mutateAsync') return;
				const wrapper = outermostWrapper(node);
				if (isAssigned(wrapper)) return;
				check(node, wrapper);
			},
		};

		/**
		 * Checks a reference to `mutateAsync` when it reads the value, rather than writing it or naming it in a type
		 * query, as in `typeof x`.
		 */
		function checkRead(reference: Reference) {
			const { identifier } = reference;
			if (reference.isRead() && !isTypeQueryName(identifier)) {
				check(identifier, outermostUse(identifier));
			}
		}

		/**
		 * Reports a use of `mutateAsync` unless it initializes an alias or runs concurrently. Expects the outermost
		 * wrapper around the use.
		 */
		function check(node: ESTree.Node, wrapper: ESTree.Node) {
			if (isAliasInitializer(wrapper) || isConcurrent(sourceCode, wrapper)) return;
			context.report({ node, messageId: 'standalone' });
		}
	},
});

/** Whether an identifier names a value in a type query, as in `typeof x` or `typeof x.y`. */
function isTypeQueryName({ parent }: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only type queries and their qualified names hold such an identifier, so `default` covers the rest.
	switch (parent?.type) {
		case 'TSTypeQuery':
		case 'TSQualifiedName':
			return true;
		default:
			return false;
	}
}

/**
 * The outermost of the TypeScript assertions around an identifier (see `outermostWrapper`), or the identifier itself
 * when none wraps it. An optional chain never wraps a bare identifier.
 */
function outermostUse(identifier: ESTree.Node) {
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

/** Whether a member is the target of an assignment. Expects the outermost wrapper around the member. */
function isAssigned(wrapper: ESTree.Expression) {
	const { parent } = wrapper;
	return parent.type === 'AssignmentExpression' && parent.left === wrapper;
}

/**
 * Whether an expression initializes a `const` declarator that binds a plain name, whose uses are reported instead.
 * Expects the outermost wrapper around the expression.
 */
function isAliasInitializer(wrapper: ESTree.Node) {
	const { parent } = wrapper;
	return (
		parent?.type === 'VariableDeclarator' &&
		parent.init === wrapper &&
		parent.id.type === 'Identifier' &&
		parent.parent.type === 'VariableDeclaration' &&
		parent.parent.kind === 'const'
	);
}

/**
 * Whether a use of `mutateAsync` runs concurrently with others: its call is an element of an array literal that a
 * `Promise` combinator takes, or a callback of `xs.map` returns its call or is the use itself, where a `Promise`
 * combinator takes the `map` call. Expects the outermost wrapper around the use.
 */
function isConcurrent(sourceCode: SourceCode, wrapper: ESTree.Node) {
	const { parent } = wrapper;
	if (parent?.type === 'CallExpression' && parent.callee === wrapper) {
		return isConcurrentCall(sourceCode, outermostWrapper(parent));
	}
	return isMapCallback(sourceCode, wrapper);
}

/**
 * Whether a call of `mutateAsync` runs concurrently: it is an element of an array literal that a `Promise` combinator
 * takes, or the callback of `xs.map` returns it. Expects the outermost wrapper around the call.
 */
function isConcurrentCall(sourceCode: SourceCode, call: ESTree.Expression) {
	const { parent } = call;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an array literal, an arrow body, and a `return` hold a concurrent call, so `default` covers the rest.
	switch (parent.type) {
		case 'ArrayExpression':
			return isCombinatorArgument(sourceCode, parent);
		case 'ArrowFunctionExpression':
			return parent.body === call && isMapCallback(sourceCode, outermostWrapper(parent));
		case 'ReturnStatement': {
			const callback = enclosingFunction(parent);
			return (
				callback !== null &&
				callback.type !== 'FunctionDeclaration' &&
				isMapCallback(sourceCode, outermostWrapper(callback))
			);
		}
		default:
			return false;
	}
}

/**
 * Whether a node is the callback of an `xs.map` call that a `Promise` combinator takes. Expects the outermost wrapper
 * around the callback.
 */
function isMapCallback(sourceCode: SourceCode, wrapper: ESTree.Node) {
	const { parent } = wrapper;
	if (parent?.type !== 'CallExpression') return false;
	return (
		parent.arguments[0] === wrapper &&
		methodName(parent.callee) === 'map' &&
		isCombinatorArgument(sourceCode, parent)
	);
}

/**
 * Whether an expression is the only argument of `Promise.all`, `Promise.allSettled`, `Promise.race`, or `Promise.any`
 * on the global `Promise`.
 */
function isCombinatorArgument(sourceCode: SourceCode, argument: ESTree.Expression) {
	const wrapper = outermostWrapper(argument);
	const { parent } = wrapper;
	if (parent.type !== 'CallExpression' || onlyElement(parent.arguments) !== wrapper) return false;
	const name = methodName(parent.callee);
	if (name === null || !isCombinator(name)) return false;
	const { object: receiver } = assertNotNull(methodTarget(parent.callee));
	const object = unwrap(receiver);
	return (
		object.type === 'Identifier' &&
		object.name === 'Promise' &&
		sourceCode.isGlobalReference(object)
	);
}

/** Whether a method of `Promise` combines several promises into one. */
function isCombinator(name: string) {
	switch (name) {
		case 'all':
		case 'allSettled':
		case 'race':
		case 'any':
			return true;
		default:
			return false;
	}
}
