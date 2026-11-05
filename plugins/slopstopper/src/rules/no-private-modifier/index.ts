import {
	type Context,
	defineRule,
	type ESTree,
	type Range,
	type SourceCode,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { AssertionError, assertDefined } from '#assert.ts';
import { isNeverReassigned } from '#ast/bindings.ts';
import { holdsStatements } from '#ast/decisions.ts';
import { indentation } from '#ast/layout.ts';
import { identifierName, propertyName } from '#ast/property-keys.ts';

type Member = ESTree.AccessorProperty | ESTree.MethodDefinition | ESTree.PropertyDefinition;

type PatternProperty =
	| ESTree.AssignmentTargetPropertyIdentifier
	| ESTree.AssignmentTargetPropertyProperty
	| ESTree.BindingProperty
	| ESTree.ObjectProperty;

/** A pending text replacement. Each report applies all of its group's edits as one fix. */
interface Edit {
	range: Range;
	text: string;
}

type PatternElement = Destructuring['pattern']['properties'][number];

/** A `const { name } = this;` declaration whose `name` property must become a separate `this.#name` read. */
interface Destructuring {
	declaration: ESTree.VariableDeclaration;
	/** The object pattern of the declaration's only declarator. */
	pattern: ESTree.ObjectPattern | ESTree.ObjectAssignmentTarget;
	extracted: Set<ESTree.Node>;
	lines: string[];
}

/** Every class member that shares one name, plus the references that the autofix must rename alongside them. */
interface Group {
	members: Member[];
	fixable: boolean;
	edits: Edit[];
	destructurings: Map<ESTree.VariableDeclaration, Destructuring>;
}

interface ClassState {
	body: ESTree.ClassBody;
	groups: Map<string, Group>;
	/** Private members with computed or literal keys, which have no `#name` spelling to rename to. */
	unnamed: Member[];
	/** Identifiers inside the class that reference the class binding itself (e.g., `Foo` in `Foo.count`). */
	bindings: Set<ESTree.Node>;
}

/**
 * Reports the TypeScript private modifier on class members in favor of ECMAScript private fields (`#private`), which
 * are enforced at runtime instead of only at compile time. Parameter properties are left to
 * `typescript/parameter-properties`, and private constructors are allowed because they have no `#private` equivalent.
 *
 * The autofix renames the member to `#name` along with its references inside the class body, and bails out whenever a
 * reference cannot be proven to target the class's own member. It assumes ECMAScript decorators, which accept
 * `#private` members, so decorated members are fixed too.
 */
export const NO_PRIVATE_MODIFIER = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description:
				'Disallow the TypeScript `private` modifier in favor of ECMAScript `#private` members.',
		},
		messages: {
			privateModifier:
				'Use an ECMAScript `#private` member instead of the TypeScript `private` modifier: `#{{name}}` is enforced at runtime, while `private` only exists at compile time.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const stack: ClassState[] = [];

		return {
			ClassDeclaration: node => enter(context, stack, node),
			ClassExpression: node => enter(context, stack, node),
			'ClassDeclaration:exit': () => exit(context, stack),
			'ClassExpression:exit': () => exit(context, stack),
			MemberExpression(node) {
				if (stack.length > 0) checkMember(stack, node);
			},
			Property(node) {
				if (stack.length > 0) checkPattern(sourceCode, stack, node);
			},
			PrivateIdentifier({ name }) {
				if (stack.length > 0) bail(stack, name);
			},
			BinaryExpression(node) {
				if (stack.length === 0 || node.operator !== 'in') return;
				const name = propertyName(node.left, true);
				if (name !== null) bail(stack, name);
			},
			TSIndexedAccessType({ indexType }) {
				if (stack.length === 0 || indexType.type !== 'TSLiteralType') return;
				const name = propertyName(indexType.literal, true);
				if (name !== null) bail(stack, name);
			},
			TSQualifiedName({ right }) {
				if (stack.length > 0) bail(stack, right.name);
			},
		};
	},
});

