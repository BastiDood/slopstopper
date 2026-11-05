import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { unwrap } from '#ast/discriminant.ts';
import { enclosingFunction } from '#ast/functions.ts';
import { methodTarget } from '#ast/known-arrays.ts';
import { outermostWrapper } from '#ast/members.ts';
import { referenceMethodOf } from '#ast/tanstack-mutations.ts';

/**
 * Reports a use of a TanStack Query mutation's `mutateAsync`, as a reference or a call, in favor of `mutate` with its
 * callbacks. A use is a member named `mutateAsync` or an identifier that reads it (see `mutationMethodOf`): a field that
 * a `const` pattern destructures from `useMutation` or `createMutation` under any local name, a `const` alias of one,
 * or an untraced identifier named `mutateAsync`, such as a prop. The destructuring pattern itself and the initializer of
 * a `const` alias, whose own uses are reported, are not uses. Concurrent mutations are exempt: a call that is an element
 * of an array literal, or a call that a callback of `xs.map` returns, or the reference that `xs.map` takes as its
 * callback, where the array or the `map` call is the argument of `Promise.all`, `Promise.allSettled`, `Promise.race`, or
 * `Promise.any` on the global `Promise`. There is no rewrite: moving the code after an `await` into callbacks is a
 * restructuring that the author must do.
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
			Identifier(node) {
				const reference = valueRead(sourceCode, node);
				if (
					reference === null ||
					referenceMethodOf(sourceCode, reference) !== 'mutateAsync'
				) {
					return;
				}
				check(node, outermostUse(node));
			},
			MemberExpression(node) {
				const target = methodTarget(node);
				const wrapper = outermostWrapper(node);
				if (target?.name !== 'mutateAsync' || isAssigned(wrapper)) return;
				check(node, wrapper);
			},
		};

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

/**
 * The reference that an identifier makes when it reads a value, or `null` for a declaration, a write, a type query, or
 * any other identifier that is no reference.
 */
function valueRead(sourceCode: SourceCode, identifier: ESTree.Node) {
	if (isTypeQueryName(identifier)) return null;
	const reference = sourceCode
		.getScope(identifier)
		.references.find(candidate => candidate.identifier === identifier);
	if (typeof reference === 'undefined') return null;
	return reference.isRead() ? reference : null;
}

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
	const target = methodTarget(parent.callee);
	return (
		parent.arguments[0] === wrapper &&
		target?.name === 'map' &&
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
	const target = methodTarget(parent.callee);
	if (target === null || !isCombinator(target.name)) return false;
	const object = unwrap(target.object);
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
