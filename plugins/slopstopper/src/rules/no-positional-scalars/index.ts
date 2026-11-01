import { type Context, defineRule, type ESTree, type Options } from '@oxlint/plugins';

import { assertDefined } from '#assert.ts';
import { scalarKindOf } from '#ast/literals.ts';
import {
	isNeverOrTopType,
	type Type,
	type TypeChecker,
	typeAtLocation,
	type TypeServices,
	typeServicesOf,
} from '#type-services.ts';

/** Scalar kinds in reporting order: the boolean trap first. */
const SCALAR_KINDS = ['boolean', 'string', 'number', 'bigint', 'symbol'] as const;

type ScalarKind = (typeof SCALAR_KINDS)[number];

/** How many positional parameters of one kind a signature may take before it is reported. */
const DEFAULT_THRESHOLDS = { boolean: 2, string: 3, number: 3, bigint: 3, symbol: 3 };

/**
 * What every check in a file reads: the threshold of each scalar kind, the smallest of them, and the type services when
 * available.
 */
interface Settings {
	thresholds: Record<ScalarKind, number>;
	minimum: number;
	services: TypeServices | null;
}

/**
 * Reports a signature whose positional parameters include too many of one scalar kind (`boolean`, `string`, `number`,
 * `bigint`, or `symbol`), since callers can swap same-kind values without a type error. Parameters of different kinds
 * cannot be swapped silently, so `(name: string, age: number)` is fine. By default, two `boolean` parameters (the
 * boolean trap) or three of any other kind are reported; each threshold is configurable, such as `{ string: 2 }`.
 *
 * Literal and template literal types count toward their base kind, and an unannotated parameter counts by its literal
 * default value. A union counts toward every scalar kind it contains, ignoring `null` and `undefined`, and does not
 * count at all when it has a non-scalar member.
 *
 * With type information, a parameter that the syntax does not classify as scalar, such as `Id` in `type Id = string`
 * or an unannotated parameter with a non-literal default value, counts by its resolved type under the same rules: each
 * union member assignable to a scalar kind counts toward it, `null` and `undefined` count toward none, and any other
 * member makes the parameter non-scalar. Intersections such as branded `string & { brand: 'Id' }` are non-scalar,
 * like their syntax, because callers cannot swap differently branded values. `any`, `unknown`, and `never` never
 * count.
 *
 * Callbacks passed directly to a call or `new` and JSX attribute handlers are exempt because the callee dictates their
 * signature. Exported APIs are not exempt.
 */
export const NO_POSITIONAL_SCALARS = defineRule({
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Disallow signatures with too many positional parameters of one scalar kind.',
		},
		messages: {
			positionalScalars:
				'This signature takes {{count}} `{{kind}}` parameters by position, which callers can swap without a type error. Pass them in one object parameter so each value is named.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					boolean: { type: 'integer', minimum: 2 },
					string: { type: 'integer', minimum: 2 },
					number: { type: 'integer', minimum: 2 },
					bigint: { type: 'integer', minimum: 2 },
					symbol: { type: 'integer', minimum: 2 },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [DEFAULT_THRESHOLDS],
	},
	create(context) {
		const thresholds = parseThresholds(context.options);
		const settings = {
			thresholds,
			minimum: Math.min(...Object.values(thresholds)),
			services: typeServicesOf(context.sourceCode),
		};

		return {
			ArrowFunctionExpression: node => checkFunction(context, settings, node),
			FunctionDeclaration: node => checkFunction(context, settings, node),
			FunctionExpression: node => checkFunction(context, settings, node),
			TSDeclareFunction: node => check(context, settings, node),
			TSEmptyBodyFunctionExpression: node => check(context, settings, node),
			TSMethodSignature: node => check(context, settings, node),
			TSFunctionType: node => check(context, settings, node),
			TSCallSignatureDeclaration: node => check(context, settings, node),
			TSConstructSignatureDeclaration: node => check(context, settings, node),
			TSConstructorType: node => check(context, settings, node),
		};
	},
});

/** Checks a function unless its context dictates its signature. */
function checkFunction(
	context: Context,
	settings: Settings,
	node: ESTree.Function | ESTree.ArrowFunctionExpression,
) {
	if (isDictatedSignature(node)) return;
	check(context, settings, node);
}