/** Opens the state of a class: its members grouped by name, and the references to its own binding. */
function enter(context: Context, stack: ClassState[], node: ESTree.Class) {
	const { sourceCode } = context;
	const { body } = node;
	const groups = new Map<string, Group>();
	const unnamed: Member[] = [];

	for (const element of body.body) {
		const member = keyedMember(element);
		if (member === null) continue;
		const { key } = member;

		// A nested class member with the same name would shadow `#name` for references inside the nested class.
		const name = identifierName(key, member.computed);
		if (name !== null) bail(stack, name);

		if (member.type === 'MethodDefinition' && member.kind === 'constructor') {
			disableParameterProperties(groups, member.value);
			continue;
		}

		if (member.computed || key.type !== 'Identifier') {
			if (isPrivate(member)) unnamed.push(member);
			continue;
		}

		const { members } = groupOf(groups, key.name);
		members.push(member);
	}

	// A group without a private member is never reported, so neither its references nor the class binding matter.
	let ambient: boolean | null = null;
	for (const [name, group] of groups) {
		if (!group.members.some(isPrivate)) {
			groups.delete(name);
			continue;
		}
		ambient ??= isAmbient(node, context.filename);
		if (ambient || !isConvertible(group.members)) group.fixable = false;
	}

	const bindings = new Set<ESTree.Node>();
	if (groups.size > 0) collectBindings(sourceCode, node, bindings);

	stack.push({ body, groups, unnamed, bindings });
}

/** Closes the innermost class and reports its private members, each with the fix of its group. */
function exit(context: Context, stack: ClassState[]) {
	const { sourceCode } = context;
	const { unnamed, groups } = assertDefined(stack.pop());
	for (const member of unnamed) {
		const { key } = member;
		const name =
			key.type === 'Literal' && typeof key.value === 'string'
				? key.value
				: sourceCode.getText(key);
		context.report({ node: member.key, messageId: 'privateModifier', data: { name } });
	}

	for (const [name, group] of groups) {
		const edits = group.fixable ? completeEdits(sourceCode, name, group) : null;
		for (const member of group.members) {
			if (!isPrivate(member)) continue;
			context.report({
				node: member.key,
				messageId: 'privateModifier',
				data: { name },
				fix: fixer =>
					edits === null
						? null
						: edits.map(({ range, text }) => fixer.replaceTextRange(range, text)),
			});
		}
	}
}

/** Disables the autofix for members that share a name with a constructor parameter property. */
function disableParameterProperties(groups: Map<string, Group>, { params }: ESTree.Function) {
	for (const parameter of params) {
		if (parameter.type !== 'TSParameterProperty') continue;
		const binding =
			parameter.parameter.type === 'AssignmentPattern'
				? parameter.parameter.left
				: parameter.parameter;
		if (binding.type === 'Identifier') {
			const group = groupOf(groups, binding.name);
			group.fixable = false;
		}
	}
}

function groupOf(groups: Map<string, Group>, name: string) {
	let group = groups.get(name);
	if (typeof group === 'object') return group;

	group = {
		members: [],
		fixable: true,
		edits: [],
		destructurings: new Map<ESTree.VariableDeclaration, Destructuring>(),
	};
	groups.set(name, group);
	return group;
}

function isAmbient(node: ESTree.Class, filename: string) {
	if (node.declare === true || filename.endsWith('.d.ts')) return true;

	for (let current = node.parent; current.type !== 'Program'; current = current.parent) {
		if (current.type === 'TSModuleDeclaration' && current.declare) return true;
	}
	return false;
}

