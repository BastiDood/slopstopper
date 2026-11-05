import {
	type Context,
	defineRule,
	type ESTree,
	type Fix,
	type Range,
	type SourceCode,
	type Variable,
} from '@oxlint/plugins';

import { onlyElement } from '#arrays.ts';
import { assertDefined, assertNotNull } from '#assert.ts';
import { findVariable } from '#ast/bindings.ts';
import { referenceKey, unwrap } from '#ast/discriminant.ts';
import { listLabel, messageLabel } from '#ast/labels.ts';
import { isCallee, outermostWrapper } from '#ast/members.ts';
import { BINDABLE_NAME_REGEX } from '#ast/names.ts';
import { propertyName } from '#ast/property-keys.ts';
import { dropsComment } from '#ast/ranges.ts';
import { isTableJsxObject, isTableReference, isTableType } from '#ast/tanstack-table.ts';
import { type TypeServices, typeServicesOf } from '#type-services.ts';

/** The name of the TanStack subscription component, both standalone and as `table.Subscribe`. */
const SUBSCRIBE = 'Subscribe';

/** A rewrite of a read of the table store into reads of slice atoms: the range it replaces, its text, and the slices. */
interface AtomRewrite {
	range: Range;
	text: string;
	slices: string[];
}

/** The top-level slices that a selector reads off its state parameter. */
interface SelectorReads {
	slices: string[];
	/** The edits that rebase a selector of one slice onto the slice value, or `null` for several slices or a rebase that is not mechanical. */
	rebase: Fix[] | null;
}

/** The parts of a subscription to a table's store through a selector that its source and selector determine. */
interface SelectorTarget {
	/** The table for messages. */
	table: string;
	/** The `selector` argument or JSX attribute value. */
	selector: ESTree.Node | null;
	/** The edit that subscribes to a slice's atom instead of the store, or `null` when the table is no plain reference. */
	sourceFix: ((slice: string) => Fix) | null;
}

/** A subscription to a table's store through a selector. */
interface StoreSubscription extends SelectorTarget {
	/** Whether the subscription compares selected values with `===`, so that a fresh value re-renders on every change. */
	isIdentityCompared: boolean;
}

/**
 * Reports a use of a TanStack Table's aggregate store where the atom of one slice serves. The store combines every
 * state slice, so a read or a subscription through it depends on all of them, while `table.atoms.<slice>` depends on
 * one. This follows TanStack's guidance: React's `table.store` is deprecated in favor of slice atoms and subscriptions
 * (`packages/react-table/src/useTable.ts`), and Svelte prefers a slice read because a whole-store read reruns for every
 * state change (`packages/svelte-table/skills/table-state/SKILL.md`).
 *
 * The rule reports a snapshot read such as `table.store.get()` or `table.store.state`, and any other raw use of
 * `table.store`, such as `table.store.subscribe(...)`. A subscription to the store through a selector, as in
 * `useSelector(table.store, selector)` from `@tanstack/react-store`, `<Subscribe source={table.store} selector={...}>`,
 * or `<table.Subscribe selector={...}>`, which selects from the store, is reported when the selector is an inline
 * function that reads exactly one top-level slice of its state, because the slice's atom is the narrowest boundary. A
 * selector that reads several slices, or that the rule cannot analyze, is allowed
 * (`packages/react-table/skills/table-state/references/reactivity.md`), except under `useSelector`: it compares with
 * `===` unless a third argument passes `compare` (`packages/react-store/src/useSelector.ts` in TanStack/store), while
 * `Subscribe` compares with `shallow` (`packages/react-table/src/Subscribe.ts`), so a `useSelector` selector of several
 * slices that returns a fresh array or object literal is reported without a third argument. `useSelector` from
 * `@tanstack/svelte-store` over the store is reported whatever its selector, because Svelte table UI reads the
 * rune-aware atoms inside `$derived`. `<table.Subscribe>` with neither a `source` nor a `selector` re-renders on every
 * state change, so it is reported too.
 *
 * Without type information, a table is the identifier `table`, a non-computed `table` member, a call to `useTable` or
 * `createTable`, or a never-reassigned `const` whose initializer is one of these, followed through aliases. With type
 * information, a table is also any expression whose type has the `store`, `atoms`, and `baseAtoms` of a table instance.
 *
 * The rewrites into atoms are suggestions: `table.atoms` holds only the slices of registered features, so a rewrite
 * throws where the store read gave `undefined`.
 */
