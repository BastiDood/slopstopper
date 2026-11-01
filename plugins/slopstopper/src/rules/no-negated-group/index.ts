import { defineRule, type ESTree } from '@oxlint/plugins';

import { caseComparandsOf } from '#ast/case-comparand.ts';
import { isCaseChain } from '#ast/discriminant.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import {
	distributeNegation,
	isSwappableTest,
	openingParenthesis,
	readsTruthiness,
} from '#ast/negation.ts';
import { dropsComment } from '#ast/ranges.ts';

/**
 * Reports a `!` applied to an `&&` or `||` group, as in `!(a && b)`, and distributes it with De Morgan's law into
 * `!a || !b`. The rule leaves two forms to `prefer-de-morgan`, which produces them on purpose: the whole test of a
 * ternary or of an `if` whose `else` is no `else if`, where `no-negated-condition` swaps the branches instead, and a
 * negated `===` run of one discriminant, which `no-equality-chain` extracts into a named function.
 */
export const NO_NEGATED_GROUP = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description:
				"Prefer distributing a negation over a logical group with De Morgan's law.",
		},
		messages: {
			noNegatedGroup:
				'Distribute this negation over the group, or invert the condition into an early return when it guards one.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const isCaseComparand = caseComparandsOf(sourceCode);

		return {
			UnaryExpression(node) {
				const { operator, argument } = node;
				if (
					operator !== '!' ||
					argument.type !== 'LogicalExpression' ||
					argument.operator === '??' ||
					isSwappableTest(node)
				) {
					return;
				}

				if (
					argument.operator === '||' &&
					isCaseChain(isCaseComparand, '===', logicalOperands(argument, '||'))
				) {
					return;
				}

				context.report({
					node,
					messageId: 'noNegatedGroup',
					fix(fixer) {
						if (
							dropsComment(sourceCode, { range: node.range, kept: [argument.range] })
						) {
							return null;
						}

						const text = distributeNegation(
							sourceCode,
							readsTruthiness(node),
							argument,
						);
						const needsParentheses =
							openingParenthesis(sourceCode, node) === null &&
							bindsTighter(node, argument.operator === '&&' ? '||' : '&&');
						return fixer.replaceText(node, needsParentheses ? `(${text})` : text);
					},
				});
			},
		};
	},
});

/**
 * Whether the parent of an unparenthesized `!` binds tighter than a chain of `operator` that replaces it. Any other
 * parent holds the `!` in a position that accepts a logical chain, such as a call argument or a computed key.
 */
function bindsTighter(node: ESTree.UnaryExpression, operator: '&&' | '||') {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only operators that bind tighter than a logical chain can hold an unparenthesized `!` as an operand, so `default` covers the rest.
	switch (parent.type) {
		case 'LogicalExpression':
			return parent.operator === '??' || (parent.operator === '&&' && operator === '||');
		case 'UnaryExpression':
		case 'AwaitExpression':
		case 'BinaryExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSTypeAssertion':
			return true;
		default:
			return false;
	}
}
