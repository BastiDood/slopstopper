import type { ESTree, SourceCode } from '@oxlint/plugins';

/**
 * The operands of a logical chain of `operator` in source order, flattened through nested expressions with the same
 * operator, or the expression alone when it is no such chain.
 */
export function logicalOperands(expression: ESTree.Expression, operator: ESTree.LogicalOperator) {
	const operands: ESTree.Expression[] = [];
	addOperands(operands, expression, operator);
	return operands;
}

/**
 * The leftmost operand of a logical chain and the rest of the chain after it: where the text after the operator that
 * follows the operand starts, and that text. Returns `null` when parentheses group the leftmost operand with the next
 * one, so that the text after the operator is not the rest of the chain.
 */
export function splitLeading(sourceCode: SourceCode, chain: ESTree.LogicalExpression) {
	const leading = leadingOperand(chain, chain.operator);
	const operator = sourceCode.getTokenAfter(leading);
	if (leading.range[0] !== chain.range[0] || operator?.value !== chain.operator) return null;
	const [, start] = operator.range;
	return { leading, start, text: sourceCode.text.slice(start, chain.range[1]).trim() };
}

/** The leftmost operand of a logical chain of `operator`, or the expression itself when it is no such chain. */
export function leadingOperand(expression: ESTree.Expression, operator: ESTree.LogicalOperator) {
	let leading = expression;
	while (leading.type === 'LogicalExpression' && leading.operator === operator) {
		leading = leading.left;
	}
	return leading;
}

/** Appends the operands of a logical chain of `operator` to `operands` (see `logicalOperands`). */
function addOperands(
	operands: ESTree.Expression[],
	node: ESTree.Expression,
	operator: ESTree.LogicalOperator,
) {
	if (node.type === 'LogicalExpression' && node.operator === operator) {
		addOperands(operands, node.left, operator);
		addOperands(operands, node.right, operator);
	} else {
		operands.push(node);
	}
}