export const PREFER_TABLE_ATOMS = defineRule({
	meta: {
		type: 'suggestion',
		hasSuggestions: true,
		docs: {
			description:
				'Read and subscribe to TanStack Table state through `table.atoms.<slice>` instead of the aggregate `table.store`.',
		},
		messages: {
			store: '`{{table}}.store` aggregates every table state slice, so this use depends on all of them. Read the slice through `{{table}}.atoms.<slice>` instead.',
			readAtoms:
				'Read {{slices}} through `{{table}}.atoms`. If a slice is not registered by a table feature, suppress this diagnostic.',
			singleSlice:
				'This selector reads only `{{slice}}` from the whole `{{table}}.store`, so it runs on every table state change. Subscribe to `{{table}}.atoms.{{slice}}`, the narrowest boundary.',
			subscribeAtom:
				'Subscribe to `{{table}}.atoms.{{slice}}` and select from the slice value. If `{{slice}}` is not registered by a table feature, suppress this diagnostic.',
			wholeStore:
				'`<{{name}}>` without a `source` or a `selector` subscribes to the whole table store, so it re-renders on every state change. Pass a `selector`, or a `source` such as `{{table}}.atoms.<slice>`.',
			shallowCompare:
				'`useSelector` compares with `===` by default, so the fresh array or object that this selector returns re-renders on every table state change. Pass `{ compare: shallow }` from `@tanstack/react-store` as the third argument.',
			svelteSelector:
				'`useSelector` over `{{table}}.store` reruns for every table state change, and Svelte table UI reads state through the rune-aware atoms. Read the slice with `{{table}}.atoms.<slice>.get()` inside `$derived` instead.',
		},
		schema: [],
	},
	create(context) {
		const { sourceCode } = context;
		const services = typeServicesOf(sourceCode);

		return {
			CallExpression(node) {
				const selector = useSelectorSelector(sourceCode, node);
				if (selector === null) return;
				const store = tableStoreOf(sourceCode, services, node.arguments[0]);
				if (store === null) return;
				checkSelector(context, {
					...storeSubscription(sourceCode, store, selector),
					isIdentityCompared: node.arguments.length < 3,
				});
			},
			JSXOpeningElement(node) {
				const { name, attributes } = node;
				const source = jsxAttribute(attributes, 'source');
				const selector = jsxAttribute(attributes, 'selector');
				if (source === null) {
					checkTableSubscribe(context, services, node, selector);
					return;
				}
				const store = tableStoreOf(sourceCode, services, source.value);
				if (store === null || selector === null || !isSubscribeElement(sourceCode, name)) {
					return;
				}
				checkSelector(context, {
					...storeSubscription(sourceCode, store, selector.value),
					isIdentityCompared: false,
				});
			},
			MemberExpression(node) {
				if (
					!isTableStore(sourceCode, services, node) ||
					isSelectedSource(sourceCode, node)
				) {
					return;
				}
				if (isSvelteSelectorSource(sourceCode, node)) {
					context.report({
						node,
						messageId: 'svelteSelector',
						data: { table: messageLabel(sourceCode.getText(node.object)) },
					});
					return;
				}
				reportStore(context, node);
			},
		};
	},
});

