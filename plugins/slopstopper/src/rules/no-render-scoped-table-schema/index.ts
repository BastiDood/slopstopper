import { defineRule, type ESTree, type SourceCode, type Variable } from '@oxlint/plugins';

import { assertNotNull } from '#assert.ts';
import { firstConstInitializer, resolvedVariable, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { enclosingFunction } from '#ast/functions.ts';
import { methodName, methodTarget } from '#ast/known-arrays.ts';
import { messageLabel } from '#ast/labels.ts';
import {
	isSvelteComponent,
	SVELTE_MODULE_ATTRIBUTE_SELECTOR,
	SVELTE_SCRIPT_SELECTOR,
} from '#ast/svelte.ts';

/** Matches the name of a React component: an uppercase letter, then letters and digits. */
const COMPONENT_NAME_REGEX = /^[A-Z][\dA-Za-z]*$/u;

/** Matches the name of a React hook: `use`, then an uppercase letter or a digit. */
const HOOK_NAME_REGEX = /^use[\dA-Z]/u;

/**
 * Reports a TanStack Table schema, built by `tableFeatures(…)`, `createColumnHelper(…)`, or `helper.columns(…)`, inside
 * a React component or hook or the instance `<script>` of a Svelte component, where it is rebuilt on every render or for
 * every instance. There is no rewrite: hoisting the schema moves code across scopes.
 */
export const NO_RENDER_SCOPED_TABLE_SCHEMA = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallow building the TanStack Table features, column helper, or columns inside a component or hook.',
		},
		messages: {
			render: '`{{call}}` builds the table schema on every call of `{{owner}}`. Hoist it to module scope so that it is built once.',
			instance:
				'`{{call}}` builds the table schema for every instance of the component. Move it to `<script module>` so that it is built once.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		if (isSvelteComponent(context.filename)) {
			let isModuleScript = false;
			return {
				[SVELTE_SCRIPT_SELECTOR]() {
					isModuleScript = false;
				},
				[SVELTE_MODULE_ATTRIBUTE_SELECTOR]() {
					isModuleScript = true;
				},
				[`${SVELTE_SCRIPT_SELECTOR} CallExpression`](node) {
					if (
						isModuleScript ||
						node.type !== 'CallExpression' ||
						!isSchemaCall(sourceCode, node)
					) {
						return;
					}
					context.report({
						node,
						messageId: 'instance',
						data: { call: callLabel(sourceCode, node) },
					});
				},
			};
		}
		return {
			CallExpression(node) {
				if (!isSchemaCall(sourceCode, node)) return;
				const owner = renderingOwner(node);
				if (owner === null) return;
				context.report({
					node,
					messageId: 'render',
					data: { call: callLabel(sourceCode, node), owner },
				});
			},
		};
	},
});

/** Whether a call builds a part of the table schema: `tableFeatures(…)`, `createColumnHelper(…)`, or `.columns(…)` on a column helper. */
function isSchemaCall(sourceCode: SourceCode, call: ESTree.CallExpression) {
	const name = methodName(call.callee);
	if (name === null) {
		return (
			isLibraryCall(sourceCode, call, 'tableFeatures') ||
			isLibraryCall(sourceCode, call, 'createColumnHelper')
		);
	}
	if (name !== 'columns') return false;
	const { object } = assertNotNull(methodTarget(call.callee));
	return isColumnHelper(sourceCode, [], object);
}

/**
 * Whether an expression is a column helper: a `createColumnHelper(…)` call, or a `const` that one
 * initializes, directly or through `const` aliases. `visited` holds the aliases already followed, so that a cycle of
 * aliases ends.
 */
function isColumnHelper(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	const node = unwrap(expression);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only calls and aliases hold a column helper, so `default` covers the rest.
	switch (node.type) {
		case 'CallExpression':
			return isLibraryCall(sourceCode, node, 'createColumnHelper');
		case 'Identifier': {
			const variable = unvisitedVariable(sourceCode, visited, node);
			const init = variable === null ? null : firstConstInitializer(variable);
			return init !== null && isColumnHelper(sourceCode, visited, init);
		}
		default:
			return false;
	}
}

/** Whether a call calls the TanStack Table function with the given name: an imported or undeclared identifier. */
function isLibraryCall(sourceCode: SourceCode, { callee }: ESTree.CallExpression, name: string) {
	const node = unwrap(callee);
	if (node.type !== 'Identifier' || node.name !== name) return false;
	const variable = resolvedVariable(sourceCode, node);
	return variable === null || variable.defs.every(({ type }) => type === 'ImportBinding');
}

/** The callee of a call followed by `(…)`, for a message. */
function callLabel(sourceCode: SourceCode, { callee }: ESTree.CallExpression) {
	return `${messageLabel(sourceCode.getText(callee))}(…)`;
}

/**
 * The name of the nearest React component or hook around a node, or `null` when no such function encloses it or a
 * `useMemo` callback lies between the node and that function.
 */
function renderingOwner(node: ESTree.Node) {
	for (let fn = enclosingFunction(node); fn !== null; fn = enclosingFunction(fn)) {
		if (isMemoCallback(fn)) return null;
		const name = functionName(fn);
		if (name !== null && (COMPONENT_NAME_REGEX.test(name) || HOOK_NAME_REGEX.test(name))) {
			return name;
		}
	}
	return null;
}

/** Whether a function is the first argument of a `useMemo(…)` or `React.useMemo(…)` call. */
function isMemoCallback(fn: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const { parent } = fn;
	if (parent.type !== 'CallExpression' || parent.arguments[0] !== fn) return false;
	const callee = unwrap(parent.callee);
	if (callee.type === 'Identifier') return callee.name === 'useMemo';
	return methodName(callee) === 'useMemo';
}

/**
 * The name that a function goes by: its own name, or the name of the variable that it initializes, directly or as an
 * argument of wrapper calls such as `memo(…)` and `forwardRef(…)`. Returns `null` when it has none.
 */
function functionName(fn: ESTree.Function | ESTree.ArrowFunctionExpression) {
	if (fn.type !== 'ArrowFunctionExpression' && fn.id !== null) return fn.id.name;
	if (fn.type === 'FunctionDeclaration') return null;
	let value: ESTree.Expression = fn;
	while (value.parent.type === 'CallExpression') ({ parent: value } = value);
	const { parent } = value;
	return parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
		? parent.id.name
		: null;
}
