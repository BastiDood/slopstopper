import {
	defineRule,
	type Context,
	type ESTree,
	type Range,
	type Reference,
	type SourceCode,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { AssertionError, assertDefined } from '#assert.ts';
import { isFunction } from '#ast/functions.ts';
import { identifierName } from '#ast/property-keys.ts';
import { isWithin } from '#ast/ranges.ts';

/** A statement or class member in one scope, ordered by its position among its siblings. */
interface Vertex {
	/** How reports refer to this vertex, such as `` `helper` `` or "the statement on line 3". */
	readonly label: string;
	/** The node that the report points at. */
	readonly node: ESTree.Node;
	/** The declaration, statement, or class member whose range holds the uses of other vertices. */
	readonly owner: ESTree.Node;
	readonly position: number;
	/**
	 * The text that moves with this vertex when the scope is reordered: its overload signatures, `export` wrapper, and
	 * comments, or null when a comment next to it cannot be assigned to it unambiguously.
	 */
	readonly range: Range | null;
	/** Sibling vertices that use this one. */
	readonly users: Vertex[];
	/** Uses of sibling vertices inside this one. */
	readonly uses: Use[];
	discovery: number;
	lowLink: number;
	component: number;
	onStack: boolean;
}

interface Use {
	readonly helper: Vertex;
	/** The source offset of the use, which orders the helpers of one user. */
	readonly position: number;
}

/** A use of a sibling method through `this` or the class name, attributed to the class member that contains it. */
interface MemberUse {
	readonly member: ESTree.Node;
	readonly name: string;
	/** Whether the use reaches static methods rather than instance methods. */
	readonly static: boolean;
	readonly position: number;
}

/** A statement or class member, classified for grouping overload signatures with their implementation. */
interface Element<Implementation> {
	readonly node: ESTree.Node;
	/** How reports refer to the element. */
	readonly label: string;
	/** The name that overload signatures share with their implementation, or null for anything else. */
	readonly key: string | null;
	/** The implementation that becomes a function vertex, or null for an overload signature or anything else. */
	readonly implementation: Implementation | null;
}

/**
 * The progress of `groupOverloads`: the groups and orphans so far, and the overload signatures pending under the key
 * of the last element.
 */
interface OverloadWalk<Implementation> {
	readonly groups: Group<Implementation>[];
	readonly orphans: Set<string>;
	signatures: Element<Implementation>[];
	pending: string | null;
}

/** The first and last node of a run of siblings. */
interface Extent {
	readonly first: ESTree.Node;
	readonly last: ESTree.Node;
}

/** A run of siblings that moves as one: an implementation with its overload signatures, or any other element alone. */
interface Group<Implementation> extends Extent {
	readonly label: string;
	/** The implementation and its overload key, or null for an element that never moves on its own. */
	readonly unit: { readonly key: string; readonly implementation: Implementation } | null;
}

/** The vertices of a class body by the member that each one owns, and its methods by name. */
interface ClassVertices {
	readonly members: ReadonlyMap<ESTree.Node, Vertex>;
	readonly instanceHelpers: ReadonlyMap<string, Vertex>;
	readonly staticHelpers: ReadonlyMap<string, Vertex>;
}

/** The progress of Tarjan's algorithm: the vertices on its stack, and the next discovery index. */
interface Tarjan {
	readonly stack: Vertex[];
	counter: number;
}

/** A strongly connected component: its members, and the number of distinct components that use it and are not emitted yet. */
interface Component {
	readonly members: Vertex[];
	waiting: number;
}

/** A permutation of the vertices of a scope. */
interface Reordering {
	/** The vertices in their original order, which is also the order of their slots. */
	readonly vertices: readonly Vertex[];
	/** The vertices in their new order. */
	readonly order: readonly Vertex[];
}

/** The text that replaces a range of the source. */
interface Replacement {
	readonly range: Range;
	readonly text: string;
}

/**
 * Reports functions declared above code in the same scope that uses them (the stepdown rule): users before helpers, so
 * that declaration order reads top-down from high-level code to low-level details. Every statement of a statement list
 * counts as a user of the function declarations in that list, and every member of a class body counts as a user of the
 * methods that it reaches through `this` or the class name. Recursion and mutual recursion impose no order.
 *
 * The autofix moves each function just below its last user, depth-first in the order of first use, and keeps every
 * other statement or class member in its relative order, so hoisting keeps the behavior intact. Each function moves with
 * its overload signatures, `export` wrapper, the comments directly above it, and the comments that trail its last line.
 * It bails out when a comment shares a line with two neighbors, when names repeat or overload signatures are detached,
 * when a namespace or a sloppy-mode block would move a function across another statement, and in class bodies with
 * decorators, computed method keys, or a member without a semicolon next to a moved member.
 */
export const STEPDOWN_ORDER = defineRule({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		docs: {
			description:
				'Require functions to be declared below the code in the same scope that uses them.',
		},
		messages: {
			helperAboveUser:
				'{{helper}} is declared above {{user}}, which uses it. Declare helpers below the code that uses them so the file reads top-down (stepdown rule).',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		/** Uses of `this.name` grouped by the class body of the member that they appear in. */
		const thisUses = new Map<ESTree.ClassBody, MemberUse[]>();

		return {
			Program({ body }) {
				checkStatements(context, body, false);
			},
			BlockStatement({ parent, body }) {
				const functionBody = isFunction(parent);
				checkStatements(
					context,
					body,
					!functionBody && sourceCode.ast.sourceType !== 'module',
				);
			},
			StaticBlock({ body }) {
				checkStatements(context, body, false);
			},
			TSModuleBlock({ body }) {
				checkStatements(context, body, true);
			},
			ThisExpression(node) {
				const found = thisMemberUse(node);
				if (found === null) return;

				const uses = thisUses.get(found.body);
				if (typeof uses === 'undefined') thisUses.set(found.body, [found.use]);
				else uses.push(found.use);
			},
			'ClassBody:exit'(body) {
				checkClass(context, body, thisUses.get(body) ?? []);
				thisUses.delete(body);
			},
		};
	},
});

/**
 * Checks the function declarations of a statement list against every statement in it. A guarded list (a namespace,
 * whose exports are assigned where they are declared, or a sloppy-mode block, whose functions are copied to the
 * enclosing scope where they are declared) only lets functions move across other functions.
 */
function checkStatements(
	context: Context,
	statements: readonly (ESTree.Directive | ESTree.Statement)[],
	guarded: boolean,
) {
	if (!statements.some(statement => isImplementation(statement))) return;

	const { sourceCode } = context;
	const { groups, orphans } = groupOverloads(
		statements.values().map(statement => statementElement(statement)),
	);

	const vertices: Vertex[] = [];
	const helpers: { vertex: Vertex; key: string; implementation: ESTree.BindingIdentifier }[] = [];
	const loose: ESTree.Node[] = [];
	for (const [position, { first, last, label, unit }] of groups.entries()) {
		const range = unitRange(sourceCode, { first, last });
		if (unit === null) {
			vertices.push(createVertex({ label, node: first, owner: first, position, range }));
			loose.push(first);
		} else {
			const { implementation } = unit;
			const vertex = createVertex({
				label,
				node: implementation,
				owner: implementation.parent,
				position,
				range,
			});
			vertices.push(vertex);
			helpers.push({ vertex, ...unit });
		}
	}

	if (helpers.length === 0) return;

	for (const { vertex: helper, implementation } of helpers) {
		for (const identifier of valueUses(sourceCode, implementation)) {
			const user = enclosingVertex(vertices, identifier);
			if (user !== null && user !== helper) {
				addUse(user, { helper, position: identifier.range[0] });
			}
		}
	}

	assignComponents(vertices);
	report(context, vertices, order => {
		const names = new Set<string>();
		for (const { key } of helpers) {
			if (names.has(key) || orphans.has(key)) return null;
			names.add(key);
		}

		const replacement = rewrite(sourceCode.text, { vertices, order });
		if (replacement === null) return null;
		return guarded && loose.some(({ range }) => isWithin(range, replacement.range))
			? null
			: replacement;
	});
}

/** Whether a statement is a function implementation with a name, unwrapping `export` and `export default` (see `statementElement`). */
function isImplementation(statement: ESTree.Directive | ESTree.Statement) {
	const declared = declaredFunction(exportedDeclaration(statement));
	return (
		declared !== null &&
		declared.id !== null &&
		declared.body !== null &&
		typeof declared.body !== 'undefined'
	);
}

/** Classifies a statement as a function implementation or overload signature, unwrapping `export` and `export default`. */
function statementElement(statement: ESTree.Directive | ESTree.Statement) {
	const declaration = exportedDeclaration(statement);
	const declared = declaredFunction(declaration);
	if (declared !== null && declared.id !== null) {
		const { id } = declared;
		return {
			node: statement,
			label: `\`${id.name}\``,
			key: id.name,
			implementation:
				declared.body === null || typeof declared.body === 'undefined' ? null : id,
		};
	}

	const name = declarationName(declaration);
	return {
		node: statement,
		label: name === null ? `the statement on line ${statement.loc.start.line}` : `\`${name}\``,
		key: null,
		implementation: null,
	};
}

/** The name that a declaration binds, or null unless it binds exactly one. */
function declarationName(declaration: ESTree.Node | null) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only class and variable declarations can bind one name, so `default` covers the rest.
	switch (declaration?.type) {
		case 'ClassDeclaration':
			return declaration.id?.name ?? null;
		case 'VariableDeclaration': {
			const declarator = onlyElement(declaration.declarations);
			return declarator?.id.type === 'Identifier' ? declarator.id.name : null;
		}
		default:
			return null;
	}
}

