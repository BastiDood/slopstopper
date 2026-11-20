import {
	defineRule,
	type ESTree,
	type Reference,
	type Scope,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { firstConstInitializer, resolvedVariable } from '#ast/bindings.ts';
import { caseComparandsOf } from '#ast/case-comparand.ts';
import { type CaseComparand, unwrap } from '#ast/discriminant.ts';
import { messageLabel } from '#ast/labels.ts';
import { isEmptyLiteral, isEmptyObject, isNullLiteral, isUndefined } from '#ast/literals.ts';
import { isAndOr } from '#ast/logical-operands.ts';
import { isSvelteComponent } from '#ast/svelte.ts';
import { typeServicesOf } from '#type-services.ts';

import { branchCondition, type Copied, type Inserted, spreadSuggestions } from './rewrite.ts';

/** How a message words what receives the spread, the collection to build for it, its members, and their insertion. */
interface Collection {
	receiver: string;
	collection: string;
	members: string;
	insertion: string;
}

/**
 * What reading a spread operand needs from its file: the source, the case comparands of its conditions, and whether a
 * same-file `const` may be followed (see `followedConst`).
 */
interface FileContext {
	sourceCode: SourceCode;
	isCaseComparand: CaseComparand;
	followsConsts: boolean;
}

/** What receives a spread: the wording of its collection, and the members around the spread. */
interface Placement {
	collection: Collection;
	siblings: readonly (ESTree.Node | null)[];
}

/**
 * The placeholder branch of a conditional, the placeholder as `valueOf` sees it, and the other branch, whose value the
 * placeholder stands in for. `placeholder.value` is the placeholder. `value` is the other branch.
 */
interface PlaceholderBranch {
	branch: ESTree.Expression;
	placeholder: SeenValue;
	value: ESTree.Expression;
}

/**
 * An expression as `valueOf` sees it, and whether it is allocated each time the spread runs: written in place, or held
 * by a `const` whose read runs once with it (see `runsOnce`).
 */
interface SeenValue {
	value: ESTree.Expression;
	fresh: boolean;
}

const OBJECT_COLLECTION = {
	receiver: 'this object',
	collection: 'object',
	members: 'properties',
	insertion: 'assign the optional properties',
} satisfies Collection;

const ARRAY_COLLECTION = {
	receiver: 'this array',
	collection: 'array',
	members: 'elements',
	insertion: 'append the optional elements with `.push`',
} satisfies Collection;

const ARGUMENT_COLLECTION = {
	receiver: 'these arguments',
	collection: 'argument array',
	members: 'arguments',
	insertion: 'append the optional arguments with `.push`',
} satisfies Collection;

/**
 * Reports a spread in an object literal, an array literal, or the arguments of a call or `new` that copies a literal
 * allocated only to be spread. That is a conditional with `{}`, `[]`, `null`, or `undefined` on a branch where either
 * branch is an object or array literal, as in `{ ...(c ? { v } : {}) }`. It is also a `??` fallback to an empty
 * literal, as in `[...(xs ?? [])]`. An `&&` before a literal and an `||` fallback are left to `no-non-boolean-logical`,
 * which allows `&&` and `||` only between booleans. A fallback to `{}` written at an object spread is left to
 * `unicorn/no-useless-fallback-in-spread`, whose autofix spreads the value directly. The literal is built, copied, and
 * thrown away. Building the result once and adding the members in place saves that allocation. For call and `new`
 * arguments, the advice hoists the arguments into an array instead. The call then no longer hides the omission inside
 * its argument list. A spread of an existing value, as in `{ ...(c ? extra : null) }`, allocates nothing and is not
 * reported. A conditional that is not spread, as in `const o = c ? { v } : {}`, is not reported either. A spread of a
 * same-file `const` counts through its initializer when the spread is its one read and runs once with the declaration.
 * The advice then builds the result at the spread and drops that `const`. A placeholder branch or a fallback that names
 * such a `const` of an empty literal counts too. When members follow the spread, the advice builds the literal up to
 * the spread and adds the following members after the `if`. That order keeps their positions, which property wins, and
 * the evaluation order. When the literal alone initializes an annotated `const` or `let`, the rule suggests the
 * rewrite. The suggestion is not a fix. An assignment differs from a literal for a computed key that evaluates to
 * `__proto__`. A function or class assigned to a member also gets no inferred `name`.
 */
export const NO_CONDITIONAL_SPREAD = defineRule({
	meta: {
		type: 'suggestion',
		hasSuggestions: true,
		docs: {
			description:
				'Disallow spreading a literal that exists only to be copied, such as a conditional operand or an empty fallback.',
		},
		messages: {
			temporaryLiteral:
				'`...{{spread}}` allocates a literal only to copy it into {{receiver}}. Build the {{collection}} {{build}}, then {{insertion}} in `if ({{condition}}) { … }`{{rest}}.',
			emptyFallback:
				'`...{{spread}}` allocates `{{placeholder}}` only to copy nothing when `{{value}}` is absent. Build the {{collection}} {{build}}, then {{insertion}} in an `if` that checks `{{value}}`{{rest}}.',
			insertMembers:
				'Build `{{name}}` without the omitted members, then insert them in an `if`. If a computed key can evaluate to `__proto__`, or a moved function or class needs its inferred `name`, suppress this diagnostic instead.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);
		const file = {
			sourceCode,
			isCaseComparand: caseComparandsOf(sourceCode),
			// A template can read a `const` where the scope analysis cannot see it.
			followsConsts: !hasTemplate(context.filename),
		} satisfies FileContext;
		return {
			SpreadElement(node) {
				const placement = placementOf(node);
				if (placement === null) return;
				const omission = omissionOf(file, node);
				if (omission === null) return;
				context.report({
					node,
					messageId: omission.messageId,
					data: {
						...wordingOf(placement, node, omission.declared),
						...omission.data,
						spread: messageLabel(sourceCode.getText(node).slice('...'.length)),
					},
					suggest:
						omission.insertion === null
							? null
							: spreadSuggestions(sourceCode, services, node, omission.insertion),
				});
			},
		};
	},
});

/**
 * What receives a spread: an object literal, an array literal, or the arguments of a call or `new`, as the collection's
 * wording with the members around the spread. Returns `null` for a spread in any other position.
 */
function placementOf(node: ESTree.SpreadElement) {
	const { parent } = node;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only literals and argument lists build a value from their spreads, so `default` covers the rest.
	switch (parent.type) {
		case 'ObjectExpression':
			return {
				collection: OBJECT_COLLECTION,
				siblings: parent.properties,
			} satisfies Placement;
		case 'ArrayExpression':
			return { collection: ARRAY_COLLECTION, siblings: parent.elements } satisfies Placement;
		case 'CallExpression':
		case 'NewExpression':
			return {
				collection: ARGUMENT_COLLECTION,
				siblings: parent.arguments,
			} satisfies Placement;
		default:
			return null;
	}
}

/**
 * The message for a spread argument, or `null` when the spread copies no temporary literal. A literal inside a `const`
 * that only the spread reads counts as written at the spread when the read runs once with it. The message then names
 * that `const`. The advice drops it.
 */
function omissionOf(file: FileContext, spread: ESTree.SpreadElement) {
	const unwrapped = unwrap(spread.argument);
	const followed = followedConst(file, unwrapped);
	// The advice moves the initializer to the spread. A read that runs more than once would evaluate it on every run.
	const moved = followed?.fresh === true ? followed : null;
	const examined = moved === null ? unwrapped : moved.value;
	const syntactic = syntacticOmission(file, examined, spread);
	return syntactic === null ? null : { ...syntactic, declared: moved?.name ?? null };
}

/**
 * The message of a spread argument that copies a temporary literal, or `null` for any other spread argument: a
 * conditional with a placeholder branch where either branch is an object or array literal (see `placeholderBranchOf`),
 * or an empty `??` fallback. Expects the argument of `spread` seen through assertions. It is seen through a `const`
 * only when `omissionOf` moves that `const` to the spread. A placeholder and a fallback are seen through a `const`. The
 * literal of a value branch must be written in place. A `const` there holds an existing value. A placeholder or
 * fallback `const` whose read can run more than once allocates its literal once. Only an argument written as the spread
 * operand gets a suggestion. A followed `const` or an assertion around it blocks one. Only there does
 * `unicorn/no-useless-fallback-in-spread` see a `{}` fallback.
 */
function syntacticOmission(
	file: FileContext,
	argument: ESTree.Expression,
	spread: ESTree.SpreadElement,
) {
	const { sourceCode, isCaseComparand } = file;
	const written = argument === spread.argument;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only conditionals and logical expressions choose a temporary literal, so `default` covers the rest.
	switch (argument.type) {
		case 'ConditionalExpression': {
			const split = placeholderBranchOf(file, argument);
			if (split === null) return null;
			const {
				branch,
				placeholder: { value: placeholder, fresh },
				value,
			} = split;
			// `no-non-boolean-logical` reports an `&&` or `||` branch. Its spread is reported once that branch is fixed.
			if (isAndOr(unwrap(value))) return null;
			const allocates =
				(fresh && isEmptyLiteral(placeholder)) || isCollectionLiteral(unwrap(value));
			if (!allocates) return null;
			const condition = branchCondition(sourceCode, isCaseComparand, argument, value);
			// A placeholder that comes through a `const` or an assertion gets no suggestion. The rewrite would drop the assertion
			// or leave the `const` unread.
			return temporaryLiteral(condition, value, written && placeholder === branch);
		}
		case 'LogicalExpression': {
			const { operator, left, right } = argument;
			// `no-non-boolean-logical` reports an `&&` or `||` with a literal operand.
			if (operator !== '??') return null;
			// `unicorn/no-useless-fallback-in-spread` autofixes `{ ...(x ?? {}) }` into `{ ...x }`, which allocates nothing.
			const leftToUnicorn =
				written && isEmptyObject(right) && spread.parent.type === 'ObjectExpression';
			const { value: fallback, fresh } = valueOf(file, right);
			const allocates = fresh && isEmptyLiteral(fallback);
			return leftToUnicorn || !allocates
				? null
				: {
						messageId: 'emptyFallback',
						data: {
							placeholder: sourceCode.getText(right),
							value: messageLabel(sourceCode.getText(left)),
						},
						insertion: null,
					};
		}
		default:
			return null;
	}
}

/**
 * The message of a spread that copies a temporary literal under `condition`. Its insertion of `value` lets a suggestion
 * rewrite the spread. It has no insertion when the spread is not `rewritable`.
 */
function temporaryLiteral(condition: Copied, value: ESTree.Expression, rewritable: boolean) {
	return {
		messageId: 'temporaryLiteral',
		data: { condition: messageLabel(condition.text) },
		insertion: rewritable ? ({ condition, value } satisfies Inserted) : null,
	};
}

/**
 * The branch of a conditional whose value is a placeholder (see `isPlaceholder`), that placeholder, and the other
 * branch. The consequent is checked first. Returns `null` when neither branch is a placeholder.
 */
function placeholderBranchOf(
	file: FileContext,
	{ consequent, alternate }: ESTree.ConditionalExpression,
) {
	const { sourceCode } = file;
	const yes = valueOf(file, consequent);
	if (isPlaceholder(sourceCode, yes.value)) {
		return {
			branch: consequent,
			placeholder: yes,
			value: alternate,
		} satisfies PlaceholderBranch;
	}
	const no = valueOf(file, alternate);
	return isPlaceholder(sourceCode, no.value)
		? ({
				branch: alternate,
				placeholder: no,
				value: consequent,
			} satisfies PlaceholderBranch)
		: null;
}

/**
 * Whether a branch only stands in for absent members: `{}`, `[]`, `null`, the global `undefined`, or `void` of a
 * literal. Expects the branch value that `valueOf` gives.
 */
function isPlaceholder(sourceCode: SourceCode, value: ESTree.Expression) {
	return isEmptyLiteral(value) || isNullLiteral(value) || isUndefined(sourceCode, value);
}

/** Whether an expression allocates an object or array literal. Expects the expression without wrappers (see `unwrap`). */
function isCollectionLiteral({ type }: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only object and array literals allocate a collection to spread, so `default` covers the rest.
	switch (type) {
		case 'ObjectExpression':
		case 'ArrayExpression':
			return true;
		default:
			return false;
	}
}

/**
 * An expression seen through TypeScript assertions and through the `const` it names (see `followedConst`), and whether
 * it is allocated each time the spread runs.
 */
function valueOf(file: FileContext, node: ESTree.Expression) {
	const unwrapped = unwrap(node);
	return (
		followedConst(file, unwrapped) ?? ({ value: unwrapped, fresh: true } satisfies SeenValue)
	);
}

/**
 * The name and the initializer, seen through TypeScript assertions, of the same-file `const` that an expression without
 * wrappers names and reads for the only time, or `null` for any other expression. Imports, `let` bindings, and
 * parameters give `null`. So does an exported `const`, which other modules can read. So does a `const` that code reads
 * more than once. Another read can fill it, as in `const defaults: Options = {}; if (c) defaults.a = 1;`, or guard the
 * spread, as in `x === null ? null : { ...x }`. Its value then serves more than the spread. The result also tells
 * whether its initializer evaluates each time the read runs (see `runsOnce`). In a component with a template (see
 * `hasTemplate`), no `const` is followed. The template can read it where the scope analysis cannot see it.
 */
function followedConst({ sourceCode, followsConsts }: FileContext, bare: ESTree.Expression) {
	if (!followsConsts || bare.type !== 'Identifier') return null;
	const variable = resolvedVariable(sourceCode, bare);
	if (variable === null || isExported(variable)) return null;
	const read = onlyElement(variable.references.filter(({ init }) => !init));
	if (read === null) return null;
	const init = firstConstInitializer(variable);
	return init === null
		? null
		: { name: bare.name, value: unwrap(init), fresh: runsOnce(read, variable.scope) };
}

/**
 * Whether a file is a component with a template: a Svelte or Astro component. The template can read the bindings of the
 * script or frontmatter. Oxlint lints only the script. Its scope analysis does not see those reads.
 */
function hasTemplate(filename: string) {
	return isSvelteComponent(filename) || filename.endsWith('.astro');
}

/**
 * Whether a read evaluates once each time the scope of its variable runs. A read in a nested function can run any
 * number of times. So can a read in a loop inside that scope, as in
 * `const extra = c ? { v } : {}; for (const item of items) out.push({ ...item, ...extra });`. The one literal then
 * serves every run. Moving its initializer to the read would evaluate it on every run.
 */
function runsOnce({ identifier, from }: Reference, scope: Scope) {
	if (from.variableScope !== scope.variableScope) return false;
	for (
		let child: ESTree.Node = identifier;
		child !== scope.block && child.parent !== null;
		child = child.parent
	) {
		if (repeats(child.parent, child)) return false;
	}
	return true;
}

/**
 * Whether `parent` is a loop that runs `child` on every iteration: any child except a `for` init or a `for…in` or
 * `for…of` iterable. Any other parent runs `child` at most once.
 */
function repeats(parent: ESTree.Node, child: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only loops run a child more than once, so `default` covers the rest.
	switch (parent.type) {
		case 'WhileStatement':
		case 'DoWhileStatement':
			return true;
		case 'ForStatement':
			return parent.init !== child;
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.right !== child;
		default:
			return false;
	}
}

/** Whether a variable is declared by an exported declaration, as in `export const x = …;`. */
function isExported({ defs }: Variable) {
	return defs.some(({ node }) => node.parent?.parent?.type === 'ExportNamedDeclaration');
}

/**
 * The wording of a collection with how to build it around the spread. The collection is built once when the spread is
 * the last member. Otherwise it is built up to the spread. The following members are then added after the `if`. That
 * order keeps their positions, which property wins, and the evaluation order. When the spread names the `const` called
 * `declared`, the advice also drops that `const`. Building the collection in its place saves the copy.
 */
function wordingOf(
	{ collection, siblings }: Placement,
	spread: ESTree.SpreadElement,
	declared: string | null,
) {
	const dropped = declared === null ? '' : ` and drop \`${declared}\``;
	return siblings.at(-1) === spread
		? { ...collection, build: `once${dropped}`, rest: '' }
		: {
				...collection,
				build: `up to the spread${dropped}`,
				rest: `, then add the ${collection.members} that follow`,
			};
}