/**
 * Reports a signature that takes at least the threshold of positional parameters of one scalar kind. A parameter counts
 * at most once toward each kind, so a signature with fewer parameters than the smallest threshold is skipped.
 */
function check(
	context: Context,
	{ thresholds, minimum, services }: Settings,
	node: { params: ESTree.ParamPattern[] } & ESTree.Node,
) {
	if (node.params.length < minimum) return;
	const counts = countScalarKinds(services, node.params);
	const kind = SCALAR_KINDS.find(candidate => counts[candidate] >= thresholds[candidate]);
	if (typeof kind === 'string') {
		context.report({
			node,
			messageId: 'positionalScalars',
			data: { count: counts[kind], kind },
		});
	}
}

/** The configured thresholds merged over the defaults. Options are untrusted input, so non-number values are ignored. */
function parseThresholds(options: Readonly<Options>) {
	const thresholds = { ...DEFAULT_THRESHOLDS };
	const [option] = options;

	if (typeof option === 'object' && option !== null && !Array.isArray(option)) {
		for (const kind of SCALAR_KINDS) {
			const value = option[kind];
			if (typeof value === 'number') thresholds[kind] = value;
		}
	}

	return thresholds;
}

/** How many parameters count toward each scalar kind. A parameter that is not entirely scalar counts toward none. */
function countScalarKinds(
	services: TypeServices | null,
	parameters: readonly ESTree.ParamPattern[],
) {
	const counts = { boolean: 0, string: 0, number: 0, bigint: 0, symbol: 0 };
	const kinds = new Set<ScalarKind>();

	for (const parameter of parameters) {
		kinds.clear();
		if (addKinds(services, parameter, kinds)) {
			for (const kind of kinds) ++counts[kind];
		}
	}
	return counts;
}

/**
 * Adds the scalar kinds of a parameter to `kinds` by its syntax and, when the syntax does not classify it as scalar,
 * by its resolved type. Returns whether the parameter is entirely scalar.
 */
function addKinds(
	services: TypeServices | null,
	parameter: ESTree.ParamPattern,
	kinds: Set<ScalarKind>,
) {
	if (addParameterKinds(parameter, kinds)) return true;
	kinds.clear();
	if (services === null) return false;

	const identifier = positionalIdentifierOf(parameter);
	if (identifier === null) return false;
	const type = typeAtLocation(services, identifier);
	return type !== null && addResolvedKinds(services.checker, type, kinds);
}

/**
 * Adds the scalar kinds of a parameter to `kinds`, by its type annotation or, without one, by its literal default value.
 * Returns whether the parameter is entirely scalar; otherwise, the caller discards `kinds`. The `this` parameter is not
 * a positional argument, so it never counts.
 */
function addParameterKinds(parameter: ESTree.ParamPattern, kinds: Set<ScalarKind>) {
	switch (parameter.type) {
		case 'Identifier': {
			const type = parameter.typeAnnotation?.typeAnnotation;
			return (
				parameter.name !== 'this' && typeof type === 'object' && addTypeKinds(type, kinds)
			);
		}
		case 'AssignmentPattern': {
			const { left } = parameter;
			if (left.type !== 'Identifier') return false;
			const type = left.typeAnnotation?.typeAnnotation;
			if (typeof type === 'object') return addTypeKinds(type, kinds);
			return addLiteralKind(parameter.right, kinds);
		}
		case 'TSParameterProperty':
			return addParameterKinds(parameter.parameter, kinds);
		case 'ObjectPattern':
		case 'ArrayPattern':
		case 'RestElement':
			return false;
	}
}

/**
 * Adds the scalar kinds of a type annotation to `kinds` and returns whether it is entirely scalar: a primitive keyword,
 * a literal or template literal type, `null`, `undefined`, or a union of those. Type references are never scalars.
 */
function addTypeKinds(type: ESTree.TSType, kinds: Set<ScalarKind>): boolean {
	const kind = typeKindOf(type.type);
	if (kind !== null) {
		kinds.add(kind);
		return true;
	}

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several dozen type node types matter, so `default` covers the rest.
	switch (type.type) {
		case 'TSNullKeyword':
		case 'TSUndefinedKeyword':
			return true;
		case 'TSLiteralType':
			return addLiteralKind(type.literal, kinds);
		case 'TSUnionType':
			return type.types.every(member => addTypeKinds(member, kinds));
		default:
			return false;
	}
}