/**
 * Whether a table store is the source of a subscription with a selector, which the rule checks through its selector:
 * the first argument of a `useSelector` call with a selector (see `useSelectorSelector`), or the `source` of a
 * `Subscribe` element (see `isSubscribeElement`) with a `selector`.
 */
function isSelectedSource(sourceCode: SourceCode, store: ESTree.MemberExpression) {
	const { parent } = store;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a call argument or a JSX attribute value passes a store to a subscription, so `default` covers the rest.
	switch (parent.type) {
		case 'CallExpression':
			return (
				parent.arguments[0] === store && useSelectorSelector(sourceCode, parent) !== null
			);
		case 'JSXExpressionContainer': {
			const attribute = parent.parent;
			return (
				attribute.type === 'JSXAttribute' &&
				attribute.parent.type === 'JSXOpeningElement' &&
				jsxAttribute(attribute.parent.attributes, 'source') === attribute &&
				jsxAttribute(attribute.parent.attributes, 'selector') !== null &&
				isSubscribeElement(sourceCode, attribute.parent.name)
			);
		}
		default:
			return false;
	}
}

/**
 * The selector of a `useSelector(source, selector)` call, where `useSelector` is imported from `@tanstack/react-store`,
 * or `null` for any other call and for a call without a selector.
 */
function useSelectorSelector(sourceCode: SourceCode, call: ESTree.CallExpression) {
	const [, selector] = call.arguments;
	return isUseSelector(sourceCode, call, isReactStoreModule) && typeof selector !== 'undefined'
		? selector
		: null;
}

/**
 * Whether a table store is the source of a `useSelector` call imported from `@tanstack/svelte-store`, which Svelte table
 * UI does not need: its rune-aware atoms track their reads.
 */
function isSvelteSelectorSource(sourceCode: SourceCode, store: ESTree.MemberExpression) {
	const { parent } = store;
	return (
		parent.type === 'CallExpression' &&
		parent.arguments[0] === store &&
		isUseSelector(sourceCode, parent, isSvelteStoreModule)
	);
}

/** Whether a call's callee is a binding of `useSelector` imported from a module that `isModule` accepts. */
function isUseSelector(
	sourceCode: SourceCode,
	{ callee }: ESTree.CallExpression,
	isModule: (module: string) => boolean,
) {
	return (
		callee.type === 'Identifier' &&
		isImportOf(findVariable(sourceCode.getScope(callee), callee.name), 'useSelector', isModule)
	);
}

/**
 * Checks `<table.Subscribe>` without a `source`, which selects from the table's store: it reports the element without a
 * `selector` and checks the selector otherwise. Skips an element with a spread attribute, which may pass a `source`.
 */
function checkTableSubscribe(
	context: Context,
	services: TypeServices | null,
	{ name, attributes }: ESTree.JSXOpeningElement,
	selector: ESTree.JSXAttribute | null,
) {
	const { sourceCode } = context;
	if (
		name.type !== 'JSXMemberExpression' ||
		name.property.name !== SUBSCRIBE ||
		!isTable(services, name.object, isTableJsxObject(sourceCode, name.object)) ||
		attributes.some(({ type }) => type === 'JSXSpreadAttribute')
	) {
		return;
	}

	const table = sourceCode.getText(name.object);
	if (selector === null) {
		context.report({
			node: name,
			messageId: 'wholeStore',
			data: { name: sourceCode.getText(name), table },
		});
		return;
	}
	checkSelector(context, {
		table,
		isIdentityCompared: false,
		selector: selector.value,
		sourceFix: slice => ({
			range: [selector.range[0], selector.range[0]],
			text: `source={${table}.atoms.${slice}} `,
		}),
	});
}

/** The subscription to a table's store member through a selector. */
function storeSubscription(
	sourceCode: SourceCode,
	store: ESTree.MemberExpression,
	selector: ESTree.Node | null,
) {
	const { object } = store;
	const table = sourceCode.getText(object);
	return {
		table: messageLabel(table),
		selector,
		sourceFix:
			referenceKey(object) === null
				? null
				: (slice: string) => ({ range: store.range, text: `${table}.atoms.${slice}` }),
	} satisfies SelectorTarget;
}