/** The identifiers that read the value of the function declaration that `id` names. */
function valueUses(sourceCode: SourceCode, id: ESTree.BindingIdentifier) {
	const uses: Reference['identifier'][] = [];
	for (const variable of sourceCode.getDeclaredVariables(id.parent)) {
		if (variable.name !== id.name) continue;
		for (const reference of variable.references) {
			if (isValueUse(reference)) uses.push(reference.identifier);
		}
	}
	return uses;
}

/**
 * Whether a reference reads the runtime value rather than naming a type. The TS-ESLint scope manager behind Oxlint
 * exposes an `isValueReference` getter that Oxlint's types omit, and plain `eslint-scope` lacks it entirely, so only an
 * explicit `false` marks a type reference. A `typeof` query still counts as a value reference there, so it is excluded
 * by its parent node.
 */
function isValueUse(reference: Reference) {
	return (
		reference.isRead() &&
		(!('isValueReference' in reference) || reference.isValueReference !== false) &&
		reference.identifier.parent.type !== 'TSTypeQuery'
	);
}

/** The vertex whose owner contains a node. */
function enclosingVertex(vertices: readonly Vertex[], node: ESTree.Node) {
	return vertices.find(({ owner }) => isWithin(node.range, owner.range)) ?? null;
}

/** The class member whose `this` a `this.name` access refers to, and the class body that holds it. */
function thisMemberUse(node: ESTree.ThisExpression) {
	const { parent } = node;
	if (parent.type !== 'MemberExpression' || parent.object !== node) return null;

	const name = keyName(parent.property, parent.computed);
	if (name === null) return null;
	const member = thisOwner(node);
	if (member?.parent.type !== 'ClassBody') return null;

	const use = {
		member,
		name,
		static: member.type === 'StaticBlock' || member.static,
		position: node.range[0],
	};
	return { body: member.parent, use };
}

