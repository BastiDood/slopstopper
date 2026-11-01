import { defineRule, type ESTree } from '@oxlint/plugins';

import { caseComparandsOf } from '#ast/case-comparand.ts';
import { decisionVisitor } from '#ast/decisions.ts';
import { equalityRuns } from '#ast/discriminant.ts';
import { logicalOperands } from '#ast/logical-operands.ts';

/**
 * Reports an `||` chain of two or more `===` comparisons against the same discriminant, which reads better as a
 * `switch` extracted into a function. The test of an `if` in a decision that `prefer-switch` owns (see
 * `decisionVisitor`) is left to that rule.
 */
export const NO_EQUALITY_CHAIN = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow `||` chains of `===` comparisons against one discriminant in favor of a `switch` in a function.',
		},
		messages: {
			equalityChain:
				'Replace this chain of {{count}} `===` comparisons with a `switch` on `{{discriminant}}` whose fall-through cases return `true`, extracted into a function.',
		},
		schema: [],
	},
	create(context) {
		const isCaseComparand = caseComparandsOf(context.sourceCode);
		const owned = new Set<ESTree.IfStatement>();

		return {
			...decisionVisitor(isCaseComparand, decision => {
				if (decision.kind === 'switch') {
					for (const member of decision.members) owned.add(member);
				}
			}),
			LogicalExpression(node) {
				if (node.operator !== '||') return;
				const { parent } = node;
				// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
				switch (parent.type) {
					case 'LogicalExpression':
						if (parent.operator === '||') return;
						break;
					// An expression whose parent is an `if` is its test.
					case 'IfStatement':
						if (owned.has(parent)) return;
						break;
					default:
						break;
				}

				for (const run of equalityRuns(
					isCaseComparand,
					logicalOperands(node, node.operator),
				)) {
					context.report({
						loc: { start: run.first.loc.start, end: run.last.loc.end },
						messageId: 'equalityChain',
						data: {
							discriminant: context.sourceCode.getText(run.discriminant),
							count: run.count,
						},
					});
				}
			},
		};
	},
});
