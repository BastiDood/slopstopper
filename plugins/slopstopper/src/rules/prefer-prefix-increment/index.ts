import { defineRule, type ESTree, type Reference, type SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { resolvedVariable } from '#ast/bindings.ts';
import { negatedNumber } from '#ast/literals.ts';
import { dropsComment } from '#ast/ranges.ts';
import {
	isNeverOrTopType,
	typeAtLocation,
	type TypeServices,
	typeServicesOf,
} from '#type-services.ts';

/**
 * Reports `x += 1` and `x -= 1` in favor of `++x` and `--x`, and a postfix `x++` or `x--` whose value is discarded in
 * favor of its prefix form.
 *
 * The postfix rewrite is an autofix because a discarded value cannot change behavior. The compound assignment has the
 * value of the prefix update only when `x` is a number: a string concatenates (`s += 1` appends `'1'`) and a bigint
 * throws. The rule autofixes it when the type checker resolves `x` to a number type, or when `x` is a local `let`
 * initialized to a number literal whose every write is an update or a `+=` or `-=` of a number literal. Otherwise, it
 * offers a suggestion.
 */
export const PREFER_PREFIX_INCREMENT = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description: 'Prefer `++x` and `--x` over `x += 1`, `x -= 1`, and a discarded `x++`.',
		},
		messages: {
			preferPrefix:
				'Use the prefix `{{operator}}x`: the value of `x{{operator}}` is discarded.',
			preferUpdate: '`x {{assignment}} 1` is `{{operator}}x` for a number.',
			rewriteAsUpdate:
				'Rewrite as `{{operator}}x` when `x` is a number. Suppress the diagnostic otherwise.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);

		return {
			UpdateExpression(node) {
				if (node.prefix || !isDiscarded(node)) return;
				const { argument, operator } = node;
				context.report({
					node,
					messageId: 'preferPrefix',
					data: { operator },
					fix(fixer) {
						if (
							dropsComment(sourceCode, { range: node.range, kept: [argument.range] })
						) {
							return null;
						}

						const text = sourceCode.getText(argument);
						const target = plainTarget(argument) === null ? `(${text})` : text;
						return fixer.replaceText(node, `${operator}${target}`);
					},
				});
			},
			AssignmentExpression(node) {
				const operator = updateOperatorOf(node.operator);
				const left = plainTarget(node.left);
				if (operator === null || left === null || numberValue(node.right) !== 1) return;

				const data = { assignment: node.operator, operator };
				if (dropsComment(sourceCode, { range: node.range, kept: [left.range] })) {
					context.report({ node, messageId: 'preferUpdate', data });
					return;
				}

				const replacement = `${operator}${sourceCode.getText(left)}`;

				if (isNumber(sourceCode, services, left)) {
					context.report({
						node,
						messageId: 'preferUpdate',
						data,
						fix: fixer => fixer.replaceText(node, replacement),
					});
					return;
				}

				context.report({
					node,
					messageId: 'preferUpdate',
					data,
					suggest: [
						{
							messageId: 'rewriteAsUpdate',
							data,
							fix: fixer => fixer.replaceText(node, replacement),
						},
					],
				});
			},
		};
	},
});

/**
 * Whether the value of an expression is discarded: it is an expression statement, the `init` or `update` of a `for`
 * loop, or an element of a sequence other than its last, or the last element of a sequence whose value is discarded.
 */
function isDiscarded(node: ESTree.Expression): boolean {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types discard a value, so `default` covers the rest.
	switch (parent.type) {
		case 'ExpressionStatement':
			return true;
		case 'ForStatement':
			return parent.init === node || parent.update === node;
		case 'SequenceExpression':
			return parent.expressions.at(-1) !== node || isDiscarded(parent);
		default:
			return false;
	}
}

/** Whether a target is proven to hold a number, by its resolved type or by the writes to its local `let` binding. */
function isNumber(
	sourceCode: SourceCode,
	services: TypeServices | null,
	target: ESTree.IdentifierReference | ESTree.MemberExpression,
) {
	if (services !== null && hasNumberType(services, target)) return true;
	return target.type === 'Identifier' && isNumericCounter(sourceCode, target);
}

/** Whether the type checker resolves an expression to `number`, a number literal type, or a union of those. */
function hasNumberType(services: TypeServices, node: ESTree.Expression) {
	const { checker } = services;
	const type = typeAtLocation(services, node);
	return (
		type !== null &&
		!isNeverOrTopType(checker, type) &&
		checker.isTypeAssignableTo(type, checker.getNumberType())
	);
}

/**
 * Whether an identifier resolves to a local `let` initialized to a number literal, such as `0` or `-1`, whose every
 * other write is an update or a `+=` or `-=` of a number literal, so that it always holds a number.
 */
function isNumericCounter(sourceCode: SourceCode, identifier: ESTree.IdentifierReference) {
	const variable = resolvedVariable(sourceCode, identifier);
	if (variable === null) return false;

	const definition = onlyElement(variable.defs);
	if (definition?.parent?.type !== 'VariableDeclaration' || definition.parent.kind !== 'let') {
		return false;
	}

	const { node } = definition;
	return (
		node.type === 'VariableDeclarator' &&
		node.id.type === 'Identifier' &&
		node.init !== null &&
		(numberValue(node.init) !== null || negatedNumber(node.init) !== null) &&
		variable.references.every(isNumericWrite)
	);
}

/** Whether a reference is no write besides the initialization, or a write that keeps a number a number. */
function isNumericWrite(reference: Reference) {
	if (reference.init || !reference.isWrite()) return true;
	const { parent } = reference.identifier;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only updates and compound assignments keep a number a number, so `default` covers the rest.
	switch (parent.type) {
		case 'UpdateExpression':
			return true;
		case 'AssignmentExpression':
			return updateOperatorOf(parent.operator) !== null && numberValue(parent.right) !== null;
		default:
			return false;
	}
}

/** An identifier or a member target, which an update operator takes without parentheses, or `null` for any other. */
function plainTarget(node: ESTree.AssignmentTarget) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Patterns and TypeScript expression wrappers are no plain target, so `default` covers them.
	switch (node.type) {
		case 'Identifier':
		case 'MemberExpression':
			return node;
		default:
			return null;
	}
}

/** The update operator that a compound assignment of `1` equals, or `null` for any operator but `+=` and `-=`. */
function updateOperatorOf(operator: ESTree.AssignmentOperator) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `+=` and `-=` have an update operator, so `default` covers the rest.
	switch (operator) {
		case '+=':
			return '++';
		case '-=':
			return '--';
		default:
			return null;
	}
}

/** The value of a number literal, or `null` for any other expression. */
function numberValue(node: ESTree.Expression) {
	return node.type === 'Literal' && typeof node.value === 'number' ? node.value : null;
}