/** The class member whose `this` binding a `this` expression refers to, looking through arrow functions. */
function thisOwner(node: ESTree.ThisExpression) {
	let child: ESTree.Node = node;
	let parent: ESTree.Node | null = node.parent;
	while (parent !== null) {
		// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
		switch (parent.type) {
			case 'FunctionExpression': {
				const method = parent.parent;
				return method.type === 'MethodDefinition' && method.value === parent
					? method
					: null;
			}
			case 'PropertyDefinition':
			case 'TSAbstractPropertyDefinition':
			case 'AccessorProperty':
			case 'TSAbstractAccessorProperty':
				return parent.value === child ? parent : null;
			case 'StaticBlock':
				return parent;
			case 'FunctionDeclaration':
			case 'ClassBody':
				return null;
			default:
				child = parent;
				({ parent } = child);
		}
	}
	return null;
}

/**
 * Checks the methods of a class body against every member in it. `thisUses` holds the uses of `this.name` inside the
 * members of the body.
 */
function checkClass(context: Context, body: ESTree.ClassBody, thisUses: readonly MemberUse[]) {
	if (
		!body.body.some(member => member.type === 'MethodDefinition' && member.value.body !== null)
	) {
		return;
	}

	const { sourceCode } = context;
	const { groups, orphans } = groupOverloads(
		body.body.values().map(member => memberElement(sourceCode, member)),
	);
	const units: { key: string; implementation: ESTree.MethodDefinition }[] = [];
	/** Whether a method has a computed key or detached overload signatures, which keeps the fix from moving it. */
	let pinned = false;
	const vertices: Vertex[] = [];
	const members = new Map<ESTree.Node, Vertex>();
	const instanceHelpers = new Map<string, Vertex>();
	const staticHelpers = new Map<string, Vertex>();
	/** Getters and setters of one property that sit next to each other, which must stay together. */
	const accessorPairs: { upper: Vertex; lower: Vertex }[] = [];
	const loose: ESTree.Node[] = [];

	for (const [position, { first, last, label, unit }] of groups.entries()) {
		const owner = unit?.implementation ?? first;
		const vertex = createVertex({
			label,
			node: unit?.implementation.key ?? first,
			owner,
			position,
			range: unitRange(sourceCode, { first, last }),
		});
		const aboveUnit = groups[position - 1]?.unit;
		vertices.push(vertex);
		members.set(owner, vertex);
		if (unit === null) {
			loose.push(first);
			continue;
		}

		units.push(unit);
		const { key, implementation } = unit;
		if (implementation.computed || orphans.has(key)) pinned = true;

		const name = keyName(implementation.key, implementation.computed);
		if (implementation.kind === 'method' && name !== null) {
			(implementation.static ? staticHelpers : instanceHelpers).set(name, vertex);
		}

		if (aboveUnit?.key === key && isAccessorPair(aboveUnit.implementation, implementation)) {
			accessorPairs.push({ upper: assertDefined(vertices[position - 1]), lower: vertex });
		}
	}

	if (units.length === 0) return;

	const classVertices = { members, instanceHelpers, staticHelpers };
	for (const use of thisUses) link(classVertices, use);
	for (const use of classNameUses(sourceCode, body)) link(classVertices, use);
	assignComponents(vertices);

	// Accessors are never helpers, so they are singleton components, and merging a pair keeps them together.
	for (const { upper, lower } of accessorPairs) lower.component = upper.component;

	report(context, vertices, order => {
		if (pinned || body.body.some(isDecorated) || !hasDistinctKeys(units)) return null;

		const replacement = rewrite(sourceCode.text, { vertices, order });
		if (replacement === null) return null;

		const [start, end] = replacement.range;
		// A member without a semicolon could absorb the start of a different member moved below it.
		return loose.some(member => {
			if (member.type === 'StaticBlock' || member.range[0] >= end) return false;
			const last = sourceCode.getLastToken(member);
			const next = sourceCode.getTokenAfter(member);
			return last?.value !== ';' && next !== null && start <= next.range[0];
		})
			? null
			: replacement;
	});
}

