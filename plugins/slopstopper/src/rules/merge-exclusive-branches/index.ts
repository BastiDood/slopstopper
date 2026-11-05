import {
	type Context,
	defineRule,
	type ESTree,
	type Range,
	type SourceCode,
} from '@oxlint/plugins';

import { AssertionError } from '#assert.ts';
import { isBound, isUnwritten } from '#ast/bindings.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { alwaysExits, decisionVisitor, type SplitDecision } from '#ast/decisions.ts';
import { unwrap } from '#ast/discriminant.ts';
import { indentation } from '#ast/layout.ts';
import { logicalOperands, splitLeading } from '#ast/logical-operands.ts';
import { identifierName, propertyName } from '#ast/property-keys.ts';
import { dropsComment } from '#ast/ranges.ts';

/**
 * What a condition reads: only never-reassigned variables, `this`, and literals (`fixed`), also members of those
 * (`members`), or anything that a later write can change (`mutable`).
 */
type Reads = 'fixed' | 'members' | 'mutable';

/**
 * Reports two adjacent `if` statements without `else` whose tests split on one condition: one test holds a condition
 * `C` (as the whole test or as a top-level `&&` operand), and the other holds its negation, `!C` or the inverse
 * equality comparison. The fix merges them into `if (C) { … } else …` when nothing can change `C` between the tests
 * and both tests start with the split, so the merge evaluates the same operands. When the first `if` may change `C`, a
 * suggestion snapshots `C` into a `const` before merging.
 */
export const MERGE_EXCLUSIVE_BRANCHES = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Merge adjacent `if` statements that split on one condition into one `if`-`else` statement.',
		},
		messages: {
			exclusiveBranches:
				'These `if` statements are mutually exclusive on `{{condition}}`. Merge them into one `if ({{condition}}) { … } else { … }` so the split reads as one decision.',
			exclusiveBranchesMayChange:
				'These `if` statements look mutually exclusive on `{{condition}}`, but the first branch may change it. Snapshot the condition into a `const` and merge the branches. If the first branch is meant to change it, suppress this diagnostic.',
			snapshotCondition:
				'Snapshot `{{condition}}` into `const {{name}}` and merge the branches on it.',
		},
		schema: [],
	},
	create(context) {
		return decisionVisitor(caseComparandsOf(context.sourceCode), decision => {
			if (decision.kind === 'split') reportSplit(context, decision);
		});
	},
});

/** Reports a split: with a fix when nothing can change the condition, and otherwise with a suggestion that snapshots it. */
function reportSplit(context: Context, split: SplitDecision) {
	const { sourceCode } = context;
	const { first, second } = split;
	const condition = sourceCode.getText(split.condition);
	const target = unwrap(split.condition);

	if (isStable(sourceCode, split, target)) {
		context.report({
			node: first,
			messageId: 'exclusiveBranches',
			data: { condition },
			fix(fixer) {
				const text = merge(sourceCode, split, condition);
				return text === null
					? null
					: fixer.replaceTextRange([first.range[0], second.range[1]], text);
			},
		});
		return;
	}

	const name = snapshotName(sourceCode, first, target);
	const merged = name === null ? null : merge(sourceCode, split, name);
	context.report({
		node: first,
		messageId: 'exclusiveBranchesMayChange',
		data: { condition },
		suggest:
			name === null || merged === null
				? null
				: [
						{
							messageId: 'snapshotCondition',
							data: { condition, name },
							fix: fixer =>
								fixer.replaceTextRange(
									[first.range[0], second.range[1]],
									`const ${name} = ${condition};\n${indentation(sourceCode, first)}${merged}`,
								),
						},
					],
	});
}

/**
 * Whether nothing can change the condition between the two tests. A condition that reads only never-reassigned
 * variables is stable. A condition that also reads members is stable when the first `if` cannot change them (see
 * `keepsMembers`). Expects the split's condition without wrappers (see `unwrap`) as `target`.
 */
function isStable(sourceCode: SourceCode, split: SplitDecision, target: ESTree.Expression) {
	switch (readsOf(sourceCode, target)) {
		case 'fixed':
			return true;
		case 'members':
			return keepsMembers(split);
		case 'mutable':
			return false;
	}
}

/** Classifies what a matched condition reads (see `Reads`). Expects a node without wrappers (see `unwrap`). */
function readsOf(sourceCode: SourceCode, target: ESTree.Expression): Reads {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- A matched condition holds only these node types, so `default` covers the rest.
	switch (target.type) {
		case 'Identifier':
			return target.name === 'undefined' || isUnwritten(sourceCode, target)
				? 'fixed'
				: 'mutable';
		case 'ThisExpression':
		case 'Literal':
			return 'fixed';
		case 'MemberExpression':
			return target.object.type !== 'Super' &&
				readsOf(sourceCode, unwrap(target.object)) === 'mutable'
				? 'mutable'
				: 'members';
		case 'UnaryExpression':
			return readsOf(sourceCode, unwrap(target.argument));
		case 'BinaryExpression':
			if (target.left.type === 'PrivateIdentifier') {
				throw new AssertionError('a matched condition compares no private name');
			}
			return join(
				readsOf(sourceCode, unwrap(target.left)),
				readsOf(sourceCode, unwrap(target.right)),
			);
		default:
			return 'mutable';
	}
}

/** The reads of two operands together: a `mutable` read wins over `members`, which wins over `fixed`. */
function join(left: Reads, right: Reads) {
	if (left === 'mutable' || right === 'mutable') return 'mutable';
	if (left === 'members' || right === 'members') return 'members';
	return 'fixed';
}

/**
 * Whether the first `if` cannot change a member between the two tests: every operand that its test evaluates after
 * the split is inert (see `isInert`), and its consequent either always exits, so that the second test never runs after
 * it, or holds only inert statements (see `isInertStatement`).
 */