/** Whether every member is private and the members form one field, one method with overloads, or one accessor pair. */
function isConvertible(members: readonly Member[]) {
	let fields = 0;
	let methods = 0;
	let implementations = 0;
	let getters = 0;
	let setters = 0;
	let isStatic = false;

	for (const member of members) {
		if (!isPrivate(member)) return false;
		if (fields + methods + getters + setters === 0) isStatic = member.static;
		else if (member.static !== isStatic) return false;

		switch (member.type) {
			case 'PropertyDefinition':
				if (member.declare === true) return false;
				++fields;
				break;
			case 'AccessorProperty':
				++fields;
				break;
			case 'MethodDefinition':
				switch (member.kind) {
					case 'method':
						++methods;
						if (member.value.body !== null) ++implementations;
						break;
					case 'get':
						++getters;
						break;
					case 'set':
						++setters;
						break;
					case 'constructor':
						throw new AssertionError('`enter` keeps constructors out of every group');
				}
				break;
			case 'TSAbstractPropertyDefinition':
			case 'TSAbstractMethodDefinition':
			case 'TSAbstractAccessorProperty':
				return false;
		}
	}

	if (fields > 0) return fields === 1 && methods + getters + setters === 0;
	if (methods > 0) return getters + setters === 0 && implementations <= 1;
	return getters <= 1 && setters <= 1;
}

/** Collects the identifiers that read the class binding, skipping bindings that are ever reassigned. */
function collectBindings(sourceCode: SourceCode, node: ESTree.Class, bindings: Set<ESTree.Node>) {
	for (const variable of sourceCode.getDeclaredVariables(node)) {
		if (!isNeverReassigned(variable)) continue;
		for (const reference of variable.references) bindings.add(reference.identifier);
	}
}

/**
 * Appends the declaration renames and destructuring splits of a fixable group to the reference renames that the
 * traversal collected, and returns the complete edit list for the group's fix.
 */
function completeEdits(sourceCode: SourceCode, name: string, group: Group) {
	const { edits } = group;
	for (const member of group.members) {
		edits.push(declarationEdit(sourceCode, member, name));
	}

	for (const destructuring of group.destructurings.values()) {
		pushDestructuringEdits(sourceCode, edits, destructuring);
	}

	return edits;
}

/** Replaces `private <modifiers> name` with `<modifiers> #name`, keeping any comment after the keyword. */
function declarationEdit(sourceCode: SourceCode, member: Member, name: string) {
	const { key } = member;
	for (
		let token = sourceCode.getFirstToken(member);
		token !== null && token.range[0] < key.range[0];
		token = sourceCode.getTokenAfter(token)
	) {
		if (token.value !== 'private') continue;
		const next = sourceCode.getTokenAfter(token, { includeComments: true });
		if (next === null) throw new AssertionError('the key follows the `private` keyword');
		return {
			range: [token.range[0], key.range[1]],
			text: `${sourceCode.text.slice(next.range[0], key.range[0])}#${name}`,
		} satisfies Edit;
	}

	throw new AssertionError(
		'every member of a fixable group has the `private` keyword before its key',
	);
}

/** Splits extracted properties out of a `this` destructuring into standalone `this.#name` declarations. */
function pushDestructuringEdits(
	sourceCode: SourceCode,
	edits: Edit[],
	destructuring: Destructuring,
) {
	const { declaration, pattern, extracted, lines } = destructuring;
	const { start } = declaration.loc;
	const indent = indentation(sourceCode, declaration);
	const lineStart = sourceCode.getIndexFromLoc({ line: start.line, column: 0 });
	const newline = sourceCode.text.charAt(lineStart - 2) === '\r' ? '\r\n' : '\n';
	const separator = start.column === indent.length ? `${newline}${indent}` : ' ';

	if (extracted.size === pattern.properties.length) {
		edits.push({
			range: declaration.range,
			text: lines.join(separator),
		});
		return;
	}

	// Removes each run of extracted properties along with the comma that separates it from a kept neighbor.
	let first: PatternElement | null = null;
	let last: PatternElement | null = null;
	let kept: PatternElement | null = null;
	for (const property of pattern.properties) {
		if (extracted.has(property)) {
			first ??= property;
			last = property;
			continue;
		}
		if (first !== null) edits.push({ range: [first.range[0], property.range[0]], text: '' });
		first = null;
		kept = property;
	}

	// A partial split keeps at least one property, so a trailing run follows a kept one.
	if (first !== null) {
		if (kept === null || last === null) {
			throw new AssertionError('a trailing run follows a kept property');
		}
		edits.push({ range: [kept.range[1], last.range[1]], text: '' });
	}

	edits.push({
		range: [declaration.range[1], declaration.range[1]],
		text: `${separator}${lines.join(separator)}`,
	});
}