/** Records the use of a sibling method when it names one and the containing member is a vertex. */
function link(
	{ members, instanceHelpers, staticHelpers }: ClassVertices,
	{ member, name, static: isStatic, position }: MemberUse,
) {
	const helper = (isStatic ? staticHelpers : instanceHelpers).get(name);
	const user = members.get(member);
	if (typeof helper !== 'undefined' && typeof user !== 'undefined' && user !== helper) {
		addUse(user, { helper, position });
	}
}

/**
 * Groups every implementation with the overload signatures directly above it into one unit. Every other element is
 * a group of its own, and signatures that are not directly followed by their implementation are orphans.
 */
function groupOverloads<Implementation>(elements: Iterable<Element<Implementation>>) {
	const walk: OverloadWalk<Implementation> = {
		groups: [],
		orphans: new Set<string>(),
		signatures: [],
		pending: null,
	};

	for (const element of elements) {
		const { node, label, key, implementation } = element;
		if (key !== walk.pending) release(walk);
		walk.pending = key;
		if (key === null) {
			walk.groups.push({ first: node, last: node, label, unit: null });
		} else if (implementation === null) {
			walk.signatures.push(element);
		} else {
			const [signature] = walk.signatures;
			const first = signature?.node ?? node;
			walk.groups.push({ first, last: node, label, unit: { key, implementation } });
			walk.signatures = [];
		}
	}

	release(walk);

	const { groups, orphans } = walk;
	return { groups, orphans };
}