/**
 * Reports a selector that reads exactly one top-level slice of its state, suggesting a subscription to the slice's atom
 * with the selector rebased onto the slice value. On a subscription that compares with `===`, also reports a selector of
 * several slices that returns a fresh array or object literal, which differs from the last value on every change.
 */
function checkSelector(
	context: Context,
	{ table, selector, sourceFix, isIdentityCompared }: StoreSubscription,
) {
	const { sourceCode } = context;
	const fn = selectorFunction(selector);
	if (fn === null) return;
	const reads = selectorReads(sourceCode, fn);
	if (reads === null) return;

	const { slices, rebase } = reads;
	const slice = onlyElement(slices);
	if (slice === null) {
		if (isIdentityCompared && slices.length > 1 && returnsFreshLiteral(fn)) {
			context.report({ node: fn, messageId: 'shallowCompare' });
		}
		return;
	}

	const data = { table, slice };
	context.report({
		node: fn,
		messageId: 'singleSlice',
		data,
		suggest:
			sourceFix === null || rebase === null
				? null
				: [{ messageId: 'subscribeAtom', data, fix: () => [sourceFix(slice), ...rebase] }],
	});
}

/**
 * Whether a function returns a fresh array or object literal, as its expression body or its body of one `return`
 * statement, through TypeScript assertions.
 */
function returnsFreshLiteral({ body }: ESTree.ArrowFunctionExpression | ESTree.Function) {
	const block = assertNotNull(body);
	if (block.type !== 'BlockStatement') return isFreshLiteral(unwrap(block));
	const statement = onlyElement(block.body);
	return (
		statement?.type === 'ReturnStatement' &&
		statement.argument !== null &&
		isFreshLiteral(unwrap(statement.argument))
	);
}

/** Whether an expression is an array or object literal, which creates a new value on every evaluation. */
function isFreshLiteral({ type }: ESTree.Expression) {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only the two literals create a fresh container, so `default` covers the rest.
	switch (type) {
		case 'ArrayExpression':
		case 'ObjectExpression':
			return true;
		default:
			return false;
	}
}

/**
 * The inline function that a selector argument or JSX attribute value holds, or `null` for any other selector, such as
 * a function passed by reference.
 */
function selectorFunction(
	node: ESTree.Node | null,
): ESTree.ArrowFunctionExpression | ESTree.Function | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only an inline function, possibly inside a JSX expression container, is analyzable, so `default` covers the rest.
	switch (node?.type) {
		case 'JSXExpressionContainer':
			return selectorFunction(node.expression);
		case 'ArrowFunctionExpression':
		case 'FunctionExpression':
			return node;
		default:
			return null;
	}
}

/**
 * The top-level slices that a selector reads off its first parameter, or `null` when it has no plain or object pattern
 * parameter or reads its state in a way that the rule cannot see.
 */
function selectorReads(
	sourceCode: SourceCode,
	fn: ESTree.ArrowFunctionExpression | ESTree.Function,
) {
	const [parameter] = fn.params;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a plain or an object pattern parameter names its slices, so `default` covers the rest.
	switch (parameter?.type) {
		case 'Identifier':
			return memberReads(sourceCode, fn, parameter);
		case 'ObjectPattern':
			return patternReads(sourceCode, parameter);
		default:
			return null;
	}
}

/**
 * The distinct slices that the uses of a plain state parameter read as static members, as in `(s) => s.rowSelection[id]`,
 * or `null` when a use takes the state whole or reads a computed member. The rebase of one slice replaces each `s.slice`
 * with `s`.
 */
