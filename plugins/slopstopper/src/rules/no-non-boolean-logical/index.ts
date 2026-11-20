import { type Context, defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { unwrap } from '#ast/discriminant.ts';
import { returnedCallback } from '#ast/functions.ts';
import { isStandardArrayMethod, methodTarget } from '#ast/known-arrays.ts';
import { messageLabel } from '#ast/labels.ts';
import { isUndefined } from '#ast/literals.ts';
import { isAndOr } from '#ast/logical-operands.ts';
import { outermostWrapper } from '#ast/members.ts';
import { readsTruthiness } from '#ast/negation.ts';
import { isLogicalAssignment } from '#ast/operators.ts';
import { type TypeServices, typeAtLocation, typeServicesOf } from '#type-services.ts';

/**
 * Reports an `&&` or `||` whose value is used and whose right operand is no boolean, as in `const extra = c && { v }`,
 * `{c && <Panel />}`, or `const items = list || []`. Such an expression yields one operand or the other. Its value
 * mixes a boolean with something else. Use `&&` and `||` only between booleans. Choose the value in an `if` statement
 * or with a conditional expression. For a nullish default, use `??`. Only the right operand is checked.
 * `typescript/strict-boolean-expressions` checks the left one. It also checks the right operand where only the
 * truthiness of the expression is read: in a condition, under `!`, as the left operand of another `&&` or `||`, or as
 * the return of an array predicate callback (see `isPredicateReturn`). Those positions are not reported. Neither is an
 * expression statement, which `no-unused-expressions` reports. A concise arrow body returns its value, as in
 * `() => open && close()`. An `&&=` or `||=` assigns its value. It is reported as a statement too, as in
 * `options.items ||= []`. Where only its truthiness is read, it is left to `typescript/strict-boolean-expressions`. With
 * type information, a right operand counts as a boolean when its type is assignable to `boolean`. Without it, only an
 * operand that is visibly no boolean is reported (see `isVisiblyNonBoolean`).
 */
export const NO_NON_BOOLEAN_LOGICAL = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow an `&&` or `||` whose value is used and whose right operand is no boolean.',
		},
		messages: {
			nonBooleanAnd:
				'`{{expression}}` yields `{{operand}}`, which is no boolean. Use `{{operator}}` only between booleans. Choose the value in an `if` statement or with a conditional expression instead.',
			nonBooleanOr:
				'`{{expression}}` yields `{{operand}}`, which is no boolean. Use `{{operator}}` only between booleans. Use `{{nullish}}` for a nullish default. Otherwise choose the value in an `if` statement or with a conditional expression.',
		},
		schema: [],
	},
	create(context) {
		const services = typeServicesOf(context.sourceCode);
		return {
			LogicalExpression(node) {
				if (node.operator === '??' || !usesValue(services, node)) return;
				reportNonBoolean(context, services, node);
			},
			AssignmentExpression(node) {
				if (!isAndOrAssignment(node)) return;
				// A statement uses the assignment.
				if (node.parent.type === 'ExpressionStatement' || usesValue(services, node)) {
					reportNonBoolean(context, services, node);
				}
			},
		};
	},
});

/**
 * Reports an `&&`, `||`, `&&=`, or `||=` whose right operand is no boolean (see `isNonBoolean`). An operand that is
 * itself an `&&`, `||`, `&&=`, or `||=` is visited on its own.
 */
function reportNonBoolean(
	context: Context,
	services: TypeServices | null,
	node: ESTree.LogicalExpression | ESTree.AssignmentExpression,
) {
	const { sourceCode } = context;
	const { operator, right } = node;
	const operand = unwrap(right);
	if (isAndOr(operand) || isAndOrAssignment(operand)) return;
	if (!isNonBoolean(sourceCode, services, right)) return;
	context.report({
		node,
		messageId: operator.startsWith('&&') ? 'nonBooleanAnd' : 'nonBooleanOr',
		data: {
			expression: messageLabel(sourceCode.getText(node)),
			operand: messageLabel(sourceCode.getText(right)),
			operator,
			nullish: node.type === 'AssignmentExpression' ? '??=' : '??',
		},
	});
}

/** Whether an expression without wrappers is an `&&=` or `||=`. */
function isAndOrAssignment(node: ESTree.Expression) {
	return (
		node.type === 'AssignmentExpression' &&
		isLogicalAssignment(node.operator) &&
		node.operator !== '??='
	);
}

/**
 * Whether the value of an expression is used beyond its truthiness. The left operand of an enclosing `&&` or `||` is
 * read for its truthiness. The right operand passes the use of the enclosing expression on. An expression statement
 * discards the value.
 */