/** Turns the pending signatures into groups of their own, marking them as orphans. */
function release<Implementation>(walk: OverloadWalk<Implementation>) {
	const { groups, orphans, signatures, pending } = walk;
	if (pending !== null && signatures.length > 0) orphans.add(pending);
	for (const { node, label } of signatures) {
		groups.push({ first: node, last: node, label, unit: null });
	}
	walk.signatures = [];
}

/** Classifies a class member as a method implementation or overload signature. */
function memberElement(sourceCode: SourceCode, member: ESTree.ClassElement) {
	switch (member.type) {
		case 'StaticBlock':
		case 'TSIndexSignature': {
			const kind = member.type === 'StaticBlock' ? 'static block' : 'index signature';
			return {
				node: member,
				label: `the ${kind} on line ${member.loc.start.line}`,
				key: null,
				implementation: null,
			};
		}
		case 'MethodDefinition': {
			const name = sourceCode.getText(member.key);
			return {
				node: member,
				label: `\`${name}\``,
				key: `${member.static ? 'static ' : ''}${name}`,
				implementation: member.value.body === null ? null : member,
			};
		}
		case 'TSAbstractMethodDefinition':
		case 'PropertyDefinition':
		case 'TSAbstractPropertyDefinition':
		case 'AccessorProperty':
		case 'TSAbstractAccessorProperty':
			return {
				node: member,
				label: `\`${sourceCode.getText(member.key)}\``,
				key: null,
				implementation: null,
			};
	}
}

function createVertex(fields: Pick<Vertex, 'label' | 'node' | 'owner' | 'position' | 'range'>) {
	const users: Vertex[] = [];
	const uses: Use[] = [];

	return {
		...fields,
		users,
		uses,
		discovery: -1,
		lowLink: -1,
		component: -1,
		onStack: false,
	};
}

/**
 * The range of an extent, extended up to the comments directly above it (without a blank line in between) and over
 * the comments that start on its last line. Returns null when a comment shares a line with a token on both sides, since
 * it belongs to neither neighbor unambiguously.
 */
function unitRange(sourceCode: SourceCode, { first, last }: Extent) {
	const previous = sourceCode.getTokenBefore(first);
	let top: ESTree.Node | ESTree.Comment = first;
	const above = sourceCode.getCommentsBefore(first);
	for (let index = above.length - 1; index >= 0; --index) {
		const comment = assertDefined(above[index]);
		if (comment.loc.end.line + 1 < top.loc.start.line) break;
		if (comment.type === 'Shebang' || comment.loc.start.line === previous?.loc.end.line) {
			if (comment.loc.end.line === top.loc.start.line) return null;
			break;
		}
		top = comment;
	}

	let bottom: ESTree.Node | ESTree.Comment = last;
	for (const comment of sourceCode.getCommentsAfter(last)) {
		if (comment.loc.start.line !== last.loc.end.line) break;
		bottom = comment;
	}

	const next = sourceCode.getTokenAfter(last);
	if (bottom !== last && next !== null && next.loc.start.line <= bottom.loc.end.line) {
		return null;
	}

	return [top.range[0], bottom.range[1]] satisfies Range;
}

/** Uses of `ClassName.name` inside a class body, attributed to the members that contain them. */
function classNameUses(sourceCode: SourceCode, body: ESTree.ClassBody) {
	const uses: MemberUse[] = [];
	for (const variable of sourceCode.getDeclaredVariables(body.parent)) {
		for (const { identifier } of variable.references) {
			const { parent } = identifier;
			const name =
				parent.type === 'MemberExpression' && parent.object === identifier
					? keyName(parent.property, parent.computed)
					: null;
			if (name === null) continue;
			const member = directMember(identifier, body);
			if (member !== null) {
				uses.push({ member, name, static: true, position: identifier.range[0] });
			}
		}
	}
	return uses;
}