function memberReads(
	sourceCode: SourceCode,
	fn: ESTree.ArrowFunctionExpression | ESTree.Function,
	parameter: ESTree.BindingIdentifier,
) {
	const { name } = parameter;
	const { references } = assertDefined(sourceCode.getScope(fn).set.get(name));
	const slices: string[] = [];
	const rebase: Fix[] = [];
	for (const { identifier } of references) {
		const member = identifier.parent;
		if (member.type !== 'MemberExpression' || member.object !== identifier) return null;
		const slice = memberName(member);
		if (slice === null) return null;
		if (!slices.includes(slice)) slices.push(slice);
		rebase.push({ range: member.range, text: name });
	}

	return {
		slices,
		rebase: slices.length === 1 ? rebaseOf(sourceCode, parameter, rebase, []) : null,
	} satisfies SelectorReads;
}

/**
 * The slices that an object pattern parameter destructures, as in `({ rowSelection }) => ...`, or `null` when it has a
 * rest element or a computed key. The rebase of a single property replaces the pattern with the property's value.
 */
function patternReads(sourceCode: SourceCode, pattern: ESTree.ObjectPattern) {
	const slices: string[] = [];
	for (const property of pattern.properties) {
		if (property.type === 'RestElement') return null;
		const slice = propertyName(property.key, property.computed);
		if (slice === null) return null;
		slices.push(slice);
	}

	const property = onlyElement(pattern.properties);
	return {
		slices,
		rebase:
			property?.type === 'Property'
				? rebaseOf(
						sourceCode,
						pattern,
						[{ range: pattern.range, text: sourceCode.getText(property.value) }],
						[property.value.range],
					)
				: null,
	} satisfies SelectorReads;
}

/**
 * The rebase edits of a selector, or `null` when its parameter has a type annotation, which types the whole state, or
 * an edit would drop a comment outside the kept ranges.
 */
function rebaseOf(
	sourceCode: SourceCode,
	{ typeAnnotation }: ESTree.BindingIdentifier | ESTree.ObjectPattern,
	fixes: Fix[],
	kept: Range[],
) {
	if ((typeAnnotation ?? null) !== null) return null;
	return fixes.some(({ range }) => dropsComment(sourceCode, { range, kept })) ? null : fixes;
}

/**
 * The `T.store` member of a table that a node is, possibly inside a JSX expression container, or `null` for any other
 * node.
 */
function tableStoreOf(
	sourceCode: SourceCode,
	services: TypeServices | null,
	node: ESTree.Node | null | undefined,
): ESTree.MemberExpression | null {
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a member, possibly inside a JSX expression container, is a store, so `default` covers the rest.
	switch (node?.type) {
		case 'JSXExpressionContainer':
			return tableStoreOf(sourceCode, services, node.expression);
		case 'MemberExpression':
			return isTableStore(sourceCode, services, node) ? node : null;
		default:
			return null;
	}
}

/** Whether a member is the `store` of a table. */
function isTableStore(
	sourceCode: SourceCode,
	services: TypeServices | null,
	member: ESTree.MemberExpression,
) {
	const { object } = member;
	return (
		memberName(member) === 'store' &&
		isTable(services, object, isTableReference(sourceCode, object))
	);
}

/** Whether a node is a table: by its syntax, as the caller found, or, with type information, by its type. */
function isTable(services: TypeServices | null, node: ESTree.Node, isSyntactic: boolean) {
	return isSyntactic || (services !== null && isTableType(services, node));
}

/** The JSX attribute with the given name, or `null` when none has it. Spread attributes are not searched. */
function jsxAttribute(attributes: readonly ESTree.JSXAttributeItem[], name: string) {
	for (const attribute of attributes) {
		if (attribute.type === 'JSXAttribute' && attribute.name.name === name) return attribute;
	}
	return null;
}

/**
 * Whether a JSX element name is TanStack's `Subscribe` component: `<x.Subscribe>`, or a binding that imports `Subscribe`
 * from `@tanstack/react-table`, under any local name.
 */