/** Records the rename of a `this.name` or `ClassName.name` access, or disables the fix when the access is unprovable. */
function checkMember(stack: readonly ClassState[], node: ESTree.MemberExpression) {
	const { object, property } = node;

	if (node.computed) {
		const name = propertyName(property, true);
		if (name === null) bailAll(stack, object);
		else bail(stack, name);
		return;
	}

	if (property.type !== 'Identifier' || !hasGroup(stack, property.name)) return;

	const isDeleted = node.parent.type === 'UnaryExpression' && node.parent.operator === 'delete';
	const owner = object.type === 'ThisExpression' ? thisOwner(node) : null;

	for (const state of stack) {
		const group = state.groups.get(property.name);
		if (typeof group !== 'object') continue;

		const isStatic = isStaticGroup(group);

		if (object.type === 'Identifier' && state.bindings.has(object)) {
			// `ClassName.name` cannot target an instance member, so it only needs renaming for static members.
			if (!isStatic) continue;
		} else if (owner?.body !== state.body || owner.isStatic !== isStatic) {
			group.fixable = false;
			continue;
		}

		// `this?.#name` is a syntax error (TS18030), and dropping the `?.` is not equivalent: an unbound call leaves `this`
		// undefined, so `this?.name` yields `undefined` where `this.#name` throws. Deleting a private name is a syntax error too.
		if (node.optional || isDeleted) {
			group.fixable = false;
		} else {
			group.edits.push({ range: property.range, text: `#${property.name}` });
		}
	}
}

/** Records the split of a `const { name } = this;` property, or disables the fix when the pattern cannot be split. */
function checkPattern(sourceCode: SourceCode, stack: readonly ClassState[], node: PatternProperty) {
	const pattern = node.parent;
	if (pattern.type !== 'ObjectPattern') return;

	const { key } = node;
	const name = propertyName(key, node.computed);

	if (name === null) {
		const value = destructuredValue(pattern);
		if (node.computed && value !== null) bailAll(stack, value);
		return;
	}

	if (!hasGroup(stack, name)) return;
	const declaration = splittableDeclaration(pattern, node);
	if (declaration === null) {
		bail(stack, name);
		return;
	}

	const last = sourceCode.getLastToken(declaration);
	const semicolon = last?.value === ';' ? ';' : '';
	const line = `${declaration.kind} ${sourceCode.getText(node.value)} = this.#${name}${semicolon}`;
	const owner = thisOwner(declaration);
	for (const state of stack) {
		const group = state.groups.get(name);
		if (typeof group !== 'object') continue;
		if (owner?.body !== state.body || owner.isStatic !== isStaticGroup(group)) {
			group.fixable = false;
			continue;
		}

		let destructuring = group.destructurings.get(declaration);
		if (typeof destructuring !== 'object') {
			destructuring = { declaration, pattern, extracted: new Set<ESTree.Node>(), lines: [] };
			group.destructurings.set(declaration, destructuring);
		}

		destructuring.extracted.add(node);
		destructuring.lines.push(line);
	}
}

/** Whether any enclosing class has a group for a name, so that a reference to the name can matter. */
function hasGroup(stack: readonly ClassState[], name: string) {
	return stack.some(({ groups }) => groups.has(name));
}

/**
 * The `const { name } = this;` statement that holds a destructured property, if that property can become a standalone
 * `const name = this.#name;` read. Defaults, nested patterns, rest elements, and type annotations cannot. Expects the
 * object pattern that is the parent of the property.
 */
