import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { unwrap } from '#ast/discriminant.ts';
import { methodTarget } from '#ast/known-arrays.ts';
import { outermostWrapper } from '#ast/members.ts';
import { propertyName } from '#ast/property-keys.ts';

/**
 * Matches the nodes around the value of a Svelte `indeterminate={…}` attribute or `bind:indeterminate={…}` directive in
 * the AST of `svelte-eslint-parser`: the mustache tag of the attribute, the directive, and the getter and setter pair of
 * a function binding `bind:indeterminate={get, set}`. ESLint visits these before the value, so a list of them is
 * complete by the time a call in the value is visited.
 */
const SVELTE_INDETERMINATE_HOLDER_SELECTOR = [
	'SvelteAttribute[key.name="indeterminate"] > SvelteMustacheTag',
	'SvelteDirective[kind="Binding"][key.name.name="indeterminate"]',
	'SvelteDirective[kind="Binding"][key.name.name="indeterminate"] > SvelteFunctionBindingsExpression',
].join(', ');

/** The partial selection checks of TanStack Table, keyed by method name, with the full selection check of each. */
const FULL_SELECTION_CHECKS = new Map([
	['getIsSomeRowsSelected', 'getIsAllRowsSelected'],
	['getIsSomePageRowsSelected', 'getIsAllPageRowsSelected'],
]);

/**
 * Reports a TanStack Table `getIsSomeRowsSelected()` or `getIsSomePageRowsSelected()` call that sets the indeterminate
 * state of a checkbox without excluding the full selection. Both are `true` when every row is selected, so the
 * checkbox shows as indeterminate instead of checked. The call sets an indeterminate state when its value reaches a JSX
 * `indeterminate={…}` attribute, a Svelte `indeterminate={…}` attribute or `bind:indeterminate={…}` directive, or an
 * `indeterminate: …` property, through logical operators, the branches of a conditional, TypeScript assertions, and the
 * body of an arrow function. A sibling `&&` operand `!x.getIsAllRowsSelected()` (or `!x.getIsAllPageRowsSelected()`) on
 * the same receiver `x` excludes the full selection.
 */
export const REQUIRE_EXCLUSIVE_INDETERMINATE = defineRule({
	meta: {
		type: 'problem',
		docs: {
			description:
				'Require `getIsSomeRowsSelected()` to exclude `getIsAllRowsSelected()` when it sets the indeterminate state of a checkbox.',
		},
		hasSuggestions: true,
		messages: {
			inclusive:
				'`{{call}}` is also `true` when every row is selected, so the checkbox shows as indeterminate instead of checked. Use `{{call}} && !{{exclusion}}`.',
			exclude:
				'Add `&& !{{exclusion}}`. If the checkbox should stay indeterminate when every row is selected, suppress this diagnostic.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const svelteHolders: ESTree.Node[] = [];
		return {
			[SVELTE_INDETERMINATE_HOLDER_SELECTOR](node) {
				svelteHolders.push(node);
			},
			CallExpression(node) {
				const method = methodTarget(node.callee);
				if (method === null) return;
				const full = FULL_SELECTION_CHECKS.get(method.name);
				if (typeof full === 'undefined') return;
				const receiver = sourceCode.getText(unwrap(method.object));
				const call = outermostWrapper(node);
				const root = indeterminateRoot(sourceCode, call, receiver, full);
				if (root === null) return;
				const setsIndeterminate =
					svelteHolders.includes(root.parent) || isIndeterminateValue(root);
				if (!setsIndeterminate) return;

				const operator =
					node.callee.type === 'MemberExpression' && node.callee.optional ? '?.' : '.';
				const exclusion = `${receiver}${operator}${full}()`;
				const text = sourceCode.getText(call);
				const { parent } = call;
				const replacement =
					parent.type === 'LogicalExpression' && parent.operator !== '&&'
						? `(${text} && !${exclusion})`
						: `${text} && !${exclusion}`;
				context.report({
					node,
					messageId: 'inclusive',
					data: { call: sourceCode.getText(node), exclusion },
					suggest: [
						{
							messageId: 'exclude',
							data: { exclusion },
							fix: fixer => fixer.replaceText(call, replacement),
						},
					],
				});
			},
		};
	},
});

/**
 * The outermost expression that a partial selection check flows into unchanged, or `null` when a sibling `&&` operand
 * excludes the full selection on the same receiver. The value flows through logical operators, the branches of a
 * conditional, TypeScript assertions, and the expression body of an arrow function.
 */
function indeterminateRoot(
	sourceCode: SourceCode,
	call: ESTree.Expression,
	receiver: string,
	full: string,
) {
	let value: ESTree.Expression = call;
	while (true) {
		const { parent } = value;
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few node types pass a value on unchanged, so `default` covers the rest.
		switch (parent.type) {
			case 'LogicalExpression': {
				const sibling = parent.left === value ? parent.right : parent.left;
				if (
					parent.operator === '&&' &&
					excludesFullSelection(sourceCode, sibling, receiver, full)
				) {
					return null;
				}
				value = outermostWrapper(parent);
				break;
			}
			case 'ConditionalExpression':
				if (parent.test === value) return value;
				value = outermostWrapper(parent);
				break;
			case 'ArrowFunctionExpression':
				value = outermostWrapper(parent);
				break;
			default:
				return value;
		}
	}
}

/**
 * Whether an `&&` operand excludes the full selection: `!x.getIsAllRowsSelected()` on the receiver `x`, alone or as an
 * operand of a further `&&`.
 */
function excludesFullSelection(
	sourceCode: SourceCode,
	operand: ESTree.Expression,
	receiver: string,
	full: string,
): boolean {
	const node = unwrap(operand);
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `&&` chains and negations exclude the full selection, so `default` covers the rest.
	switch (node.type) {
		case 'LogicalExpression':
			return (
				node.operator === '&&' &&
				(excludesFullSelection(sourceCode, node.left, receiver, full) ||
					excludesFullSelection(sourceCode, node.right, receiver, full))
			);
		case 'UnaryExpression': {
			if (node.operator !== '!') return false;
			const argument = unwrap(node.argument);
			if (argument.type !== 'CallExpression') return false;
			const method = methodTarget(argument.callee);
			return method?.name === full && sourceCode.getText(unwrap(method.object)) === receiver;
		}
		default:
			return false;
	}
}

/** Whether an expression is the value of a JSX `indeterminate={…}` attribute or of an `indeterminate: …` property. */
function isIndeterminateValue(value: ESTree.Expression) {
	const { parent } = value;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only attributes and properties carry an indeterminate value, so `default` covers the rest.
	switch (parent.type) {
		case 'JSXExpressionContainer': {
			const attribute = parent.parent;
			return (
				attribute.type === 'JSXAttribute' &&
				attribute.name.type === 'JSXIdentifier' &&
				attribute.name.name === 'indeterminate'
			);
		}
		case 'Property':
			return (
				parent.value === value &&
				propertyName(parent.key, parent.computed) === 'indeterminate'
			);
		default:
			return false;
	}
}
