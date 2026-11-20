import type { ESTree, Fix, Range, SourceCode } from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { holdsStatements } from '#ast/decisions.ts';
import type { CaseComparand } from '#ast/discriminant.ts';
import { indentation } from '#ast/layout.ts';
import { BINDABLE_NAME_REGEX } from '#ast/names.ts';
import { negatedText } from '#ast/negation.ts';
import { propertyName } from '#ast/property-keys.ts';
import { dropsComment } from '#ast/ranges.ts';
import {
	isWritableKey,
	type Type,
	type TypeChecker,
	typeAtLocation,
	type TypeServices,
} from '#type-services.ts';

/** A `const` or `let` declaration of one identifier: its name, its type annotation, and the statement that holds it. */
interface Declaration {
	name: string;
	annotation: ESTree.TSType | null;
	statement: ESTree.Node;
}

/** An object literal or an array literal without holes, and the members it holds. */
interface Literal {
	literal: ESTree.ObjectExpression | ESTree.ArrayExpression;
	members: readonly ESTree.Node[];
}

/**
 * A literal that alone initializes a declaration, checked to take inserted members: the declared name, the statement
 * that holds it, and the declared type when type information is available.
 */
interface Receiver extends Literal {
	name: string;
	statement: ESTree.Node;
	declared: DeclaredType | null;
}

/** The declared type of a receiver, with the checker that queries it. */
interface DeclaredType {
	checker: TypeChecker;
	type: Type;
}

/** Text that a rewrite copies from the source, with the ranges it copies. A rewrite drops each comment outside them. */
export interface Copied {
	text: string;
	kept: readonly Range[];
}

/** How a suggestion inserts a spread's value: the `if` condition with the source range it copies, and the value. */
export interface Inserted {
	condition: Copied;
	value: ESTree.Expression;
}

/**
 * The text that replaces a declared initializer. The `if` after it has a condition, the statements it runs, and the
 * statements after it.
 */
interface Rewrite {
	base: Copied;
	condition: Copied;
	inserted: readonly Copied[];
	trailing: readonly Copied[];
}

/**
 * The suggestion that builds the declared literal from the members before the spread, inserts the spread's value in an
 * `if`, and adds array elements after the spread, or `null` when the literal cannot take the rewrite (see `receiverOf`).
 * A sole spread, object members after the spread, a value or member that cannot move (see `valueInsertions` and
 * `memberInsertions`), and a rewrite that `insertionFix` refuses also give `null`.
 */
export function spreadSuggestions(
	sourceCode: SourceCode,
	services: TypeServices | null,
	spread: ESTree.SpreadElement,
	{ condition, value }: Inserted,
) {
	const receiver = receiverOf(services, spread.parent);
	if (receiver === null) return null;
	const { literal, members } = receiver;
	const index = members.indexOf(spread);
	const before = members.slice(0, index);
	const after = members.slice(index + 1);
	// A sole spread of a literal is the autofix of `unicorn/no-useless-spread`. Object members after the spread would be
	// missing from the base, which fails a type that requires them.
	const sole = members.length === 1;
	const trailingKeys = literal.type === 'ObjectExpression' && after.length > 0;
	if (sole || trailingKeys) return null;
	const inserted = valueInsertions(sourceCode, receiver, value);
	if (inserted === null) return null;
	const trailing = memberInsertions(sourceCode, receiver, after);
	if (trailing === null) return null;
	const fix = insertionFix(sourceCode, receiver, {
		base: literalText(sourceCode, receiver, before),
		condition,
		inserted,
		trailing,
	});
	const { name } = receiver;
	return fix === null ? null : [{ messageId: 'insertMembers', data: { name }, fix: () => fix }];
}

/**
 * The receiver of a literal that alone initializes a declaration (see `literalMembers` and `declarationOf`), or `null`
 * when the literal or its declaration cannot take inserted members. The declaration needs a type annotation. Without
 * one, the inferred type lacks the inserted keys or elements. The annotation must not be `readonly`, `Readonly<T>`,
 * `ReadonlyArray<T>`, or a mapped type that adds `readonly`, which forbid the insertion. A `get` or `set` accessor in
 * the literal also blocks it. An inserted assignment would run the accessor instead of defining a property. A
 * `__proto__: value` member also blocks it. An inserted assignment would reach a setter on that prototype. The
 * declared type needs type services. Without them, the receiver accepts every key and array method (see
 * `memberInsertions`).
 */
