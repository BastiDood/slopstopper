import type { ESTree, SourceCode } from '@oxlint/plugins';

import { AssertionError } from '#assert.ts';
import { type CaseComparand, isCaseChain } from '#ast/discriminant.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import { flipEquality } from '#ast/operators.ts';

/** A text edit of the source: the range from `start` to `end` becomes `text`. */
interface Edit {
	start: number;
	end: number;
	text: string;
}

/**
 * Whether an expression is the whole test whose branches `no-negated-condition` swaps to remove a leading `!`: the test
 * of a ternary, or of an `if` whose `else` is no `else if`.
 */
export function isSwappableTest(node: ESTree.Expression) {
	const { parent } = node;
	if (parent.type === 'ConditionalExpression') return parent.test === node;
	// An expression whose parent is an `if` is its test.
	return (
		parent.type === 'IfStatement' &&
		parent.alternate !== null &&
		parent.alternate.type !== 'IfStatement'
	);
}

/**
 * Whether only the truthiness of an expression is read: it is the test of an `if`, a loop, or a ternary, or the operand
 * of `!`, directly or through the `&&` and `||` chains that hold it.
 */
export function readsTruthiness(node: ESTree.Expression) {
	let child: ESTree.Node = node;
	let { parent } = node;
	while (parent.type === 'LogicalExpression' && parent.operator !== '??') {
		child = parent;
		({ parent } = parent);
	}

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only conditions and `!` read truthiness alone, so `default` covers the rest.
	switch (parent.type) {
		case 'IfStatement':
		case 'WhileStatement':
		case 'DoWhileStatement':
			// An expression whose parent is one of these statements is its test.
			return true;
		case 'ForStatement':
		case 'ConditionalExpression':
			return parent.test === child;
		case 'UnaryExpression':
			return parent.operator === '!';
		default:
			return false;
	}
}

/**
 * The text of a logical chain with `&&` and `||` swapped and every operand negated by `negateOperand`, which De Morgan's
 * law equates with the negated chain. Edits the source in place, so that comments, grouping parentheses, and line
 * breaks survive, and keeps the operand order, so that the result evaluates the same operands and short-circuits at the
 * same point. Callers pass the edit of `negate`.
 */
export function distributeNegation(
	sourceCode: SourceCode,
	chain: ESTree.LogicalExpression,
	negateOperand: (operand: ESTree.Expression) => Edit,
) {
	const { text } = sourceCode;
	const joiner = chain.operator === '&&' ? '||' : '&&';
	let output = '';
	let [cursor] = chain.range;
	let previous: ESTree.Expression | null = null;

	for (const operand of logicalOperands(chain, chain.operator)) {
		if (previous !== null) {
			const token = sourceCode.getFirstTokenBetween(
				previous,
				operand,
				candidate => candidate.value === chain.operator,
			);
			if (token === null) {
				throw new AssertionError('the operator token separates two operands');
			}
			output += text.slice(cursor, token.range[0]) + joiner;
			[, cursor] = token.range;
		}

		const { start, text: replacement, end } = negateOperand(operand);
		output += text.slice(cursor, start) + replacement;
		cursor = end;
		previous = operand;
	}

	return output + text.slice(cursor, chain.range[1]);
}

/**
 * The chain that `no-negated-group` asks to distribute a `!` over, or `null` for any other expression. That is an `&&`
 * or `||` chain, except an `||` chain that compares one discriminant with `===` against case comparands (see
 * `isCaseChain`). `no-equality-chain` turns that chain into a `switch`. A distributed `!==` chain would draw
 * `prefer-de-morgan` instead.
 */
export function distributableGroup(isCaseComparand: CaseComparand, node: ESTree.Expression) {
	if (node.type !== 'LogicalExpression') return null;
	switch (node.operator) {
		case '&&':
			return node;
		case '||':
			return isCaseChain(isCaseComparand, '===', logicalOperands(node, '||')) ? null : node;
		case '??':
			return null;
	}
}

/**
 * The edit that negates one operand: drop the `!` of `!x` (or double it unless `truthiness` holds), flip an equality
 * operator, or prefix `!`. A prefixed `!` goes before the operand's own parentheses, or adds parentheses when the
 * operand binds looser than `!`.
 */
export function negate(sourceCode: SourceCode, truthiness: boolean, operand: ESTree.Expression) {
	const [start, end] = operand.range;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several dozen expression types matter, so `default` covers the rest.
	switch (operand.type) {
		case 'UnaryExpression':
			if (operand.operator === '!') {
				return truthiness
					? { start, end: start + 1, text: '' }
					: { start, end: start, text: '!' };
			}
			break;
		case 'BinaryExpression': {
			const flipped = flipEquality(operand.operator);
			if (flipped !== null) {
				const token = sourceCode.getFirstTokenBetween(
					operand.left,
					operand.right,
					candidate => candidate.value === operand.operator,
				);
				if (token === null) {
					throw new AssertionError('the operator token separates two operands');
				}
				return { start: token.range[0], end: token.range[1], text: flipped };
			}
			break;
		}
		default:
			break;
	}

	const opening = openingParenthesis(sourceCode, operand);
	if (opening !== null) {
		const [position] = opening.range;
		return { start: position, end: position, text: '!' };
	}

	if (bindsLooserThanNot(operand.type)) {
		return { start, end, text: `!(${sourceCode.getText(operand)})` };
	}
	return { start, end: start, text: '!' };
}

/** The opening parenthesis of the grouping parentheses that directly enclose a node, or `null` when none do. */
export function openingParenthesis(sourceCode: SourceCode, node: ESTree.Node) {
	const opening = sourceCode.getTokenBefore(node);
	const closing = sourceCode.getTokenAfter(node);
	return opening?.value === '(' && closing?.value === ')' ? opening : null;
}

/** Whether an unparenthesized operand of a logical chain needs parentheses after a prefixed `!`. */
function bindsLooserThanNot(type: ESTree.Expression['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Every other operand of a logical chain either binds at least as tightly as `!` or must already be parenthesized.
	switch (type) {
		case 'BinaryExpression':
		case 'LogicalExpression':
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
			return true;
		default:
			return false;
	}
}