/**
 * The name of a class member key or member access property that is no literal and not computed (see `identifierName`),
 * with a `#` prefix for private names.
 */
function keyName(key: ESTree.PropertyKey, computed: boolean) {
	return key.type === 'PrivateIdentifier' ? `#${key.name}` : identifierName(key, computed);
}

/** The member of a class body that contains a node. */
function directMember(node: ESTree.Node, body: ESTree.ClassBody) {
	let current = node;
	for (let { parent } = current; parent !== null; { parent } = current) {
		if (parent === body) return current;
		current = parent;
	}
	return null;
}

/** Records that `user` uses the helper of `use`. */
function addUse(user: Vertex, use: Use) {
	use.helper.users.push(user);
	user.uses.push(use);
}

/** Labels every vertex with its strongly connected component (Tarjan's algorithm) over the "is used by" edges. */
function assignComponents(vertices: readonly Vertex[]) {
	const tarjan: Tarjan = { stack: [], counter: 0 };
	for (const vertex of vertices) if (vertex.discovery < 0) visit(tarjan, vertex);
}

/** Discovers a vertex and its users depth-first, labeling the component of every vertex that closes one. */
function visit(tarjan: Tarjan, vertex: Vertex) {
	const { stack } = tarjan;
	vertex.discovery = tarjan.counter;
	vertex.lowLink = tarjan.counter;
	++tarjan.counter;
	stack.push(vertex);
	vertex.onStack = true;

	for (const user of vertex.users) {
		if (user.discovery < 0) {
			visit(tarjan, user);
			vertex.lowLink = Math.min(vertex.lowLink, user.lowLink);
		} else if (user.onStack) {
			vertex.lowLink = Math.min(vertex.lowLink, user.discovery);
		}
	}

	if (vertex.lowLink !== vertex.discovery) return;
	while (true) {
		const member = assertDefined(stack.pop());
		member.onStack = false;
		member.component = vertex.discovery;
		if (member === vertex) break;
	}
}

/** Reports every helper above a user, offering one fix for the whole scope from `reorder` when it allows one. */
function report(
	context: Context,
	vertices: readonly Vertex[],
	reorder: (order: readonly Vertex[]) => Replacement | null,
) {
	const violations: { helper: Vertex; user: Vertex }[] = [];

	for (const helper of vertices) {
		let nearest: Vertex | null = null;
		for (const user of helper.users) {
			if (
				user.position > helper.position &&
				user.component !== helper.component &&
				(nearest === null || user.position < nearest.position)
			) {
				nearest = user;
			}
		}
		if (nearest !== null) violations.push({ helper, user: nearest });
	}

	if (violations.length === 0) return;

	const replacement = reorder(stepdownOrder(vertices));
	for (const { helper, user } of violations) {
		context.report({
			node: helper.node,
			messageId: 'helperAboveUser',
			data: { helper: helper.label, user: user.label },
			fix: fixer =>
				replacement === null
					? null
					: fixer.replaceTextRange(replacement.range, replacement.text),
		});
	}
}

/**
 * Orders the vertices of a scope so that every helper sits below all of its users and as close below them as possible,
 * like a newspaper article. Strongly connected components move as one block that keeps its original order. Roots
 * (components that no other component uses, which includes every statement and class member that is not a function)
 * keep their original order. Each emitted component is followed, depth-first, by the helpers that it is the last user
 * of, in the order of their first use inside it.
 */
function stepdownOrder(vertices: readonly Vertex[]) {
	const components = new Map<number, Component>();
	for (const vertex of vertices) {
		const component = components.get(vertex.component);
		if (typeof component === 'undefined') {
			components.set(vertex.component, { members: [vertex], waiting: 0 });
		} else {
			component.members.push(vertex);
		}
	}

	/** The components that no other component uses, collected before emission lowers any count to zero. */
	const roots: Vertex[][] = [];
	const users = new Set<number>();
	for (const [id, component] of components) {
		users.clear();
		for (const member of component.members) {
			for (const user of member.users) if (user.component !== id) users.add(user.component);
		}
		component.waiting = users.size;
		if (users.size === 0) roots.push(component.members);
	}

	const order: Vertex[] = [];
	for (const members of roots) emit(components, order, members);
	return order;
}

