import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { isStrictEquality } from '#ast/operators.ts';
import { dropsComment } from '#ast/ranges.ts';

/**
 * Reports a strict comparison against `undefined`, spelled as the global `undefined` or as `void` of a literal, in favor
 * of `typeof x === 'undefined'`. The two forms differ only for an undeclared identifier, where the plain comparison
 * throws and TypeScript rejects the code, so the rewrite preserves behavior. `==` and `!=` are left to `eqeqeq`.
 */
export const PREFER_TYPEOF_UNDEFINED = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description: "Prefer `typeof x === 'undefined'` over comparing with `undefined`.",
		},
		messages: {
			preferTypeofUndefined: "Compare with `typeof x {{operator}} 'undefined'` instead.",
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;

		return {
			BinaryExpression(node) {
				if (!isStrictEquality(node.operator)) return;
				const { left, right } = node;
				const operand = otherOperand(sourceCode, left, right);
				if (operand === null) return;
				context.report({
					node,
					messageId: 'preferTypeofUndefined',
					data: { operator: node.operator },
					fix(fixer) {
						if (
							dropsComment(sourceCode, { range: node.range, kept: [operand.range] })
						) {
							return null;
						}

						const text = sourceCode.getText(operand);
						const argument = bindsLooserThanTypeof(operand.type) ? `(${text})` : text;
						return fixer.replaceText(
							node,
							`typeof ${argument} ${node.operator} 'undefined'`,
						);
					},
				});
			},
		};
	},
});

/** The operand compared against `undefined`, or `null` when neither side is `undefined` or the other is a `typeof`. */
function otherOperand(sourceCode: SourceCode, left: ESTree.Expression, right: ESTree.Expression) {
	if (isUndefined(sourceCode, right)) return isTypeof(left) ? null : left;
	if (isUndefined(sourceCode, left)) return isTypeof(right) ? null : right;
	return null;
}

/** Whether an expression is the global `undefined` or `void` of a literal, as in `void 0`. */
function isUndefined(sourceCode: SourceCode, node: ESTree.Expression) {
	if (node.type === 'Identifier') {
		return node.name === 'undefined' && sourceCode.isGlobalReference(node);
	}
	return (
		node.type === 'UnaryExpression' &&
		node.operator === 'void' &&
		node.argument.type === 'Literal'
	);
}

function isTypeof(node: ESTree.Expression) {
	return node.type === 'UnaryExpression' && node.operator === 'typeof';
}

/** Whether an operand of a comparison needs parentheses after a prefixed `typeof`. */
function bindsLooserThanTypeof(type: ESTree.Expression['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Every other expression binds at least as tightly as `typeof`.
	switch (type) {
		case 'ArrowFunctionExpression':
		case 'AssignmentExpression':
		case 'BinaryExpression':
		case 'ConditionalExpression':
		case 'LogicalExpression':
		case 'SequenceExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
		case 'YieldExpression':
			return true;
		default:
			return false;
	}
}
