import {
	type Context,
	type Definition,
	defineRule,
	type ESTree,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { AssertionError } from '#assert.ts';
import { firstConstInitializer, onlyDefinition, unvisitedVariable } from '#ast/bindings.ts';
import { isUnsafeValue } from '#ast/dictionary-types.ts';
import { unwrap } from '#ast/discriminant.ts';
import { enclosingFunction } from '#ast/functions.ts';
import { functionLabel, keyName, messageLabel } from '#ast/labels.ts';
import { written } from '#ast/type-aliases.ts';

import { wideningTarget } from './widening-targets.ts';

/** A value that flows into an annotated destination, and what the message calls the destination. */
interface Flow {
	messageId: 'annotation' | 'assignment' | 'returnValue';
	value: ESTree.Expression;
	subject: string;
}

/** The parameter that a type guard narrows: its position and the identifier that it binds. */
interface NarrowedParameter {
	index: number;
	binding: ESTree.BindingIdentifier;
}

/** A node that may carry a type annotation of its own, such as the identifier that a definition binds. */
interface AnnotatedNode {
	typeAnnotation?: ESTree.TSTypeAnnotation | null;
	parent: ESTree.Node;
}

/**
 * Reports a value whose type the code already knows, such as an object literal or a `const` bound to one, that flows
 * into an explicit type that discards it (see `wideningTarget`): a variable, property, or return type annotation, an
 * assignment to an annotated variable, or a type assertion. An empty object literal may start an open dictionary. Also
 * reports such a value passed to the `unknown` parameter of a same-file type guard, which only re-checks it.
 */
export const NO_KNOWN_VALUE_WIDENING = defineRule({
	meta: {
		type: 'problem',
		hasSuggestions: true,
		docs: {
			description:
				'Disallow explicit types that discard the known type of a value, such as `unknown`, `object`, anonymous object types, and open dictionaries.',
		},
		messages: {
			annotation:
				'The annotation `{{type}}` on {{subject}} discards the known type of `{{value}}`. Remove the annotation, and append `satisfies {{type}}` to the value if it must still conform.',
			assignment:
				'The annotation `{{type}}` on {{subject}} discards the known type of the assigned `{{value}}`. Declare {{subject}} where it gets this value, without the annotation, or annotate it with a named interface.',
			returnValue:
				'The return type `{{type}}` of {{subject}} discards the known type of `{{value}}`. Remove the return type so that TypeScript infers it, or declare a named interface for it.',
			assertion:
				'The assertion to `{{type}}` discards the known type of `{{value}}`. Write `satisfies {{type}}` instead, which checks the value and keeps its type.',
			replaceWithSatisfies:
				'Replace `as` with `satisfies`. If later code needs the asserted type, suppress the diagnostic instead.',
			guardArgument:
				'`{{value}}` already has a known type, which the `unknown` parameter `{{parameter}}` of the type guard {{subject}} discards. Use the known type of `{{value}}` directly instead of calling {{subject}}.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		return {
			VariableDeclarator({ id, init }) {
				if (init === null || id.type !== 'Identifier') return;
				checkAnnotated(context, id.typeAnnotation, {
					messageId: 'annotation',
					value: init,
					subject: `\`${id.name}\``,
				});
			},
			PropertyDefinition: node => checkProperty(context, node),
			AccessorProperty: node => checkProperty(context, node),
			AssignmentExpression({ operator, left, right }) {
				if (operator !== '=' || left.type !== 'Identifier') return;
				const definition = onlyDefinition(sourceCode, left);
				if (definition === null) return;
				const { node: declarator } = definition;
				if (
					declarator.type !== 'VariableDeclarator' ||
					declarator.id.type !== 'Identifier'
				) {
					return;
				}
				checkAnnotated(context, declarator.id.typeAnnotation, {
					messageId: 'assignment',
					value: right,
					subject: `\`${declarator.id.name}\``,
				});
			},
			ReturnStatement(node) {
				const { argument } = node;
				const owner = enclosingFunction(node);
				if (argument === null || owner === null) return;
				checkAnnotated(context, owner.returnType, {
					messageId: 'returnValue',
					value: argument,
					subject: functionLabel(owner),
				});
			},
			ArrowFunctionExpression(node) {
				const { body, returnType } = node;
				if (body.type === 'BlockStatement') return;
				checkAnnotated(context, returnType, {
					messageId: 'returnValue',
					value: body,
					subject: functionLabel(node),
				});
			},
			TSAsExpression: node => checkAssertion(context, node),
			TSTypeAssertion: node => checkAssertion(context, node),
			CallExpression: node => checkGuardCall(context, node),
		};
	},
});

/** Checks the value of a class property against its annotation. */
function checkProperty(
	context: Context,
	node: ESTree.PropertyDefinition | ESTree.AccessorProperty,
) {
	const { key, computed, value, typeAnnotation } = node;
	if (value === null) return;
	const name = keyName(key, computed) ?? context.sourceCode.getText(key);
	checkAnnotated(context, typeAnnotation, {
		messageId: 'annotation',
		value,
		subject: `\`${messageLabel(name)}\``,
	});
}

/** Reports a flow into an annotated destination when the annotation discards the known type of the value. */
function checkAnnotated(
	context: Context,
	annotation: ESTree.TSTypeAnnotation | null | undefined,
	flow: Flow,
) {
	if (annotation === null || typeof annotation === 'undefined') return;
	const { sourceCode } = context;
	const { messageId, value, subject } = flow;
	const { typeAnnotation: target } = annotation;
	if (!widensKnownValue(sourceCode, target, value)) return;

	context.report({
		node: value,
		messageId,
		data: {
			type: messageLabel(sourceCode.getText(target)),
			value: messageLabel(sourceCode.getText(value)),
			subject,
		},
	});
}

/**
 * Reports a type assertion that discards the known type of its value, with a suggestion to replace `as` with
 * `satisfies`. Only the outermost of chained assertions counts, so that `x as unknown as T` reports at most once. An
 * empty literal is left to `no-untyped-empty-initializer`, because `satisfies` would keep its empty type.
 */
function checkAssertion(context: Context, node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) {
	const { sourceCode } = context;
	const { expression, typeAnnotation, parent } = node;
	if (
		isAssertion(parent) ||
		isEmptyLiteral(unwrap(expression)) ||
		!widensKnownValue(sourceCode, typeAnnotation, expression)
	) {
		return;
	}

	const data = {
		type: messageLabel(sourceCode.getText(typeAnnotation)),
		value: messageLabel(sourceCode.getText(expression)),
	};
	if (node.type === 'TSTypeAssertion') {
		context.report({ node, messageId: 'assertion', data });
		return;
	}

	const keyword = sourceCode.getFirstTokenBetween(
		expression,
		typeAnnotation,
		token => token.value === 'as',
	);
	if (keyword === null) {
		throw new AssertionError('the `as` keyword separates a value from its type');
	}
	context.report({
		node,
		messageId: 'assertion',
		data,
		suggest: [
			{
				messageId: 'replaceWithSatisfies',
				fix: fixer => fixer.replaceText(keyword, 'satisfies'),
			},
		],
	});
}

function isAssertion({ type }: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two assertion node types matter, so `default` covers the rest.
	switch (type) {
		case 'TSAsExpression':
		case 'TSTypeAssertion':
			return true;
		default:
			return false;
	}
}

/** Whether an expression without wrappers (see `unwrap`) is an empty array literal, an empty object literal, or `null`. */
function isEmptyLiteral(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only array, object, and `null` literals can be empty, so `default` covers the rest.
	switch (node.type) {
		case 'ArrayExpression':
			return node.elements.length === 0;
		case 'ObjectExpression':
			return isEmptyObject(node);
		case 'Literal':
			return node.value === null && !('regex' in node);
		default:
			return false;
	}
}

/**
 * Whether an explicit target type discards the known type of a value: the target widens it (see `wideningTarget`),
 * the value has a known type (see `hasKnownType`), and the value is no empty object literal that starts an open
 * dictionary.
 */
function widensKnownValue(sourceCode: SourceCode, target: ESTree.TSType, value: ESTree.Expression) {
	const widening = wideningTarget(sourceCode, target);
	if (widening === null) return false;
	const node = unwrap(value);
	if (widening === 'open dictionary' && isEmptyObject(node)) return false;
	return hasKnownType(sourceCode, [], node);
}

/** Whether an expression without wrappers (see `unwrap`) is an object literal without properties. */
function isEmptyObject(node: ESTree.Expression) {
	return node.type === 'ObjectExpression' && node.properties.length === 0;
}

/**
 * Whether a value has a type that the code spells out (see `isKnownValue`), directly or through `const` bindings.
 * `visited` holds the bindings already followed, so that a cycle of bindings ends.
 */
function hasKnownType(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	const node = unwrap(expression);
	if (isKnownValue(node)) return true;
	if (node.type !== 'Identifier') return false;
	const variable = unvisitedVariable(sourceCode, visited, node);
	if (variable === null) return false;
	const init = firstConstInitializer(variable);
	return init !== null && hasKnownType(sourceCode, visited, init);
}

/**
 * Reports an argument with a known type (see `hasKnownArgumentType`) that a call passes to the `unknown` parameter
 * that a same-file type guard narrows, as in `isString('text')` with `function isString(value: unknown): value is string`.
 */
function checkGuardCall(context: Context, { callee, arguments: args }: ESTree.CallExpression) {
	const { sourceCode } = context;
	const guard = calledFunction(sourceCode, callee);
	if (guard === null) return;
	const narrowed = narrowedParameter(guard);
	if (narrowed === null) return;

	const { index, binding } = narrowed;
	const argument = args[index];
	if (typeof argument === 'undefined' || argument.type === 'SpreadElement') return;

	const annotation = identifierAnnotation(binding);
	if (annotation === null || !containsUnknown(annotation.typeAnnotation)) return;
	if (!hasKnownArgumentType(sourceCode, [], argument)) return;

	context.report({
		node: argument,
		messageId: 'guardArgument',
		data: {
			value: messageLabel(sourceCode.getText(argument)),
			parameter: binding.name,
			subject: functionLabel(guard),
		},
	});
}

/** The parameter that a function's type predicate narrows, or `null` when it declares no type predicate. */
function narrowedParameter({
	params,
	returnType,
}: ESTree.ArrowFunctionExpression | ESTree.Function) {
	const predicate = returnType?.typeAnnotation;
	if (predicate?.type !== 'TSTypePredicate' || predicate.parameterName.type !== 'Identifier') {
		return null;
	}

	const { name } = predicate.parameterName;
	for (const [index, parameter] of params.entries()) {
		const binding = parameterBinding(parameter);
		if (binding?.name === name) return { index, binding } satisfies NarrowedParameter;
	}
	return null;
}

/** The identifier that a parameter binds, through a default value, a rest element, or a parameter property, or `null` for a destructuring parameter. */
function parameterBinding(
	parameter: ESTree.ParamPattern | ESTree.BindingPattern,
): ESTree.BindingIdentifier | null {
	switch (parameter.type) {
		case 'Identifier':
			return parameter;
		case 'AssignmentPattern':
			return parameterBinding(parameter.left);
		case 'RestElement':
			return parameterBinding(parameter.argument);
		case 'TSParameterProperty':
			return parameterBinding(parameter.parameter);
		case 'ObjectPattern':
		case 'ArrayPattern':
			return null;
	}
}

/** Whether a type is `unknown` or a union that holds `unknown`. */
function containsUnknown(type: ESTree.TSType): boolean {
	return (
		type.type === 'TSUnknownKeyword' ||
		(type.type === 'TSUnionType' && type.types.some(containsUnknown))
	);
}

/**
 * Whether an argument has a type that gives evidence beyond `unknown`: a known value (see `isKnownValue`), an assertion
 * to an informative type (one that is not unsafe, see `isUnsafeValue`), a call of a same-file function with an
 * informative return type, or a binding with an informative annotation or a `const` initializer with a known type. `visited` holds the bindings
 * already followed, so that a cycle of bindings ends. The only wrapper (see `unwrap`) that reaches the known value check
 * is an optional chain, which holds a call or a member access and so never a known value.
 */
function hasKnownArgumentType(
	sourceCode: SourceCode,
	visited: Variable[],
	expression: ESTree.Expression,
): boolean {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- The other expressions count only as known values, which `default` checks.
	switch (expression.type) {
		case 'TSNonNullExpression':
		case 'TSSatisfiesExpression':
			return hasKnownArgumentType(sourceCode, visited, expression.expression);
		case 'TSAsExpression':
		case 'TSTypeAssertion':
			return !isUnsafeValue(sourceCode, written(expression.typeAnnotation));
		case 'CallExpression': {
			const called = calledFunction(sourceCode, expression.callee);
			if (called === null) return false;
			const { returnType } = called;
			if (returnType === null || typeof returnType === 'undefined') return false;
			return !isUnsafeValue(sourceCode, written(returnType.typeAnnotation));
		}
		case 'Identifier':
			return hasKnownBindingType(sourceCode, visited, expression);
		default:
			return isKnownValue(expression);
	}
}

/** Whether a binding has an informative annotation, or no annotation and a `const` initializer with a known type. */
function hasKnownBindingType(
	sourceCode: SourceCode,
	visited: Variable[],
	identifier: ESTree.IdentifierReference,
) {
	const variable = unvisitedVariable(sourceCode, visited, identifier);
	if (variable === null) return false;

	const definition = onlyElement(variable.defs);
	const annotation = definition === null ? null : bindingAnnotation(definition);
	if (annotation !== null) return !isUnsafeValue(sourceCode, written(annotation.typeAnnotation));
	const init = firstConstInitializer(variable);
	return init !== null && hasKnownArgumentType(sourceCode, visited, init);
}

/**
 * The same-file function that a callee names: a function expression, a function declaration, or the initializer of a
 * variable, or `null` for any other callee, such as a parameter.
 */
function calledFunction(sourceCode: SourceCode, callee: ESTree.Expression) {
	const node = unwrap(callee);
	if (node.type !== 'Identifier') return functionOf(node);
	const definition = onlyDefinition(sourceCode, node);
	if (definition === null) return null;
	const { type, node: declaration } = definition;
	switch (type) {
		case 'FunctionName':
			return functionOf(declaration);
		case 'Variable':
			return declaration.type === 'VariableDeclarator' && declaration.init !== null
				? functionOf(unwrap(declaration.init))
				: null;
		case 'Parameter':
		case 'CatchClause':
		case 'ClassName':
		case 'ImportBinding':
		case 'ImplicitGlobalVariable':
			return null;
	}
}

/** The node as a function with parameters, or `null` for any other node. */
function functionOf(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only functions have parameters and a return type, so `default` covers the rest.
	switch (node.type) {
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'FunctionDeclaration':
		case 'TSDeclareFunction':
			return node;
		default:
			return null;
	}
}

/**
 * Whether an expression spells out its own type: an object, array, function, or class literal, a `new` expression, a
 * literal, a template literal, or a unary expression. Expects a node without wrappers (see `unwrap`).
 */
function isKnownValue(node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals and constructions spell out their type, so `default` covers the rest.
	switch (node.type) {
		case 'ObjectExpression':
		case 'ArrayExpression':
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
		case 'ClassExpression':
		case 'NewExpression':
		case 'Literal':
		case 'TemplateLiteral':
		case 'UnaryExpression':
			return true;
		default:
			return false;
	}
}

/**
 * The annotation of the identifier that a variable or parameter definition binds (see `identifierAnnotation`), or
 * `null` when it has none or the definition is of another kind.
 */
function bindingAnnotation({ type, name }: Definition) {
	switch (type) {
		case 'Variable':
		case 'Parameter':
			return identifierAnnotation(name);
		case 'CatchClause':
		case 'ClassName':
		case 'FunctionName':
		case 'ImportBinding':
		case 'ImplicitGlobalVariable':
			return null;
	}
}

/**
 * The annotation of an identifier that binds a name: that of the rest element around it, or its own, or `null` when it
 * has none. A destructured identifier has none of its own.
 */
function identifierAnnotation({ typeAnnotation, parent }: AnnotatedNode) {
	const own = typeAnnotation ?? null;
	return parent.type === 'RestElement' ? (parent.typeAnnotation ?? own) : own;
}