/** Appends a component to `order`, followed depth-first by the helpers that it is the last user of. */
function emit(
	components: ReadonlyMap<number, Component>,
	order: Vertex[],
	members: readonly Vertex[],
) {
	order.push(...members);

	const helpers = new Set<number>();
	for (const member of members) {
		member.uses.sort(({ position: left }, { position: right }) => left - right);
		for (const { helper } of member.uses) {
			if (helper.component !== member.component) helpers.add(helper.component);
		}
	}

	for (const helper of helpers) {
		const component = assertDefined(components.get(helper));
		--component.waiting;
		if (component.waiting === 0) emit(components, order, component.members);
	}
}

/** Whether a class member or one of its parameters is decorated. */
function isDecorated(member: ESTree.ClassElement) {
	switch (member.type) {
		case 'StaticBlock':
		case 'TSIndexSignature':
			return false;
		case 'PropertyDefinition':
		case 'TSAbstractPropertyDefinition':
		case 'AccessorProperty':
		case 'TSAbstractAccessorProperty':
			return member.decorators.length > 0;
		case 'MethodDefinition':
		case 'TSAbstractMethodDefinition':
			return (
				member.decorators.length > 0 ||
				member.value.params.some(({ decorators }) => {
					// Both parsers set `decorators` on every parameter, even though Oxlint's types mark it optional.
					const { length: decoratorsLength } = assertDefined(decorators);
					return decoratorsLength > 0;
				})
			);
	}
}

/** The declaration that an `export` or `export default` statement wraps, or the statement itself. */
function exportedDeclaration(statement: ESTree.Directive | ESTree.Statement) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two export statements that wrap a declaration matter, so `default` covers the rest.
	switch (statement.type) {
		case 'ExportNamedDeclaration':
		case 'ExportDefaultDeclaration':
			return statement.declaration;
		default:
			return statement;
	}
}

/** A function declaration or overload signature, or `null` for any other node. */
function declaredFunction(node: ESTree.Node | null) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types matter, so `default` covers the rest.
	switch (node?.type) {
		case 'FunctionDeclaration':
		case 'TSDeclareFunction':
			return node;
		default:
			return null;
	}
}

/** Whether no two methods share a key, except for a getter and a setter. */
function hasDistinctKeys(
	units: readonly { key: string; implementation: ESTree.MethodDefinition }[],
) {
	/** The method seen for each key, or null once a getter and a setter complete a pair. */
	const seen = new Map<string, ESTree.MethodDefinition | null>();
	for (const { key, implementation } of units) {
		const previous = seen.get(key);
		if (typeof previous === 'undefined') {
			seen.set(key, implementation);
		} else {
			if (previous === null || !isAccessorPair(previous, implementation)) return false;
			seen.set(key, null);
		}
	}
	return true;
}

/** Whether two methods are the getter and the setter of one property, in either order. */
function isAccessorPair(left: ESTree.MethodDefinition, right: ESTree.MethodDefinition) {
	return (
		(left.kind === 'get' && right.kind === 'set') ||
		(left.kind === 'set' && right.kind === 'get')
	);
}

/**
 * Rewrites the span from the first to the last slot that `order` changes: each changed slot receives the vertex that
 * `order` puts there, and the text around changed slots stays in place. Returns null when a changed slot or the vertex
 * that it receives has no range. A reported scope always changes a slot, because the stepdown order moves every helper
 * below its users.
 */
function rewrite(source: string, { vertices, order }: Reordering) {
	let text = '';
	let start: number | null = null;
	let end = 0;

	for (const [index, slot] of vertices.entries()) {
		const unit = assertDefined(order[index]);
		if (unit === slot) continue;
		if (slot.range === null || unit.range === null) return null;
		const [slotStart, slotEnd] = slot.range;
		if (start === null) start = slotStart;
		else text += source.slice(end, slotStart);
		text += source.slice(...unit.range);
		end = slotEnd;
	}

	if (start === null) throw new AssertionError('a reported scope changes a slot');
	return { range: [start, end] satisfies Range, text };
}