function receiverOf(services: TypeServices | null, node: ESTree.Node) {
	const target = literalMembers(node);
	const declaration = declarationOf(node);
	if (target === null || declaration === null) return null;
	const { name, annotation, statement } = declaration;
	return annotation === null ||
		isReadonlyType(annotation) ||
		target.members.some(member => isAccessor(member) || setsPrototype(member))
		? null
		: ({
				...target,
				name,
				statement,
				declared: declaredTypeOf(services, annotation),
			} satisfies Receiver);
}

/**
 * The declaration that an expression initializes on its own: the only declarator of a `const` or `let` statement in a
 * statement list, optionally exported, that binds an identifier. Returns `null` for an expression anywhere else, such as
 * a call argument or a `for` head.
 */
function declarationOf(node: ESTree.Node) {
	const { parent } = node;
	if (
		parent?.type !== 'VariableDeclarator' ||
		parent.init !== node ||
		parent.id.type !== 'Identifier'
	) {
		return null;
	}
	const { parent: declaration } = parent;
	if (
		declaration.type !== 'VariableDeclaration' ||
		declaration.declarations.length !== 1 ||
		!isLexical(declaration.kind)
	) {
		return null;
	}
	const { parent: owner } = declaration;
	const statement = owner.type === 'ExportNamedDeclaration' ? owner : declaration;
	if (!holdsStatements(statement.parent)) return null;
	const { name, typeAnnotation } = parent.id;
	return {
		name,
		annotation: typeAnnotation?.typeAnnotation ?? null,
		statement,
	} satisfies Declaration;
}

/** Whether a declaration kind binds a block-scoped variable that a later statement can extend. */
function isLexical(kind: ESTree.VariableDeclaration['kind']) {
	switch (kind) {
		case 'const':
		case 'let':
			return true;
		case 'var':
		case 'using':
		case 'await using':
			return false;
	}
}

/**
 * Whether a type annotation is `readonly T`, `Readonly<T>`, `ReadonlyArray<T>`, or a mapped type that adds `readonly`,
 * as in `{ readonly [K in Keys]: V }`. Aliases of them are not resolved.
 */
function isReadonlyType(type: ESTree.TSType) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a type operator, a type reference, and a mapped type can be read-only, so `default` covers the rest.
	switch (type.type) {
		case 'TSTypeOperator':
			return type.operator === 'readonly';
		case 'TSMappedType':
			return addsModifier(type.readonly);
		case 'TSTypeReference':
			return type.typeName.type === 'Identifier' && isReadonlyName(type.typeName.name);
		default:
			return false;
	}
}

/** Whether a mapped type modifier adds its modifier, as `readonly` and `+readonly` do. `-readonly` removes it. */
function addsModifier(modifier: ESTree.TSMappedType['readonly']) {
	switch (modifier) {
		case true:
		case '+':
			return true;
		case '-':
		case null:
			return false;
	}
}

/** Whether a global type name makes its argument read-only: `Readonly` or `ReadonlyArray`. */
function isReadonlyName(name: string) {
	switch (name) {
		case 'Readonly':
		case 'ReadonlyArray':
			return true;
		default:
			return false;
	}
}

/** Whether an object member is `__proto__: value`, which sets the literal's prototype instead of defining a property. */
function setsPrototype(member: ESTree.Node) {
	return (
		member.type === 'Property' &&
		!member.computed &&
		!member.shorthand &&
		propertyName(member.key, false) === '__proto__'
	);
}

/**
 * The type of an annotation without `null` and `undefined`, with the checker, or `null` without type services. The base
 * literal is never nullish, so the declaration narrows the variable to that type before the `if`.
 */
function declaredTypeOf(services: TypeServices | null, annotation: ESTree.TSType) {
	if (services === null) return null;
	const type = typeAtLocation(services, annotation);
	if (type === null) return null;
	const { checker } = services;
	return { checker, type: checker.getNonNullableType(type) } satisfies DeclaredType;
}

/**
 * The statements that insert a spread's value into the receiver: the value's members when it is a literal of the same
 * kind as the receiver's (see `memberInsertions`), or `null` for any other value. A value that is not a literal would
 * move into `Object.assign` or `.push(...value)`. That hides it from `no-conditional-spread`. A large array also
 * overflows the argument list.
 */
function valueInsertions(sourceCode: SourceCode, receiver: Receiver, value: ESTree.Expression) {
	const inner = literalMembers(value);
	return inner === null || inner.literal.type !== receiver.literal.type
		? null
		: memberInsertions(sourceCode, receiver, inner.members);
}