function usesValue(services: TypeServices | null, node: ESTree.Expression): boolean {
	const { parent } = node;
	return parent.type === 'LogicalExpression' && parent.operator !== '??'
		? parent.right === node && usesValue(services, parent)
		: parent.type !== 'ExpressionStatement' &&
				!readsTruthiness(node) &&
				!isPredicateReturn(services, node);
}

/**
 * Whether a value is the return of a callback that `typescript/strict-boolean-expressions` reads as a predicate: the
 * first argument of `filter`, `find`, `findIndex`, `findLast`, `findLastIndex`, `some`, or `every`. With type
 * information, the method must be the standard one of `Array` or `ReadonlyArray`, as that rule requires. Without it,
 * the name alone counts.
 */
function isPredicateReturn(services: TypeServices | null, value: ESTree.Expression) {
	const callback = returnedCallback(outermostWrapper(value));
	if (callback === null) return false;
	const { parent } = callback;
	if (parent.type !== 'CallExpression' || parent.arguments[0] !== callback) return false;
	const target = methodTarget(parent.callee);
	return target === null || !isPredicateMethod(target.name)
		? false
		: services === null || isStandardArrayMethod(services, target.property);
}

/** Whether an array method takes a predicate callback. */
function isPredicateMethod(name: string) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these methods read their callback's return as a truth value, so `default` covers the rest.
	switch (name) {
		case 'filter':
		case 'find':
		case 'findIndex':
		case 'findLast':
		case 'findLastIndex':
		case 'some':
		case 'every':
			return true;
		default:
			return false;
	}
}

/**
 * Whether an operand is no boolean. With type information, its type is not assignable to `boolean`. That accepts
 * `true`, `false`, `boolean`, `never`, and `any`. Without it, the operand is visibly no boolean.
 */
function isNonBoolean(
	sourceCode: SourceCode,
	services: TypeServices | null,
	operand: ESTree.Expression,
) {
	if (services === null) return isVisiblyNonBoolean(sourceCode, unwrap(operand));
	const type = typeAtLocation(services, operand);
	const { checker } = services;
	return type === null
		? isVisiblyNonBoolean(sourceCode, unwrap(operand))
		: !checker.isTypeAssignableTo(type, checker.getBooleanType());
}

/**
 * Whether an expression without wrappers is visibly no boolean: an object, array, string, number, bigint, regular
 * expression, `null`, or template literal, a function or class, JSX, a `new`, update, or `import()` expression, the
 * global `undefined`, a unary operator other than `!` and `delete`, or an arithmetic or bitwise operator. A conditional
 * counts when either branch is visibly no boolean. A `??` counts when its fallback is. Any other expression can be a
 * boolean.
 */
function isVisiblyNonBoolean(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only these expressions show that they are no boolean, so `default` covers the rest.
	switch (node.type) {
		case 'ObjectExpression':
		case 'ArrayExpression':
		case 'TemplateLiteral':
		case 'TaggedTemplateExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'ClassExpression':
		case 'JSXElement':
		case 'JSXFragment':
		case 'NewExpression':
		case 'UpdateExpression':
		case 'ImportExpression':
			return true;
		case 'Literal':
			return typeof node.value !== 'boolean';
		case 'UnaryExpression':
			return yieldsNonBoolean(node.operator);
		case 'BinaryExpression':
			return computesNonBoolean(node.operator);
		case 'ConditionalExpression':
			return (
				isVisiblyNonBoolean(sourceCode, unwrap(node.consequent)) ||
				isVisiblyNonBoolean(sourceCode, unwrap(node.alternate))
			);
		case 'LogicalExpression':
			return node.operator === '??' && isVisiblyNonBoolean(sourceCode, unwrap(node.right));
		case 'Identifier':
			return isUndefined(sourceCode, node);
		default:
			return false;
	}
}

/** Whether a unary operator yields no boolean: every one except `!` and `delete`. */
function yieldsNonBoolean(operator: ESTree.UnaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `!` and `delete` yield a boolean, so `default` covers the rest.
	switch (operator) {
		case '!':
		case 'delete':
			return false;
		default:
			return true;
	}
}

/**
 * Whether a binary operator yields no boolean: every arithmetic and bitwise one. Comparisons, `in`, and `instanceof`
 * yield one.
 */
function computesNonBoolean(operator: ESTree.BinaryOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only comparisons, `in`, and `instanceof` yield a boolean, so `default` covers the rest.
	switch (operator) {
		case '==':
		case '!=':
		case '===':
		case '!==':
		case '<':
		case '<=':
		case '>':
		case '>=':
		case 'in':
		case 'instanceof':
			return false;
		default:
			return true;
	}
}