function keepsMembers({ first, condition, negation }: SplitDecision) {
	const split = condition.range[1] <= first.range[1] ? condition : negation;
	return (
		logicalOperands(first.test, '&&').every(
			operand => operand.range[0] <= split.range[0] || isInert(operand),
		) &&
		(alwaysExits(first.consequent) || isInertStatement(first.consequent))
	);
}

/**
 * Whether executing a statement runs no code that can write: blocks and empty statements, expression statements, and
 * `const` declarations of identifiers, with inert expressions only (see `isInert`). An exit is never checked: it is either
 * the last statement of a consequent that always exits, or unreachable code follows it.
 */
function isInertStatement(statement: ESTree.Directive | ESTree.Statement): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the allowlisted statements are inert, so `default` rejects the rest.
	switch (statement.type) {
		case 'BlockStatement':
			return statement.body.every(child => isInertStatement(child));
		case 'EmptyStatement':
			return true;
		case 'ExpressionStatement':
			return isInert(statement.expression);
		case 'VariableDeclaration':
			return (
				statement.kind === 'const' &&
				statement.declarations.every(
					({ id, init }) => id.type === 'Identifier' && init !== null && isInert(init),
				)
			);
		default:
			return false;
	}
}

/**
 * Whether evaluating an expression runs no code that can write: identifiers, literals, `this`, members with static
 * keys, unary operators except `delete`, binary, logical, and conditional operators, template literals, optional
 * chains, parentheses, and TypeScript assertions, built only from such expressions. Anything else, such as a call,
 * `new`, `import()`, a tagged template, an assignment, an update, `await`, `yield`, a function, or a class, is not.
 */
function isInert(node: ESTree.Expression): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the allowlisted expressions are inert, so `default` rejects the rest.
	switch (node.type) {
		case 'Identifier':
		case 'Literal':
		case 'ThisExpression':
			return true;
		case 'TemplateLiteral':
			return node.expressions.every(expression => isInert(expression));
		case 'MemberExpression':
			return (
				(!node.computed || propertyName(node.property, true) !== null) &&
				(node.object.type === 'Super' || isInert(node.object))
			);
		case 'UnaryExpression':
			return node.operator !== 'delete' && isInert(node.argument);
		case 'BinaryExpression':
			return (
				(node.left.type === 'PrivateIdentifier' || isInert(node.left)) &&
				isInert(node.right)
			);
		case 'LogicalExpression':
			return isInert(node.left) && isInert(node.right);
		case 'ConditionalExpression':
			return isInert(node.test) && isInert(node.consequent) && isInert(node.alternate);
		case 'ChainExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
		case 'TSNonNullExpression':
		case 'TSTypeAssertion':
			return isInert(node.expression);
		default:
			return false;
	}
}

/**
 * The merged `if (<condition>) { … } else …` statement, with the branch that holds the condition first. Returns `null`
 * unless both tests start with the split, so that the merge skips no operand that the original tests evaluate before
 * it, or when a comment would be dropped. Comments between the statements stay before the `else`.
 */
function merge(sourceCode: SourceCode, split: SplitDecision, condition: string) {
	const { first, second } = split;
	const isPositiveFirst = split.condition.range[1] <= first.range[1];
	const positive = branch(sourceCode, isPositiveFirst ? first : second, split.condition);
	const negative = branch(sourceCode, isPositiveFirst ? second : first, split.negation);
	if (positive === null || negative === null) return null;

	const consequent = isPositiveFirst ? first.consequent : second.consequent;
	const block =
		positive.hasRest || consequent.type !== 'BlockStatement'
			? `{ ${positive.text} }`
			: positive.text;

	const separator = sourceCode.commentsExistBetween(first, second)
		? sourceCode.text.slice(first.range[1], second.range[0])
		: ' ';

	return `if (${condition}) ${block}${separator}else ${negative.text}`;
}

/**
 * The text that one `if` statement leaves for its branch of the merged statement: the consequent alone, or
 * `if (<rest>) <consequent>` when the test has further `&&` operands after the split. Returns `null` when the split
 * does not lead the test (see `splitLeading`) or when a comment lies in the dropped text, which is everything before
 * the consequent except the rest of the test.
 */
function branch(sourceCode: SourceCode, statement: ESTree.IfStatement, split: ESTree.Expression) {
	const { test, consequent } = statement;
	const body = sourceCode.getText(consequent);

	if (test === split) {
		return dropsComment(sourceCode, { range: statement.range, kept: [consequent.range] })
			? null
			: { text: body, hasRest: false };
	}

	if (test.type !== 'LogicalExpression') {
		throw new AssertionError('a split that is not the whole test is a top-level `&&` operand');
	}
	const rest = splitLeading(sourceCode, test);
	if (rest?.leading !== split) return null;

	const kept = [[rest.start, test.range[1]], consequent.range] satisfies Range[];
	if (dropsComment(sourceCode, { range: statement.range, kept })) return null;
	return { text: `if (${rest.text}) ${body}`, hasRest: true };
}

/**
 * The `const` name that snapshots a condition: the name of a member condition's identifier or private name property.
 * Returns `null` for other conditions, such as identifiers and comparisons, and when the name clashes with a binding or
 * a global that the scope of the `first` statement reads. Expects the condition without wrappers (see `unwrap`).
 */
function snapshotName(
	sourceCode: SourceCode,
	first: ESTree.IfStatement,
	target: ESTree.Expression,
) {
	if (target.type !== 'MemberExpression') return null;
	const name = identifierName(target.property, target.computed);
	return name === null || isBound(sourceCode.getScope(first), name) ? null : name;
}