function isSubscribeElement(sourceCode: SourceCode, name: ESTree.JSXElementName) {
	return name.type === 'JSXMemberExpression'
		? name.property.name === SUBSCRIBE
		: name.type === 'JSXIdentifier' &&
				isImportOf(
					findVariable(sourceCode.getScope(name), name.name),
					SUBSCRIBE,
					isSubscribeModule,
				);
}

/** Whether a variable is bound by a named import of `imported` from a module that `isModule` accepts. */
function isImportOf(
	variable: Variable | null,
	imported: string,
	isModule: (module: string) => boolean,
) {
	const definition = variable?.defs[0];
	if (definition?.type !== 'ImportBinding') return false;
	const { node } = definition;
	const declaration = assertNotNull(definition.parent);
	return (
		declaration.type === 'ImportDeclaration' &&
		isModule(declaration.source.value) &&
		node.type === 'ImportSpecifier' &&
		moduleExportName(node.imported) === imported
	);
}

/** Whether a module is one whose `Subscribe` is TanStack Table's standalone subscription component. */
function isSubscribeModule(module: string) {
	return module === '@tanstack/react-table';
}

/** Whether a module is TanStack Store's React adapter, whose `useSelector` subscribes to an atom or a store. */
function isReactStoreModule(module: string) {
	return module === '@tanstack/react-store';
}

/** Whether a module is TanStack Store's Svelte adapter, whose `useSelector` subscribes to an atom or a store. */
function isSvelteStoreModule(module: string) {
	return module === '@tanstack/svelte-store';
}

/** The name that an import specifier imports: an identifier or a string literal. */
function moduleExportName(name: ESTree.ModuleExportName) {
	return name.type === 'Literal' ? name.value : name.name;
}

/** Reports a `.store` member of a table, suggesting slice atom reads where the store read names its slices. */
function reportStore(context: Context, store: ESTree.MemberExpression) {
	const { sourceCode } = context;
	const table = messageLabel(sourceCode.getText(store.object));
	const rewrite = atomRewrite(sourceCode, store);

	context.report({
		node: store,
		messageId: 'store',
		data: { table },
		suggest:
			rewrite === null
				? null
				: [
						{
							messageId: 'readAtoms',
							data: {
								table,
								slices: listLabel(
									rewrite.slices.map(slice => `\`${slice}\``),
									'',
								),
							},
							fix: fixer => fixer.replaceTextRange(rewrite.range, rewrite.text),
						},
					],
	});
}

/**
 * The rewrite of a read through `table.store` into reads of slice atoms, or `null` when the read names no slice
 * statically, the table is no plain reference, the store link is optional, or the rewrite would drop a comment.
 * `table.store.get().slice` and `table.store.state.slice` become `table.atoms.slice.get()`, and
 * `const { a, b: local } = table.store.get()` becomes `const a = table.atoms.a.get(), local = table.atoms.b.get()`.
 */
function atomRewrite(sourceCode: SourceCode, store: ESTree.MemberExpression) {
	const { object } = store;
	if (store.optional || referenceKey(object) === null) return null;
	const snapshot = storeSnapshot(store);
	if (snapshot === null) return null;

	const table = sourceCode.getText(object);
	const { parent } = snapshot;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a member read and a declarator name slices, so `default` covers the rest.
	switch (parent.type) {
		case 'MemberExpression':
			return parent.object === snapshot
				? sliceRead(sourceCode, table, object.range, parent)
				: null;
		case 'VariableDeclarator':
			// A snapshot expression can only be the initializer of a declarator, never its pattern.
			return destructuredSlices(sourceCode, table, object.range, parent);
		default:
			return null;
	}
}

/**
 * The expression that reads the current state snapshot off a `.store` member: the call `store.get()` or the member
 * `store.state`, or `null` for any other use.
 */