/** The members of an object literal, or of an array literal without holes, or `null` for any other node. */
function literalMembers(node: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only object and array literals have members, so `default` covers the rest.
	switch (node.type) {
		case 'ObjectExpression':
			return { literal: node, members: node.properties } satisfies Literal;
		case 'ArrayExpression': {
			const members = withoutHoles(node.elements);
			return members === null ? null : ({ literal: node, members } satisfies Literal);
		}
		default:
			return null;
	}
}

/** The elements of an array literal, or `null` when it holds a hole. */
function withoutHoles<T>(elements: readonly (T | null)[]) {
	const present: T[] = [];
	for (const element of elements) {
		if (element === null) return null;
		present.push(element);
	}
	return present;
}

/**
 * The statements that insert members into the receiver, members of a literal of the same kind, or `null` when a member
 * cannot move into a statement (see `objectInsertions` and `arrayInsertions`).
 */
function memberInsertions(
	sourceCode: SourceCode,
	receiver: Receiver,
	members: readonly ESTree.Node[],
) {
	// No members need no statement. An empty `.push()` would trip `unicorn/prefer-single-call` beside another `.push`.
	if (members.length === 0) return [];
	return receiver.literal.type === 'ObjectExpression'
		? objectInsertions(sourceCode, receiver, members)
		: arrayInsertions(sourceCode, receiver, members);
}

/**
 * The statements that assign object properties to the receiver in source order, or `null` for a spread, a method, an
 * accessor, a static `__proto__` key, a value that draws a CORE report once assigned (see `assignsQuietly`), or a key
 * that the declared type does not let an assignment write (see `isWritableKey`). A spread would move into
 * `Object.assign`. That hides it from `no-conditional-spread`. With a declared type, a computed key that is not a
 * literal also gives `null`.
 */
function objectInsertions(
	sourceCode: SourceCode,
	{ name, declared }: Receiver,
	members: readonly ESTree.Node[],
) {
	const statements: Copied[] = [];
	for (const member of members) {
		if (member.type !== 'Property' || isAccessor(member) || member.method) return null;
		const { key, value, computed } = member;
		if (!assignsQuietly(value)) return null;
		const written = propertyName(key, computed);
		// A literal's static `__proto__` key sets the literal's prototype or defines an own property. The assignment would
		// set the receiver's prototype instead. CORE `no-proto` reports that.
		if (written === '__proto__') return null;
		if (
			declared !== null &&
			(written === null || !isWritableKey(declared.checker, declared.type, written))
		) {
			return null;
		}
		const target =
			written !== null && takesDot(key, computed, written)
				? `${name}.${written}`
				: `${name}[${movedText(sourceCode, key)}]`;
		// A key that takes a dot is one token, which holds no comment.
		statements.push({
			text: `${target} = ${movedText(sourceCode, value)};`,
			kept: [key.range, value.range],
		});
	}
	return statements;
}

/** Whether an object member is a `get` or `set` accessor. */
function isAccessor(member: ESTree.Node) {
	return member.type === 'Property' && member.kind !== 'init';
}

/**
 * Whether a moved object value keeps CORE quiet once it is assigned. An assignment would chain assignments, which
 * `no-multi-assign` reports. An index read such as `list[0]` would ask for array destructuring, which
 * `prefer-destructuring` reports.
 */
function assignsQuietly(value: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an assignment and an index read draw a report on an assignment, so `default` covers the rest.
	switch (value.type) {
		case 'AssignmentExpression':
			return false;
		case 'MemberExpression':
			return !isIndexRead(value);
		default:
			return true;
	}
}

/** Whether a member read takes an integer index, as in `list[0]`. */
function isIndexRead({ computed, property }: ESTree.MemberExpression) {
	return computed && property.type === 'Literal' && typeof property.value === 'number';
}

/**
 * Whether a static key can follow a dot: an identifier written as is, or a quoted key that spells an ASCII identifier,
 * as CORE `typescript/dot-notation` asks. Any identifier name is valid after a dot. A quoted non-ASCII name keeps its
 * brackets.
 */
function takesDot(key: ESTree.PropertyKey, computed: boolean, written: string) {
	return (key.type === 'Identifier' && !computed) || BINDABLE_NAME_REGEX.test(written);
}

/**
 * The statement that adds array elements to the receiver with one `.push`, or `null` for a spread or for a declared type
 * that does not accept `.push` (see `acceptsPush`). A spread would move into the call's arguments. That hides it from
 * `no-conditional-spread`.
 */
