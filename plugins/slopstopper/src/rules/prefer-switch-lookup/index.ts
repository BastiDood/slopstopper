import {
	type Context,
	defineRule,
	type ESTree,
	type Fixer,
	type Options,
	type Reference,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { constReads, declaresValue } from '#ast/bindings.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { decisionVisitor } from '#ast/decisions.ts';
import { type CaseComparand, equalityRuns } from '#ast/discriminant.ts';
import { type ArrayEvidence, arrayEvidence, mayBuildArray } from '#ast/known-arrays.ts';
import { logicalOperands } from '#ast/logical-operands.ts';
import { runsOnce } from '#ast/runs.ts';

import {
	caseValuesOf,
	holdsHandlers,
	type TableKind,
	tableKindOf,
	type TableShape,
	tableShapeOf,
} from './tables.ts';
import { type TableUse, tableUse, usesOf, writesTable } from './uses.ts';

/** What a case table does: test `membership`, look up `values`, or `dispatch` to the function it finds. */
type Operation = 'membership' | 'values' | 'dispatch';

type Limits = Record<Operation, number>;

/**
 * The largest number of entries that each operation turns into a `switch`. Above it, an array or an `||` chain that
 * tests membership becomes a `Set`, and other tables are left alone. The README explains how the benchmark set these.
 */
const DEFAULT_LIMITS = { membership: 16, values: 16, dispatch: 24 } satisfies Limits;

/** What every check in a file reads: the limits, and the case comparand predicate (see `caseComparandsOf`). */
interface Settings {
	limits: Limits;
	isCaseComparand: CaseComparand;
}

/** A `const` that binds a name to an initializer and is read in this file only (see `constReads`). */
interface Binding {
	id: ESTree.BindingIdentifier;
	init: ESTree.Expression;
	variable: Variable;
	reads: Reference[];
}

/** A case table at or under its limit, which a `switch` replaces (see `lookupOf`). */
interface SwitchLookup {
	action: 'switch';
	shape: TableShape;
	operation: Operation;
}

/** A membership array above its limit, which a `Set` replaces (see `lookupOf`). */
interface SetLookup {
	action: 'set';
	shape: TableShape;
}

type Lookup = SwitchLookup | SetLookup;

/** A read of a table, and how it uses the table (see `tableUse`). */
interface TableRead {
	identifier: Reference['identifier'];
	use: TableUse;
}

/**
 * Reports a constant table that a `switch` in its own function replaces: an `||` chain of `===` comparisons against one
 * discriminant, or an array, `Set`, `Map`, or object literal whose keys a `switch` case can name and whose every read
 * tests membership, looks up a value, or calls the function it finds. Each operation has a limit on the entries. Above
 * the `membership` limit, an array or a chain becomes a `Set` instead. An array that is not such a table, but that is
 * only searched with `.includes` more than once or inside a function or loop, becomes a `Set` too. The test of an `if`
 * in a decision that `prefer-switch` owns (see `decisionVisitor`) is left to that rule. An exported table stays for
 * other modules, so each lookup of it in this file is reported instead (see `checkExportedTable`).
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
			switchMembership: `Replace this {{table}} of {{count}} entries with a \`switch\` ${switchCases('membership')}, extracted into a function.`,
			switchValues: `Replace this {{table}} of {{count}} entries with a \`switch\` ${switchCases('values')}, extracted into a function.`,
			switchDispatch: `Replace this {{table}} of {{count}} handlers with a \`switch\` ${switchCases('dispatch')}, extracted into a function.`,
			switchExportedLookup:
				'Replace this lookup in the exported table `{{name}}` of {{count}} entries with a `switch` {{how}}, extracted into a function. Other modules can keep reading the table.',
			preferSet:
				'`{{name}}` is only searched for membership. Make it a `Set` and call `.has`.',
			suggestSet:
				'Make `{{name}}` a `Set` and call `.has`. Suppress the diagnostic instead if `{{name}}` can be a string, whose `.includes` searches for a substring, or an array that code changes through another name.',
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
	const [option] = options;
	if (typeof option !== 'object' || option === null || Array.isArray(option)) {
		return DEFAULT_LIMITS;
	}
	const { membership, values, dispatch } = option;
	return {
		membership: typeof membership === 'number' ? membership : DEFAULT_LIMITS.membership,
		values: typeof values === 'number' ? values : DEFAULT_LIMITS.values,
		dispatch: typeof dispatch === 'number' ? dispatch : DEFAULT_LIMITS.dispatch,
	} satisfies Limits;
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
 * Reports a `const` that holds a case table whose every read is a lookup (see `lookupOf`), or an array that is only
 * searched with `.includes` (see `checkSearchedArray`). An exported table is left to `checkExportedTable`. The checks
 * run from cheap to costly: the initializer's syntax (see `tableShapeOf` and `mayBuildArray`), the binding, each read,
 * and only then the entries.
 */
function checkBinding(context: Context, settings: Settings, declarator: ESTree.VariableDeclarator) {
	const { init } = declarator;
	if (init === null) return;
	const { sourceCode } = context;
	const shape = tableShapeOf(sourceCode, init);
	if (shape === null && !mayBuildArray(init)) return;
	const bound = constReads(sourceCode, declarator);
	if (bound === null) return;
	if (bound.exported) {
		if (shape !== null) checkExportedTable(context, settings, shape, bound.reads);
		return;
	}
	const uses = usesOf(sourceCode, shape?.kind ?? 'array', bound.reads);
	if (uses === null) return;
	const binding = { ...bound, init } satisfies Binding;
	const lookup = shape === null ? null : lookupOf(sourceCode, settings, shape, uses);
	if (lookup === null) {
		checkSearchedArray(context, binding, uses);
		return;
	}
	reportBoundLookup(context, binding, lookup, uses);
}

/**
 * Reports each lookup in this file of an exported case table that a `switch` replaces (see `lookupOf`). Other modules
 * can read the table in any way, so the table stays, reads that are no lookup are skipped, and no table becomes a
 * `Set`. A read that changes the table (see `writesTable`) shows that it is no constant, so nothing is reported. Only
 * the reads that the `switch` replaces are reported, so neither a guard around a dispatch call nor a membership test of
 * a value table is.
 */
function checkExportedTable(
	context: Context,
	settings: Settings,
	shape: TableShape,
	reads: readonly Reference[],
) {
	const { sourceCode } = context;
	const tableReads: TableRead[] = [];
	for (const { identifier } of reads) {
		const use = tableUse(sourceCode, shape.kind, identifier);
		if (use === null) {
			if (writesTable(shape.kind, identifier)) return;
		} else {
			tableReads.push({ identifier, use });
		}
	}
	const lookup = lookupOf(
		sourceCode,
		settings,
		shape,
		tableReads.map(({ use }) => use),
	);
	if (lookup?.action !== 'switch') return;
	const { operation } = lookup;
	for (const { identifier, use } of tableReads) {
		if (replacesUse(operation, use)) {
			context.report({
				node: identifier,
				messageId: 'switchExportedLookup',
				data: { name: identifier.name, count: shape.entries, how: switchCases(operation) },
			});
		}
	}
}

/** Whether the `switch` that replaces a table of the given operation replaces a read of it. */
function replacesUse(operation: Operation, { kind }: TableUse) {
	switch (kind) {
		case 'membership':
		case 'includes':
			return operation === 'membership';
		case 'value':
		case 'guard':
			return operation === 'values';
		case 'call':
			return operation === 'dispatch';
		case 'size':
		case 'type':
			return false;
	}
}

/** How a report describes the cases of the `switch` that replaces a table of the given operation. */
function switchCases(operation: Operation) {
	switch (operation) {
		case 'membership':
			return 'whose fall-through cases return `true`';
		case 'values':
			return 'that returns each value';
		case 'dispatch':
			return 'whose cases call each handler';
	}
}

/** Reports a table literal written where it is used, as in `['a', 'b'].includes(k)`. A bound table is left to `checkBinding`. */
function checkInline(
	context: Context,
	settings: Settings,
	node: ESTree.ArrayExpression | ESTree.ObjectExpression | ESTree.NewExpression,
) {
	const kind = tableKindOf(node);
	if (kind === null) return;
	const { sourceCode } = context;
	const use = tableUse(sourceCode, kind, node);
	if (use === null) return;
	const shape = tableShapeOf(sourceCode, node);
	if (shape === null) return;
	const lookup = lookupOf(sourceCode, settings, shape, [use]);
	if (lookup === null) return;
	switch (lookup.action) {
		case 'switch':
			reportSwitch(context, node, lookup);
			return;
		case 'set':
			context.report({
				node,
				messageId: 'hoistSet',
				data: { count: lookup.shape.entries, limit: settings.limits.membership },
			});
	}
}

/**
 * What replaces a table, judged by every read of it, or `null` when nothing does. A table at or under its limit
 * becomes a `switch` when its entries fit cases, and a dispatch table must also hold handlers. Above its limit, only an
 * array that tests membership remains, and it becomes a `Set`. The limit is checked before the entries.
 */
function lookupOf(
	sourceCode: SourceCode,
	{ limits, isCaseComparand }: Settings,
	shape: TableShape,
	uses: readonly TableUse[],
) {
	const operation = operationOf(uses);
	if (operation === null) return null;
	if (shape.entries <= limits[operation]) {
		const values = caseValuesOf(isCaseComparand, shape);
		if (values === null) return null;
		return operation === 'dispatch' && !holdsHandlers(sourceCode, values)
			? null
			: ({ action: 'switch', shape, operation } satisfies SwitchLookup);
	}
	if (shape.kind !== 'array' || operation !== 'membership') return null;
	return caseValuesOf(isCaseComparand, shape) === null
		? null
		: ({ action: 'set', shape } satisfies SetLookup);
}

/**
 * What a table does, judged by every read of it, or `null` when the reads only read the size or the type. A table
 * whose found value is called dispatches, and its membership tests and guards protect the call; a value read beside a
 * call rules it out. Otherwise a value read or a guard makes it a value table, and only membership tests make it a
 * membership table.
 */
function operationOf(uses: readonly TableUse[]) {
	let calls = false;
	let values = false;
	let guards = false;
	let membership = false;
	for (const { kind } of uses) {
		switch (kind) {
			case 'call':
				calls = true;
				break;
			case 'value':
				values = true;
				break;
			case 'guard':
				guards = true;
				break;
			case 'membership':
			case 'includes':
				membership = true;
				break;
			case 'size':
			case 'type':
				break;
		}
	}
	if (calls) return values ? null : 'dispatch';
	if (values || guards) return 'values';
	return membership ? 'membership' : null;
}

/** Reports a bound case table as a `switch`, or a bound membership array above its limit as a `Set`. */
function reportBoundLookup(
	context: Context,
	binding: Binding,
	lookup: Lookup,
	uses: readonly TableUse[],
) {
	switch (lookup.action) {
		case 'switch':
			reportSwitch(context, binding.id, lookup);
			return;
		case 'set':
			reportSet(context, binding, includesMembers(uses), 'fresh');
	}
}

function reportSwitch(context: Context, node: ESTree.Node, { shape, operation }: SwitchLookup) {
	context.report({
		node,
		messageId: switchMessage(operation),
		data: { table: tableName(shape.kind), count: shape.entries },
	});
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
 * once: there are several reads, or the one read can run repeatedly (see `runsOnce`). The initializer must build an
 * array (see `arrayEvidence`). The reads are checked first, because that check is cheaper.
 */
function checkSearchedArray(context: Context, binding: Binding, uses: readonly TableUse[]) {
	const members = includesMembers(uses);
	if (members === null) return;
	const only = onlyElement(binding.reads);
	if (only !== null && runsOnce(only, binding.variable.scope)) return;
	const evidence = arrayEvidence(context.sourceCode, binding.init);
	if (evidence !== null) reportSet(context, binding, members, evidence);
}

/** The member of every `A.includes(k)` read, or `null` when some read tests membership another way or does not. */
function includesMembers(uses: readonly TableUse[]) {
	const members: ESTree.MemberExpression[] = [];
	for (const use of uses) {
		if (use.kind !== 'includes') return null;
		members.push(use.member);
	}
	return members;
}

/**
 * Reports an array that should be a `Set`. The rewrite wraps the initializer in `new Set(…)` and renames every
 * `.includes` to `.has`, which compares the same way (SameValueZero). It exists only when every read is an `.includes`
 * call, the binding has no type annotation, which would no longer fit, and `Set` names the global. It is an autofix
 * for an array that no other name holds, and a suggestion when the initializer can be a string or another name's
 * array (see `arrayEvidence`).
 */
function reportSet(
	context: Context,
	{ id, init }: Binding,
	members: readonly ESTree.MemberExpression[] | null,
	evidence: ArrayEvidence,
) {
	const { sourceCode } = context;
	const descriptor = { node: id, messageId: 'preferSet', data: { name: id.name } } as const;
	const annotated = (id.typeAnnotation ?? null) !== null;
	if (members === null || annotated || declaresValue(sourceCode.getScope(init), 'Set')) {
		context.report(descriptor);
		return;
	}
	switch (evidence) {
		case 'fresh':
			context.report({
				...descriptor,
				fix: fixer => setRewrite(sourceCode, fixer, init, members),
			});
			return;
		case 'possible':
			context.report({
				...descriptor,
				suggest: [
					{
						messageId: 'suggestSet',
						data: { name: id.name },
						fix: fixer => setRewrite(sourceCode, fixer, init, members),
					},
				],
			});
	}
}

/**
 * Wraps an array initializer in `new Set(…)` and renames each `.includes` to `.has`. A computed key such as
 * `['includes']` keeps its quotes.
 */
function setRewrite(
	sourceCode: SourceCode,
	fixer: Fixer,
	init: ESTree.Expression,
	members: readonly ESTree.MemberExpression[],
) {
	return [
		fixer.insertTextBefore(init, 'new Set('),
		fixer.insertTextAfter(init, ')'),
		...members.map(({ property, computed }) => {
			const quote = computed ? sourceCode.getText(property).charAt(0) : '';
			return fixer.replaceText(property, `${quote}has${quote}`);
		}),
	];
}
