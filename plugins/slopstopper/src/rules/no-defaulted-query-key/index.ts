import { defineRule, type ESTree, type SourceCode, type Variable } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { firstConstInitializer, unvisitedVariable } from '#ast/bindings.ts';
import { unwrap } from '#ast/discriminant.ts';
import { isFunction } from '#ast/functions.ts';
import { messageLabel } from '#ast/labels.ts';
import { propertyName } from '#ast/property-keys.ts';
import { queryOption, valueReads } from '#ast/tanstack-query.ts';

/**
 * Reports a defaulted value in the `queryKey` of a TanStack Query: a `??` or `||` expression, or a binding that holds
 * a default, which is a parameter or destructured binding with a default value, or a `const` initialized with `??` or
 * `||`, directly or through `const` aliases. A defaulted key shares its cache entry with the real value that equals
 * the default, so the author must keep the absent value in the key and disable the query with `skipToken` instead. The key includes the arguments of key factory calls in it, but not the functions nested in it.
 * A binding inside a reported `??` or `||` expression is not reported again. There is no rewrite.
 */
export const NO_DEFAULTED_QUERY_KEY = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow defaulted values in a TanStack Query `queryKey`.',
		},
		messages: {
			defaultedExpression:
				'`{{value}}` defaults a value in `queryKey`. Keep the absent value in the key and disable the query with `skipToken` instead, because a defaulted key shares its cache entry with a real value.',
			defaultedBinding:
				'`{{value}}` holds a defaulted value in `queryKey`. Keep the absent value in the key and disable the query with `skipToken` instead, because a defaulted key shares its cache entry with a real value.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			LogicalExpression(node) {
				if (!isDefaulting(node) || keyPosition(node) !== 'key') return;
				context.report({
					node,
					messageId: 'defaultedExpression',
					data: { value: messageLabel(sourceCode.getText(node)) },
				});
			},
			ObjectExpression(node) {
				const key = queryOption(node, 'queryKey');
				if (key === null) return;
				for (const { identifier, resolved } of valueReads(sourceCode, key.value)) {
					if (
						resolved === null ||
						keyPosition(identifier) !== 'key' ||
						!holdsDefault(sourceCode, [resolved], resolved)
					) {
						continue;
					}
					context.report({
						node: identifier,
						messageId: 'defaultedBinding',
						data: { value: identifier.name },
					});
				}
			},
		};
	},
});

/**
 * Where a node sits in the nearest `queryKey` value around it: `key` when no `??` or `||` expression between the node
 * and the value encloses it, `default` when one does, or `null` when the node is in no `queryKey` value or a function
 * between them ends the search.
 */
function keyPosition(node: ESTree.Node) {
	let isInsideDefault = false;
	for (
		let child = node, { parent } = node;
		parent !== null;
		child = parent, { parent } = parent
	) {
		if (isFunction(parent)) return null;
		if (isQueryKeyValue(parent, child)) return isInsideDefault ? 'default' : 'key';
		if (isDefaulting(parent)) isInsideDefault = true;
	}
	return null;
}

/** Whether a child is the value of a `queryKey` property, which is its parent, in an object literal. */
function isQueryKeyValue(parent: ESTree.Node, child: ESTree.Node) {
	return (
		parent.type === 'Property' &&
		parent.value === child &&
		parent.kind === 'init' &&
		parent.parent.type === 'ObjectExpression' &&
		propertyName(parent.key, parent.computed) === 'queryKey'
	);
}

/**
 * Whether a variable holds a default: its only definition has a default value, as a parameter or destructured binding
 * does, or it is a `const` initialized with a `??` or `||` expression or with the name of another variable that holds a
 * default. `visited` holds the variables already followed, so that a cycle of aliases ends.
 */
function holdsDefault(sourceCode: SourceCode, visited: Variable[], variable: Variable): boolean {
	const definition = onlyElement(variable.defs);
	if (definition === null) return false;
	const { name } = definition;
	if (name.parent.type === 'AssignmentPattern' && name.parent.left === name) return true;

	const init = firstConstInitializer(variable);
	if (init === null) return false;
	const value = unwrap(init);
	if (isDefaulting(value)) return true;
	if (value.type !== 'Identifier') return false;
	const alias = unvisitedVariable(sourceCode, visited, value);
	return alias !== null && holdsDefault(sourceCode, visited, alias);
}

/** Whether a node is a `??` or `||` expression, which defaults its left operand. */
function isDefaulting(node: ESTree.Node) {
	return node.type === 'LogicalExpression' && isDefaultingOperator(node.operator);
}

/** Whether a logical operator defaults its left operand: `??` or `||`. */
function isDefaultingOperator(operator: ESTree.LogicalOperator) {
	switch (operator) {
		case '??':
		case '||':
			return true;
		case '&&':
			return false;
	}
}
