import { type Context, defineRule, type ESTree } from '@oxlint/plugins';

import { isUnwritten } from '#ast/bindings.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { decisionVisitor, type SwitchDecision } from '#ast/decisions.ts';
import { unwrap } from '#ast/discriminant.ts';

import { switchRewrite } from './rewrite.ts';

/**
 * Reports the equality decisions of two or more distinct case values (see `decisionVisitor`), which read better as a
 * switch statement. Decisions whose branches contain an unlabeled `break` are skipped because the `break` would target
 * the new switch statement instead of the enclosing loop. The rewrite (see `switchRewrite`) is a fix when nothing can
 * change the discriminant between the tests, and a suggestion otherwise.
 */
export const PREFER_SWITCH = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Prefer a `switch` statement over an if-else chain that compares one discriminant.',
		},
		messages: {
			preferSwitch:
				'Use a `switch` on `{{discriminant}}` instead of this `if` chain. Only a final `else` or the exit of a trailing guard becomes `default`.',
			preferSwitchMayChange:
				'Use a `switch` on `{{discriminant}}` instead of this `if` chain, but `{{discriminant}}` may change before a later test reads it. Rewrite the chain if it cannot; otherwise suppress this diagnostic.',
			preferSwitchConditionalElse:
				'Use a `switch` on `{{discriminant}}` instead of this `if` chain. The final `else` must also run when the extra condition of a case fails, so restructure the chain by hand.',
			rewriteAsSwitch: 'Rewrite the chain as a `switch` on `{{discriminant}}`.',
		},
		schema: [],
	},
	create(context) {
		const breaking = new Set<ESTree.Node>();
		const chains: SwitchDecision[] = [];

		return {
			...decisionVisitor(caseComparandsOf(context.sourceCode), decision => {
				if (decision.kind === 'switch') chains.push(decision);
			}),
			BreakStatement(node) {
				if (node.label === null) addBreakingIfs(breaking, node);
			},
			'Program:exit'() {
				for (const decision of chains) {
					const hasBreak = decision.members.some(member => breaking.has(member));
					if (!hasBreak) reportDecision(context, decision);
				}
			},
		};
	},
});

/**
 * Reports a decision with its rewrite: a fix when the discriminant is stable (see `isStable`) and no consequent runs
 * between two tests, and a suggestion for a discriminant that may change or a complement, whose case body runs before
 * the complement's test. A final `else` after a case with an extra condition gets no rewrite, because the `else` would
 * have to run in that case too.
 */
function reportDecision(context: Context, decision: SwitchDecision) {
	const { sourceCode } = context;
	const { head, ending, branches } = decision;
	const discriminant = sourceCode.getText(decision.discriminant);
	const loc = { start: head.loc.start, end: head.consequent.loc.start };

	if (ending.kind === 'else' && branches.some(({ condition }) => condition !== null)) {
		context.report({ loc, messageId: 'preferSwitchConditionalElse', data: { discriminant } });
		return;
	}

	const rewrite = switchRewrite(sourceCode, decision);

	if (ending.kind !== 'complement' && isStable(context, decision.discriminant)) {
		context.report({
			loc,
			messageId: 'preferSwitch',
			data: { discriminant },
			fix: fixer =>
				rewrite === null ? null : fixer.replaceTextRange(rewrite.range, rewrite.text),
		});
		return;
	}
	context.report({
		loc,
		messageId: 'preferSwitchMayChange',
		data: { discriminant },
		suggest:
			rewrite === null
				? null
				: [
						{
							messageId: 'rewriteAsSwitch',
							data: { discriminant },
							fix: fixer => fixer.replaceTextRange(rewrite.range, rewrite.text),
						},
					],
	});
}

/**
 * Whether the discriminant cannot change between the tests: a variable that is never reassigned, `this`, or a member
 * chain with static keys. A getter can still return a different value each time.
 */
function isStable({ sourceCode }: Context, discriminant: ESTree.Expression) {
	const target = unwrap(discriminant);
	return target.type !== 'Identifier' || isUnwritten(sourceCode, target);
}

/**
 * Adds every `if` statement that holds an unlabeled `break`, up to the statement the `break` targets. An unlabeled
 * `break` in an `if` test sits inside a loop within that test, so the walk stops at that loop before reaching the `if`.
 */
function addBreakingIfs(breaking: Set<ESTree.Node>, statement: ESTree.BreakStatement) {
	let { parent } = statement;
	while (!isBreakTarget(parent.type) && parent.type !== 'Program') {
		if (parent.type === 'IfStatement') breaking.add(parent);
		({ parent } = parent);
	}
}

/** Whether a node type is a statement that an unlabeled `break` targets. Inside a `switch`, such a `break` would target the `switch` instead. */
function isBreakTarget(type: ESTree.Node['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (type) {
		case 'WhileStatement':
		case 'DoWhileStatement':
		case 'ForStatement':
		case 'ForInStatement':
		case 'ForOfStatement':
		case 'SwitchStatement':
			return true;
		default:
			return false;
	}
}