/** Adds the kind of a string, number, boolean, bigint, or template literal to `kinds`, including negated numbers. */
function addLiteralKind(expression: ESTree.Expression, kinds: Set<ScalarKind>) {
	const literal =
		expression.type === 'UnaryExpression' && expression.operator === '-'
			? expression.argument
			: expression;

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only template literals and literals hold literal values, so `default` covers the rest.
	switch (literal.type) {
		case 'TemplateLiteral':
			kinds.add('string');
			return true;
		case 'Literal': {
			const kind = scalarKindOf(literal.value);
			if (kind === null) return false;
			kinds.add(kind);
			return true;
		}
		default:
			return false;
	}
}

/** The identifier that binds a positional parameter, or `null` for `this`, destructuring, and rest parameters. */
function positionalIdentifierOf(parameter: ESTree.ParamPattern) {
	switch (parameter.type) {
		case 'Identifier':
			return parameter.name === 'this' ? null : parameter;
		case 'AssignmentPattern':
			return parameter.left.type === 'Identifier' ? parameter.left : null;
		case 'TSParameterProperty':
			return positionalIdentifierOf(parameter.parameter);
		case 'ObjectPattern':
		case 'ArrayPattern':
		case 'RestElement':
			return null;
	}
}

/**
 * Adds the scalar kinds of a resolved type to `kinds` and returns whether it is entirely scalar: each of its union
 * members is scalar, `null`, or `undefined`. `never` and top types such as `any` and `unknown` are not.
 */
function addResolvedKinds(checker: TypeChecker, type: Type, kinds: Set<ScalarKind>) {
	if (isNeverOrTopType(checker, type)) return false;
	return type.isUnion()
		? assertDefined(type.types).every(member => addMemberKind(checker, member, kinds))
		: addMemberKind(checker, type, kinds);
}

/**
 * Adds the scalar kind of a type that is not a union to `kinds` and returns whether it is scalar, `null`, or
 * `undefined`. An intersection is not scalar even when it is assignable to one, such as a branded `string`.
 */
function addMemberKind(checker: TypeChecker, type: Type, kinds: Set<ScalarKind>) {
	if (type.isIntersection()) return false;
	for (const kind of SCALAR_KINDS) {
		if (checker.isTypeAssignableTo(type, scalarTypeOf(checker, kind))) {
			kinds.add(kind);
			return true;
		}
	}

	return (
		checker.isTypeAssignableTo(type, checker.getNullType()) ||
		checker.isTypeAssignableTo(type, checker.getUndefinedType())
	);
}

/** The type checker's type for a scalar kind. */
function scalarTypeOf(checker: TypeChecker, kind: ScalarKind) {
	switch (kind) {
		case 'boolean':
			return checker.getBooleanType();
		case 'string':
			return checker.getStringType();
		case 'number':
			return checker.getNumberType();
		case 'bigint':
			return checker.getBigIntType();
		case 'symbol':
			return checker.getESSymbolType();
	}
}

/**
 * Whether a function's signature is dictated by its context: an argument to a call or `new` (such as an
 * `Array#reduce` callback), or the value of a JSX attribute.
 */
function isDictatedSignature(node: ESTree.Function | ESTree.ArrowFunctionExpression) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (parent.type) {
		case 'CallExpression':
		case 'NewExpression':
			return parent.callee !== node;
		case 'JSXExpressionContainer':
			return parent.parent.type === 'JSXAttribute';
		default:
			return false;
	}
}

/** The scalar kind that a type node always denotes (primitive keywords and template literal types), or `null`. */
function typeKindOf(type: ESTree.TSType['type']) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (type) {
		case 'TSBooleanKeyword':
			return 'boolean';
		case 'TSStringKeyword':
		case 'TSTemplateLiteralType':
			return 'string';
		case 'TSNumberKeyword':
			return 'number';
		case 'TSBigIntKeyword':
			return 'bigint';
		case 'TSSymbolKeyword':
			return 'symbol';
		default:
			return null;
	}
}