function splittableDeclaration(
	pattern: ESTree.ObjectPattern | ESTree.ObjectAssignmentTarget,
	{ computed, key, value }: PatternProperty,
) {
	if (
		computed ||
		key.type !== 'Identifier' ||
		value.type !== 'Identifier' ||
		(pattern.typeAnnotation !== null && typeof pattern.typeAnnotation !== 'undefined')
	) {
		return null;
	}

	if (pattern.properties.some(property => property.type === 'RestElement')) return null;

	const declarator = pattern.parent;
	if (
		declarator.type !== 'VariableDeclarator' ||
		declarator.id !== pattern ||
		declarator.init?.type !== 'ThisExpression'
	) {
		return null;
	}

	const declaration = declarator.parent;
	if (
		declaration.type !== 'VariableDeclaration' ||
		onlyElement(declaration.declarations) !== declarator
	) {
		return null;
	}

	return holdsStatements(declaration.parent) ? declaration : null;
}

/** Disables the autofix for members named `name` in every enclosing class. */
function bail(stack: Iterable<Pick<ClassState, 'groups'>>, name: string) {
	for (const state of stack) {
		const group = state.groups.get(name);
		if (typeof group === 'object') group.fixable = false;
	}
}

/**
 * Disables the autofix for every member of each enclosing class whose own `this` or class binding is `object`, because
 * a key that is no literal (`this[key]`) can reach any of them.
 */
function bailAll(stack: Iterable<ClassState>, object: ESTree.Node) {
	const owner = object.type === 'ThisExpression' ? thisOwner(object) : null;
	for (const state of stack) {
		const isOwn =
			object.type === 'ThisExpression'
				? owner?.body === state.body
				: object.type === 'Identifier' && state.bindings.has(object);
		if (!isOwn) continue;
		for (const group of state.groups.values()) group.fixable = false;
	}
}

/** The value that an object pattern destructures, when the pattern is the whole target of a declaration or assignment. */
function destructuredValue(pattern: ESTree.ObjectPattern | ESTree.ObjectAssignmentTarget) {
	const { parent } = pattern;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only declarators and assignments destructure a value, so `default` covers the rest.
	switch (parent.type) {
		case 'VariableDeclarator':
			return parent.id === pattern ? parent.init : null;
		case 'AssignmentExpression':
		case 'AssignmentPattern':
			return parent.left === pattern ? parent.right : null;
		default:
			return null;
	}
}

function isStaticGroup({ members }: Pick<Group, 'members'>) {
	const [first] = members;
	return first?.static === true;
}

/**
 * The class body whose member binds `this` at the given node, and whether `this` is its class side (`isStatic`) or its
 * instance side. Returns `null` when no class member binds it. Arrow functions inherit `this`, while any other function,
 * computed key, decorator, or nested class rebinds it.
 */
function thisOwner(node: ESTree.Node) {
	let child = node;
	for (let current = node.parent; current !== null; current = current.parent) {
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
		switch (current.type) {
			case 'FunctionExpression':
			case 'FunctionDeclaration': {
				const method = current.parent;
				return method.type === 'MethodDefinition' &&
					method.value === current &&
					!hasThisParameter(current)
					? { body: method.parent, isStatic: method.static }
					: null;
			}
			case 'PropertyDefinition':
			case 'AccessorProperty':
				return current.value === child
					? { body: current.parent, isStatic: current.static }
					: null;
			case 'StaticBlock':
				return { body: current.parent, isStatic: true };
			case 'ClassBody':
			case 'ClassDeclaration':
			case 'ClassExpression':
				return null;
			default:
				child = current;
		}
	}
	throw new AssertionError('a node inside a class has the class body as an ancestor');
}

/** The member of a class body that has a key, or `null` for a static block or an index signature. */
function keyedMember(element: ESTree.ClassElement) {
	switch (element.type) {
		case 'StaticBlock':
		case 'TSIndexSignature':
			return null;
		case 'MethodDefinition':
		case 'TSAbstractMethodDefinition':
		case 'PropertyDefinition':
		case 'TSAbstractPropertyDefinition':
		case 'AccessorProperty':
		case 'TSAbstractAccessorProperty':
			return element;
	}
}

function hasThisParameter({ params }: ESTree.Function) {
	const [first] = params;
	return first?.type === 'Identifier' && first.name === 'this';
}

function isPrivate(member: Member) {
	return member.accessibility === 'private';
}
