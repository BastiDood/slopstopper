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

/** What every check in a file reads: the threshold of each scalar kind, and the type services when available. */
interface Settings {
	thresholds: Record<ScalarKind, number>;
	services: TypeServices | null;
}

/**
 * Reports a signature whose positional parameters include too many of one scalar kind (`boolean`, `string`, `number`,
 * `bigint`, or `symbol`), since callers can swap same-kind values without a type error. By default, two `boolean`
 * parameters (the boolean trap) or three of any other kind are reported. Callbacks passed directly to a call or `new`
 * and JSX attribute handlers are exempt because the callee dictates their signature.
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
		const settings = {
			thresholds: parseThresholds(context.options),
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

/** Reports a signature that takes at least the threshold of positional parameters of one scalar kind. */
function check(
	context: Context,
	settings: Settings,
	node: { params: ESTree.ParamPattern[] } & ESTree.Node,
) {
	const counts = countScalarKinds(settings, node.params);
	if (counts === null) return;
	const { thresholds } = settings;
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

/**
 * How many parameters count toward each scalar kind, or `null` as soon as no kind can reach its threshold with the
 * parameters left, which spares their classification and type resolution. A parameter counts at most once toward each
 * kind, and a parameter that is not entirely scalar counts toward none.
 */
function countScalarKinds(
	{ thresholds, services }: Settings,
	parameters: readonly ESTree.ParamPattern[],
) {
	const counts = { boolean: 0, string: 0, number: 0, bigint: 0, symbol: 0 };
	let remaining = parameters.length;

	for (const parameter of parameters) {
		if (!canReachThreshold(thresholds, counts, remaining)) return null;
		--remaining;
		const kinds = kindsOf(services, parameter);
		if (kinds === null) continue;
		for (const kind of SCALAR_KINDS) {
			// oxlint-disable-next-line no-bitwise -- A kind mask is a bit set, so `&` tests membership.
			if ((kinds & kindBit(kind)) !== 0) ++counts[kind];
		}
	}
	return counts;
}

/** Whether some kind reaches its threshold when every one of the `remaining` parameters counts toward it. */
function canReachThreshold(
	thresholds: Record<ScalarKind, number>,
	counts: Record<ScalarKind, number>,
	remaining: number,
) {
	for (const kind of SCALAR_KINDS) {
		if (counts[kind] + remaining >= thresholds[kind]) return true;
	}
	return false;
}

/**
 * The kind mask of a parameter by its syntax and, when the syntax does not classify it as scalar, by its resolved type.
 * `null` when the parameter is not entirely scalar.
 */
function kindsOf(services: TypeServices | null, parameter: ESTree.ParamPattern) {
	const kinds = parameterKinds(parameter);
	if (kinds !== null) return kinds;
	if (services === null) return null;

	const identifier = positionalIdentifierOf(parameter);
	if (identifier === null) return null;
	const type = typeAtLocation(services, identifier);
	return type === null ? null : resolvedKinds(services.checker, type);
}

/**
 * The kind mask of a parameter by its type annotation or, without one, by its literal default value. `null` when the
 * parameter is not entirely scalar. The `this` parameter is not a positional argument, so it never counts.
 */
function parameterKinds(parameter: ESTree.ParamPattern): number | null {
	switch (parameter.type) {
		case 'Identifier': {
			const type = parameter.typeAnnotation?.typeAnnotation;
			return parameter.name !== 'this' && typeof type === 'object' ? typeKinds(type) : null;
		}
		case 'AssignmentPattern': {
			const { left } = parameter;
			if (left.type !== 'Identifier') return null;
			const type = left.typeAnnotation?.typeAnnotation;
			if (typeof type === 'object') return typeKinds(type);
			return literalKind(parameter.right);
		}
		case 'TSParameterProperty':
			return parameterKinds(parameter.parameter);
		case 'ObjectPattern':
		case 'ArrayPattern':
		case 'RestElement':
			return null;
	}
}

/**
 * The kind mask of a type annotation, or `null` when it is not entirely scalar: a primitive keyword, a literal or
 * template literal type, `null`, `undefined`, or a union of those. Type references are never scalars.
 */
function typeKinds(type: ESTree.TSType): number | null {
	const kind = typeKindOf(type.type);
	if (kind !== null) return kindBit(kind);

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several dozen type node types matter, so `default` covers the rest.
	switch (type.type) {
		case 'TSNullKeyword':
		case 'TSUndefinedKeyword':
			return 0;
		case 'TSLiteralType':
			return literalKind(type.literal);
		case 'TSUnionType':
			return unionKinds(type.types, typeKinds);
		default:
			return null;
	}
}

/**
 * The kind mask of a string, number, boolean, bigint, or template literal, including negated numbers, or `null` for any
 * other expression.
 */
function literalKind(expression: ESTree.Expression) {
	const literal =
		expression.type === 'UnaryExpression' && expression.operator === '-'
			? expression.argument
			: expression;

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only template literals and literals hold literal values, so `default` covers the rest.
	switch (literal.type) {
		case 'TemplateLiteral':
			return kindBit('string');
		case 'Literal': {
			const kind = scalarKindOf(literal.value);
			return kind === null ? null : kindBit(kind);
		}
		default:
			return null;
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
 * The kind mask of a resolved type, or `null` when it is not entirely scalar: each of its union members must be scalar,
 * `null`, or `undefined`. `never` and top types such as `any` and `unknown` are not.
 */
function resolvedKinds(checker: TypeChecker, type: Type) {
	if (isNeverOrTopType(checker, type)) return null;
	return type.isUnion()
		? unionKinds(assertDefined(type.types), member => memberKind(checker, member))
		: memberKind(checker, type);
}

/** The kind mask of a union: its members' masks combined, or `null` as soon as one member is not entirely scalar. */
function unionKinds<Member>(
	members: readonly Member[],
	memberKinds: (member: Member) => number | null,
) {
	let kinds = 0;
	for (const member of members) {
		const kindsOfMember = memberKinds(member);
		if (kindsOfMember === null) return null;
		// oxlint-disable-next-line no-bitwise -- A kind mask is a bit set, so `|` takes the union.
		kinds |= kindsOfMember;
	}
	return kinds;
}

/**
 * The kind mask of a type that is not a union: the bit of its scalar kind, `0` for `null` or `undefined`, or `null`
 * otherwise. An intersection is not scalar even when it is assignable to one, such as a branded `string`.
 */
function memberKind(checker: TypeChecker, type: Type) {
	if (type.isIntersection()) return null;
	for (const kind of SCALAR_KINDS) {
		if (checker.isTypeAssignableTo(type, scalarTypeOf(checker, kind))) return kindBit(kind);
	}

	const isNullish =
		checker.isTypeAssignableTo(type, checker.getNullType()) ||
		checker.isTypeAssignableTo(type, checker.getUndefinedType());
	return isNullish ? 0 : null;
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

/** The bit of a scalar kind in a kind mask, the integer that holds a set of kinds without hashing. */
function kindBit(kind: ScalarKind) {
	switch (kind) {
		case 'boolean':
			return 1;
		case 'string':
			return 2;
		case 'number':
			return 4;
		case 'bigint':
			return 8;
		case 'symbol':
			return 16;
	}
}
