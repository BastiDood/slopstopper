import {
	type Context,
	defineRule,
	type ESTree,
	type Fixer,
	type Options,
	type Scope,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { decisionVisitor } from '#ast/decisions.ts';
import { type CaseComparand, equalityRuns, unwrap } from '#ast/discriminant.ts';
import { isKnownArrayExpression, methodTarget } from '#ast/known-arrays.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import { runsOnce } from '#ast/runs.ts';

import { type CaseTable, caseTableOf, isDeclared, type TableKind, tableKindOf } from './tables.ts';
import { type TableUse, tableUse } from './uses.ts';

/** What a case table does: test `membership`, look up `values`, or `dispatch` to the function it finds. */
type Operation = 'membership' | 'values' | 'dispatch';

/**
 * The largest number of entries that each operation turns into a `switch`. Above it, an array or an `||` chain that
 * tests membership becomes a `Set`, and other tables are left alone. The README explains how the benchmark set these.
 */
const DEFAULT_LIMITS = { membership: 16, values: 16, dispatch: 24 };

type Limits = Record<Operation, number>;

/** What every check in a file reads: the limits, and the case comparand predicate (see `caseComparandsOf`). */
interface Settings {
	limits: Limits;
	isCaseComparand: CaseComparand;
}

/**
 * Reports a constant table that a `switch` in its own function replaces: an `||` chain of `===` comparisons against one
 * discriminant, or an array, `Set`, `Map`, or object literal whose keys a `switch` case can name and whose every read
 * tests membership, looks up a value, or calls the function it finds. Each operation has a limit on the entries. Above
 * the `membership` limit, an array or a chain becomes a `Set` instead. An array that is not such a table, but that is
 * only searched with `.includes` more than once or inside a function or loop, becomes a `Set` too. The test of an `if`
 * in a decision that `prefer-switch` owns (see `decisionVisitor`) is left to that rule.
 */
export const PREFER_SWITCH_LOOKUP = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		hasSuggestions: true,
		docs: {
			description:
				'Prefer a `switch` in a function over constant lookup tables and `||` chains of `===` comparisons, and a `Set` over large or computed arrays searched with `.includes`.',
		},
		messages: {
			switchChain:
				'Replace this chain of {{count}} `===` comparisons with a `switch` on `{{discriminant}}` whose fall-through cases return `true`, extracted into a function.',
			setChain:
				'Replace this chain of {{count}} `===` comparisons on `{{discriminant}}` with one `.has` call on a module-level `Set`, since it exceeds the `membership` limit of {{limit}}.',
			switchMembership:
				'Replace this {{table}} of {{count}} entries with a `switch` whose fall-through cases return `true`, extracted into a function.',
			switchValues:
				'Replace this {{table}} of {{count}} entries with a `switch` that returns each value, extracted into a function.',
			switchDispatch:
				'Replace this {{table}} of {{count}} handlers with a `switch` whose cases call each handler, extracted into a function.',
			preferSet:
				'`{{name}}` is only searched for membership. Make it a `Set` and call `.has`.',
			suggestSet:
				'Make `{{name}}` a `Set` and call `.has`. Suppress the diagnostic instead if `{{name}}` can be a string, whose `.includes` searches for a substring.',
			hoistSet:
				'Hoist this array of {{count}} values into a module-level `Set` and call `.has`, since it exceeds the `membership` limit of {{limit}}.',
		},
		schema: [
			{
				type: 'object',
				properties: {
					membership: { type: 'integer', minimum: 1 },
					values: { type: 'integer', minimum: 1 },
					dispatch: { type: 'integer', minimum: 1 },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [DEFAULT_LIMITS],
	},
	create(context) {
		const settings = {
			limits: parseLimits(context.options),
			isCaseComparand: caseComparandsOf(context.sourceCode),
		} satisfies Settings;
		const owned = new Set<ESTree.IfStatement>();

		return {
			...decisionVisitor(settings.isCaseComparand, decision => {
				if (decision.kind === 'switch') {
					for (const member of decision.members) owned.add(member);
				}
			}),
			LogicalExpression: node => checkChain(context, settings, owned, node),
			VariableDeclarator: node => checkBinding(context, settings, node),
			ArrayExpression: node => checkInline(context, settings, node),
			ObjectExpression: node => checkInline(context, settings, node),
			NewExpression: node => checkInline(context, settings, node),
		};
	},
});

/** The configured limits merged over the defaults. Options are untrusted input, so non-number values are ignored. */
function parseLimits(options: Readonly<Options>) {
	const limits = { ...DEFAULT_LIMITS };
	const [option] = options;
	if (typeof option === 'object' && option !== null && !Array.isArray(option)) {
		for (const operation of ['membership', 'values', 'dispatch'] as const) {
			const value = option[operation];
			if (typeof value === 'number') limits[operation] = value;
		}
	}
	return limits;
}

/** Reports each run of `===` comparisons against one discriminant in the outermost `||` chain of a test. */
function checkChain(
	context: Context,
	{ limits, isCaseComparand }: Settings,
	owned: Set<ESTree.IfStatement>,
	node: ESTree.LogicalExpression,
) {
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

	for (const run of equalityRuns(isCaseComparand, logicalOperands(node, node.operator))) {
		context.report({
			loc: { start: run.first.loc.start, end: run.last.loc.end },
			messageId: run.count <= limits.membership ? 'switchChain' : 'setChain',
			data: {
				discriminant: context.sourceCode.getText(run.discriminant),
				count: run.count,
				limit: limits.membership,
			},
		});
	}
}

/**
 * Reports a `const` that holds a case table whose every read is a lookup (see `tableUse`), or an array that is only
 * searched with `.includes` (see `checkSearchedArray`). An exported binding has reads in other modules, so it is skipped.
 */
function checkBinding(context: Context, settings: Settings, declarator: ESTree.VariableDeclarator) {
	const { id, init, parent } = declarator;
	if (id.type !== 'Identifier' || init === null) return;
	if (parent.type !== 'VariableDeclaration' || parent.kind !== 'const') return;
	if (parent.parent.type === 'ExportNamedDeclaration') return;

	const { sourceCode } = context;
	const variable = onlyElement(sourceCode.getDeclaredVariables(declarator));
	if (variable === null) return;
	const reads = variable.references.filter(({ init: initializes }) => !initializes);
	if (reads.length === 0) return;

	const kind = tableKindOf(sourceCode.getScope(declarator), unwrap(init));
	const table =
		kind === null ? null : caseTableOf(sourceCode, settings.isCaseComparand, kind, init);
	if (table !== null) {
		const uses = reads.map(({ identifier }) => tableUse(sourceCode, table.kind, identifier));
		const operation = operationOf(table, uses);
		if (operation !== null) {
			reportTable(context, settings, { table, operation, uses, declarator, name: id.name });
			return;
		}
	}
	checkSearchedArray(context, declarator, variable);
}

/** Reports a table literal written where it is used, as in `['a', 'b'].includes(k)`. A bound table is left to `checkBinding`. */
function checkInline(
	context: Context,
	settings: Settings,
	node: ESTree.ArrayExpression | ESTree.ObjectExpression | ESTree.NewExpression,
) {
	const { sourceCode } = context;
	const kind = tableKindOf(sourceCode.getScope(node), node);
	if (kind === null) return;
	const use = tableUse(sourceCode, kind, node);
	if (use === null) return;
	const table = caseTableOf(sourceCode, settings.isCaseComparand, kind, node);
	if (table === null) return;
	const operation = operationOf(table, [use]);
	if (operation === null) return;

	const { limits } = settings;
	if (table.entries <= limits[operation]) {
		context.report({
			node,
			messageId: switchMessage(operation),
			data: { table: tableName(table.kind), count: table.entries },
		});
	} else if (operation === 'membership' && table.kind === 'array') {
		context.report({
			node,
			messageId: 'hoistSet',
			data: { count: table.entries, limit: limits.membership },
		});
	}
}

/**
 * What a table does, judged by every read of it, or `null` when a read fits no operation or only reads the size or the
 * type. A table that holds only functions and whose found value is called dispatches, and its membership tests guard
 * the call. Otherwise a value read makes it a value table, and only membership tests make it a membership table.
 */
function operationOf({ holdsFunctions }: CaseTable, uses: readonly (TableUse | null)[]) {
	let calls = false;
	let values = false;
	let membership = false;
	for (const use of uses) {
		if (use === null) return null;
		switch (use.kind) {
			case 'call':
				calls = true;
				break;
			case 'value':
				values = true;
				break;
			case 'membership':
				membership = true;
				break;
			case 'size':
			case 'type':
				break;
		}
	}
	if (calls) return holdsFunctions && !values ? 'dispatch' : null;
	if (values) return 'values';
	return membership ? 'membership' : null;
}

/** The facts that a report of a bound table reads. */
interface BoundTable {
	table: CaseTable;
	operation: Operation;
	uses: readonly (TableUse | null)[];
	declarator: ESTree.VariableDeclarator;
	name: string;
}

/** Reports a bound table at or under its limit as a `switch`, or a membership array above it as a `Set`. */
function reportTable(
	context: Context,
	{ limits }: Settings,
	{ table, operation, uses, declarator, name }: BoundTable,
) {
	if (table.entries <= limits[operation]) {
		context.report({
			node: declarator.id,
			messageId: switchMessage(operation),
			data: { table: tableName(table.kind), count: table.entries },
		});
		return;
	}
	if (operation !== 'membership' || table.kind !== 'array') return;
	const includes = uses.map(use => (use?.kind === 'membership' ? use.includes : null));
	reportSet(context, { declarator, name, includes, proven: true });
}

/** How a report names the container of a table. */
function tableName(kind: TableKind) {
	switch (kind) {
		case 'array':
			return 'array';
		case 'set':
			return '`Set`';
		case 'map':
			return '`Map`';
		case 'object':
			return 'object';
	}
}

function switchMessage(operation: Operation) {
	switch (operation) {
		case 'membership':
			return 'switchMembership';
		case 'values':
			return 'switchValues';
		case 'dispatch':
			return 'switchDispatch';
	}
}

/**
 * Reports an array that is not a case table but is only searched with `A.includes(x)`, when the search runs more than
 * once: there are several reads, or the one read can run repeatedly (see `runsOnce`).
 */
function checkSearchedArray(
	context: Context,
	declarator: ESTree.VariableDeclarator,
	{ references, scope }: Variable,
) {
	const { id, init } = declarator;
	if (id.type !== 'Identifier' || init === null) return;
	const { sourceCode } = context;
	const proven = isKnownArrayExpression(sourceCode, init);
	if (!proven && !buildsArray(sourceCode.getScope(declarator), unwrap(init))) return;
	const reads = references.filter(({ init: initializes }) => !initializes);
	const includes = reads.map(({ identifier }) => {
		const use = tableUse(sourceCode, 'array', identifier);
		return use?.kind === 'membership' ? use.includes : null;
	});
	if (includes.some(property => property === null)) return;
	const only = onlyElement(reads);
	if (only !== null && runsOnce(only, scope)) return;
	reportSet(context, { declarator, name: id.name, includes, proven });
}

/**
 * Whether an expression builds an array by its shape alone: `new Array(…)`, `Array(…)`, `Array.from(…)`,
 * `Array.of(…)`, or a call of a method that returns an array on arrays, whatever its receiver. A string's `concat` or
 * `slice` has the same name, so the receiver can still be no array.
 */
function buildsArray(scope: Scope, node: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `new` and calls build an array, so `default` covers the rest.
	switch (node.type) {
		case 'NewExpression':
		case 'CallExpression': {
			const callee = unwrap(node.callee);
			if (callee.type === 'Identifier') {
				return callee.name === 'Array' && !isDeclared(scope, 'Array');
			}
			if (node.type === 'NewExpression') return false;
			const target = methodTarget(callee);
			if (target === null) return false;
			const { object, name } = target;
			return object.type === 'Identifier' && object.name === 'Array'
				? isArrayFactory(name)
				: returnsArray(name);
		}
		default:
			return false;
	}
}

function isArrayFactory(name: string) {
	switch (name) {
		case 'from':
		case 'of':
			return true;
		default:
			return false;
	}
}

function returnsArray(name: string) {
	switch (name) {
		case 'concat':
		case 'copyWithin':
		case 'fill':
		case 'filter':
		case 'flat':
		case 'flatMap':
		case 'map':
		case 'reverse':
		case 'slice':
		case 'sort':
		case 'splice':
		case 'toReversed':
		case 'toSorted':
		case 'toSpliced':
		case 'with':
			return true;
		default:
			return false;
	}
}

/**
 * An array that should be a `Set`: its declarator and name, the `.includes` property of each read (`null` for a read
 * that tests membership another way), and whether the initializer is `proven` to be an array (see
 * `isKnownArrayExpression`).
 */
interface SetCandidate {
	declarator: ESTree.VariableDeclarator;
	name: string;
	includes: readonly (
		| ESTree.Expression
		| ESTree.IdentifierName
		| ESTree.PrivateIdentifier
		| null
	)[];
	proven: boolean;
}

/**
 * Reports an array that should be a `Set`. The rewrite wraps the initializer in `new Set(…)` and renames every
 * `.includes` to `.has`, which compares the same way (SameValueZero). It exists only when every read is an `.includes`
 * call and the binding has no type annotation, which would no longer fit. It is an autofix for a proven array, and a
 * suggestion when only the method name says that the initializer builds an array.
 */
function reportSet(context: Context, { declarator, name, includes, proven }: SetCandidate) {
	const { id, init } = declarator;
	const descriptor = { node: id, messageId: 'preferSet', data: { name } } as const;
	const properties = includes.filter(property => property !== null);
	if (init === null || id.typeAnnotation !== null || properties.length !== includes.length) {
		context.report(descriptor);
		return;
	}
	if (proven) {
		context.report({ ...descriptor, fix: fixer => setRewrite(fixer, init, properties) });
		return;
	}
	context.report({
		...descriptor,
		suggest: [
			{
				messageId: 'suggestSet',
				data: { name },
				fix: fixer => setRewrite(fixer, init, properties),
			},
		],
	});
}

/** Wraps an array initializer in `new Set(…)` and renames each `.includes` property to `.has`. */
function setRewrite(
	fixer: Fixer,
	init: ESTree.Expression,
	properties: readonly (ESTree.Expression | ESTree.IdentifierName | ESTree.PrivateIdentifier)[],
) {
	return [
		fixer.insertTextBefore(init, 'new Set('),
		fixer.insertTextAfter(init, ')'),
		...properties.map(property => fixer.replaceText(property, 'has')),
	];
}