function arrayInsertions(
	sourceCode: SourceCode,
	{ name, declared }: Receiver,
	elements: readonly ESTree.Node[],
) {
	if (elements.some(element => element.type === 'SpreadElement')) return null;
	if (declared !== null && !acceptsPush(declared)) return null;
	const texts = elements.map(element => movedText(sourceCode, element)).join(', ');
	return [
		{
			text: `${name}.push(${texts});`,
			kept: elements.map(({ range }) => range),
		} satisfies Copied,
	];
}

/**
 * Whether a declared array type takes elements through `.push`. A read-only array lacks it. A union of array types
 * also counts as refusing it. Unless the base literal narrows the union to one member, `.push` takes the intersection
 * of the element types, as `never` for `number[] | string[]`. A tuple member can also take other elements than its
 * union, as in `[number] | [number, string]`.
 */
function acceptsPush({ checker, type }: DeclaredType) {
	return !type.isUnion() && typeof checker.getPropertyOfType(type, 'push') !== 'undefined';
}

/**
 * The fix that replaces a declared initializer with the base and follows the declaration with an `if` on the condition
 * that runs the inserted statements, then the trailing statements. Returns `null` when no statement is inserted, as for
 * an empty value literal. The `if` would be empty. Also returns `null` when the rewrite would drop a comment of the
 * initializer: one outside the ranges that the base, the condition, and the statements copy.
 */
function insertionFix(
	sourceCode: SourceCode,
	{ literal, statement }: Receiver,
	{ base, condition, inserted, trailing }: Rewrite,
) {
	if (inserted.length === 0) return null;
	const ranges = [base, condition, ...inserted, ...trailing].flatMap(({ kept }) => kept);
	if (dropsComment(sourceCode, { range: literal.range, kept: ranges })) return null;
	const statements = inserted.map(({ text }) => text);
	const indent = indentation(sourceCode, statement);
	// One single-line statement stands alone. Several statements, or one that spans lines, go into a block. CORE `curly`
	// requires that in its `multi-line` mode.
	const single = onlyElement(statements);
	const body =
		single === null || single.includes('\n')
			? `{\n${statements.map(line => `${indent}\t${line}`).join('\n')}\n${indent}}`
			: single;
	const lines = [`if (${condition.text}) ${body}`, ...trailing.map(({ text }) => text)];
	const text =
		base.text +
		sourceCode.text.slice(literal.range[1], statement.range[1]) +
		lines.map(line => `\n${indent}${line}`).join('');
	return { range: [literal.range[0], statement.range[1]], text } satisfies Fix;
}

/** The text of a literal of the same kind that holds the given members, which keeps their ranges. */
function literalText(
	sourceCode: SourceCode,
	{ literal }: Literal,
	members: readonly ESTree.Node[],
) {
	const texts = members.map(member => movedText(sourceCode, member)).join(', ');
	const kept = members.map(({ range }) => range);
	return literal.type === 'ArrayExpression'
		? ({ text: `[${texts}]`, kept } satisfies Copied)
		: ({ text: texts === '' ? '{}' : `{ ${texts} }`, kept } satisfies Copied);
}

/**
 * The condition under which a branch of a conditional runs, as `if` test text that keeps the test's range: the test for
 * the consequent (see `movedText`), or its negation (see `negatedText`) for the alternate.
 */
export function branchCondition(
	sourceCode: SourceCode,
	isCaseComparand: CaseComparand,
	node: ESTree.ConditionalExpression,
	branch: ESTree.Expression,
) {
	const { test, consequent } = node;
	const text =
		branch === consequent
			? movedText(sourceCode, test)
			: negatedText(sourceCode, isCaseComparand, test);
	return { text, kept: [test.range] } satisfies Copied;
}

/**
 * The text of a node that moves into an assignment, an argument list, a computed member, or an `if` condition, with the
 * parentheses that its range leaves out where it needs them (see `needsParentheses`).
 */
function movedText(sourceCode: SourceCode, node: ESTree.Node) {
	const text = sourceCode.getText(node);
	return needsParentheses(node) ? `(${text})` : text;
}

/**
 * Whether a moved node needs the parentheses that its range leaves out. A comma expression needs them by grammar.
 * Without them, it would assign only its first operand or split into two arguments. An assignment needs them in an `if`
 * condition, where CORE `no-cond-assign` asks for them. Elsewhere they are harmless.
 */
function needsParentheses({ type }: ESTree.Node) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a comma expression and an assignment need parentheses where they move, so `default` covers the rest.
	switch (type) {
		case 'SequenceExpression':
		case 'AssignmentExpression':
			return true;
		default:
			return false;
	}
}