function storeSnapshot(store: ESTree.MemberExpression) {
	const { parent } = store;
	if (parent.type !== 'MemberExpression' || parent.object !== store) return null;

	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only `state` and `get` read the snapshot, so `default` covers every other name and `null`.
	switch (memberName(parent)) {
		case 'state':
			return parent;
		case 'get':
			return plainCall(parent);
		default:
			return null;
	}
}

/**
 * The call of a member that passes no argument, or `null` otherwise. A member inside a call without arguments can only
 * be its callee.
 */
function plainCall(callee: ESTree.MemberExpression) {
	const { parent } = callee;
	return parent.type === 'CallExpression' && parent.arguments.length === 0 ? parent : null;
}

/**
 * The rewrite of a slice read off a state snapshot, as in `table.store.get().slice`, or `null` when the read names no
 * identifier, calls a method, or is written.
 */
function sliceRead(
	sourceCode: SourceCode,
	table: string,
	tableRange: Range,
	member: ESTree.MemberExpression,
) {
	const slice = memberName(member);
	if (slice === null || !BINDABLE_NAME_REGEX.test(slice)) return null;

	const wrapper = outermostWrapper(member);
	if (isCallee(wrapper) || isWritten(wrapper)) return null;

	return keptRewrite(sourceCode, [tableRange], {
		range: member.range,
		text: atomRead(table, slice),
		slices: [slice],
	});
}

/** The static name of a member's property, or `null` for a private name or a dynamic computed key. */
function memberName({ property, computed }: ESTree.MemberExpression) {
	return propertyName(property, computed);
}

/**
 * Whether an expression is assigned, updated, or deleted. Expects the outermost wrapper around the expression (see
 * `outermostWrapper`).
 */
function isWritten(child: ESTree.Expression) {
	const { parent } = child;
	// oxlint-disable-next-line typescript/switch-exhaustiveness-check -- Only a few of the several hundred node types write a member, so `default` covers the rest.
	switch (parent.type) {
		case 'AssignmentExpression':
		case 'ForInStatement':
		case 'ForOfStatement':
			return parent.left === child;
		case 'UpdateExpression':
			return true;
		case 'UnaryExpression':
			return parent.operator === 'delete';
		default:
			return false;
	}
}

/**
 * The rewrite of a declarator that destructures a state snapshot, as in `const { a, b: local } = table.store.get()`,
 * into one declarator per slice, or `null` when the pattern is no object pattern, has a type annotation, no property, a
 * rest element, a default value, or a key that names no identifier.
 */
function destructuredSlices(
	sourceCode: SourceCode,
	table: string,
	tableRange: Range,
	declarator: ESTree.VariableDeclarator,
) {
	const { id } = declarator;
	if (
		id.type !== 'ObjectPattern' ||
		(id.typeAnnotation ?? null) !== null ||
		id.properties.length === 0
	) {
		return null;
	}

	const slices: string[] = [];
	const declarators: string[] = [];
	const kept = [tableRange];
	for (const property of id.properties) {
		if (property.type === 'RestElement' || property.value.type === 'AssignmentPattern') {
			return null;
		}
		const slice = propertyName(property.key, property.computed);
		if (slice === null || !BINDABLE_NAME_REGEX.test(slice)) return null;
		slices.push(slice);
		declarators.push(`${sourceCode.getText(property.value)} = ${atomRead(table, slice)}`);
		kept.push(property.value.range);
	}

	return keptRewrite(sourceCode, kept, {
		range: declarator.range,
		text: declarators.join(', '),
		slices,
	});
}

/** The read of a slice's atom off a table. */
function atomRead(table: string, slice: string) {
	return `${table}.atoms.${slice}.get()`;
}

/** A rewrite, or `null` when it would drop a comment outside the kept ranges. */
function keptRewrite(sourceCode: SourceCode, kept: readonly Range[], rewrite: AtomRewrite) {
	return dropsComment(sourceCode, { range: rewrite.range, kept }) ? null : rewrite;
}
