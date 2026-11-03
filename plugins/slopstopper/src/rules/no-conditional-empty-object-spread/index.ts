import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { messageLabel } from '#ast/labels.ts';

/**
 * Reports a spread in an object literal of a conditional with an empty object literal on either branch, as in
 * `{ ...(c ? { v } : {}) }`, which hides the omission of properties behind an empty object. There is no rewrite: the
 * object must move into its own declaration so that an `if` statement can add the properties.
 */
export const NO_CONDITIONAL_EMPTY_OBJECT_SPREAD = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow spreading a conditional empty object literal to omit properties of an object literal.',
		},
		messages: {
			conditionalEmptySpread:
				'`...{{spread}}` spreads `{}` to omit properties. Declare the object without them, then add them in `if ({{condition}}) { … }`.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			SpreadElement(node) {
				const { parent, argument } = node;
				if (
					parent.type !== 'ObjectExpression' ||
					argument.type !== 'ConditionalExpression'
				) {
					return;
				}
				const { test, consequent, alternate } = argument;
				const emptyConsequent = isEmptyObject(consequent);
				if (emptyConsequent || isEmptyObject(alternate)) {
					context.report({
						node,
						messageId: 'conditionalEmptySpread',
						data: {
							spread: messageLabel(`(${sourceCode.getText(argument)})`),
							condition: messageLabel(
								emptyConsequent
									? negatedText(sourceCode, test)
									: sourceCode.getText(test),
							),
						},
					});
				}
			},
		};
	},
});

function isEmptyObject(node: ESTree.Expression) {
	return node.type === 'ObjectExpression' && node.properties.length === 0;
}

/**
 * The text of a condition's negation for an `if` test: the operand of a `!`, a `!` before an identifier, a member
 * access, or a call, and a `!` before parentheses otherwise.
 */
function negatedText(sourceCode: SourceCode, test: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several dozen expression types bind tighter than `!`, so `default` covers the rest.
	switch (test.type) {
		case 'UnaryExpression':
			return test.operator === '!'
				? sourceCode.getText(test.argument)
				: `!(${sourceCode.getText(test)})`;
		case 'Identifier':
		case 'MemberExpression':
		case 'CallExpression':
			return `!${sourceCode.getText(test)}`;
		default:
			return `!(${sourceCode.getText(test)})`;
	}
}
