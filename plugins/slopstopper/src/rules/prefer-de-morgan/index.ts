import { defineRule, type ESTree } from '@oxlint/plugins';

import { caseComparandsOf } from '#ast/case-comparand.ts';
import { type CaseComparand, isCaseChain } from '#ast/discriminant.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import { distributeNegation, isSwappableTest } from '#ast/negation.ts';
import { isInequality } from '#ast/operators.ts';

/**
 * Reports an `&&` or `||` chain whose negated operands (`!x`, `!==`, `!=`) outnumber what De Morgan's law leaves behind:
 * one outer `!` plus one negation per positive operand. The rule reports only where another rule removes the outer `!`:
 * the whole test of an `if`-`else` or a ternary, which `no-negated-condition` flips, and a same-discriminant `!==` chain,
 * whose positive `===` chain `no-equality-chain` extracts into a named function. The rewrite keeps the operand order, so
 * it evaluates the same operands and short-circuits at the same point.
 */
export const PREFER_DE_MORGAN = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description:
				"Prefer one outer negation over negated operands by applying De Morgan's law to a logical chain.",
		},
		messages: {
			preferDeMorgan:
				"This condition negates {{before}} operands. Apply De Morgan's law to negate the whole condition once instead ({{after}} negations).",
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const isCaseComparand = caseComparandsOf(sourceCode);

		return {
			LogicalExpression(node) {
				if (node.operator === '??') return;
				const { parent } = node;
				if (parent.type === 'LogicalExpression' && parent.operator === node.operator) {
					return;
				}

				const operands = logicalOperands(node, node.operator);
				let negated = 0;
				for (const operand of operands) if (isNegated(operand)) ++negated;
				const after = 1 + operands.length - negated;

				if (after < negated && isAffirmable(node, operands, isCaseComparand)) {
					context.report({
						node,
						messageId: 'preferDeMorgan',
						data: { before: negated, after },
						// Every reported position reads only the truthiness of the chain or holds only comparisons.
						fix: fixer =>
							fixer.replaceText(
								node,
								`!(${distributeNegation(sourceCode, true, node)})`,
							),
					});
				}
			},
		};
	},
});

/**
 * Whether another rule removes the outer `!` of the rewrite: `no-negated-condition` swaps the branches when the chain is
 * the whole test of a ternary or of an `if` whose `else` is no `else if`, and `no-equality-chain` extracts the positive
 * `===` chain of a same-discriminant `!==` chain into a named function. Both positions also keep the result unchanged:
 * a test only reads the truthiness of the chain, and a chain of comparisons already produces a `boolean`.
 */
function isAffirmable(
	chain: ESTree.LogicalExpression,
	operands: ESTree.Expression[],
	isCaseComparand: CaseComparand,
) {
	if (chain.operator === '&&' && isCaseChain(isCaseComparand, '!==', operands)) return true;
	return isSwappableTest(chain);
}

/** Whether an operand counts as a negation: `!x`, `a !== b`, or `a != b`. */
function isNegated(operand: ESTree.Expression) {
	if (operand.type === 'UnaryExpression') return operand.operator === '!';
	return operand.type === 'BinaryExpression' && isInequality(operand.operator);
}
