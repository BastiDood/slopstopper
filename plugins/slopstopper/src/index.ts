import { definePlugin } from '@oxlint/plugins';

import { DESTRUCTURE_ON_SIGHT } from './rules/destructure-on-sight/index.ts';
import { HANDLE_OR_RETHROW } from './rules/handle-or-rethrow/index.ts';
import { MERGE_EXCLUSIVE_BRANCHES } from './rules/merge-exclusive-branches/index.ts';
import { NEEDLESS_TYPE_INTERSECTION } from './rules/needless-type-intersection/index.ts';
import { NO_ALIAS_OBJECT_TYPE } from './rules/no-alias-object-type/index.ts';
import { NO_ARRAY_FILTER_MAP } from './rules/no-array-filter-map/index.ts';
import { NO_CONDITIONAL_EMPTY_OBJECT_SPREAD } from './rules/no-conditional-empty-object-spread/index.ts';
import { NO_DEFAULTED_QUERY_KEY } from './rules/no-defaulted-query-key/index.ts';
import { NO_EQUALITY_CHAIN } from './rules/no-equality-chain/index.ts';
import { NO_INFERRABLE_RETURN_TYPE } from './rules/no-inferrable-return-type/index.ts';
import { NO_KNOWN_VALUE_WIDENING } from './rules/no-known-value-widening/index.ts';
import { NO_MULTIPLE_OPTIONAL_PARAMETERS } from './rules/no-multiple-optional-parameters/index.ts';
import { NO_MUTATE_CALLBACK_CACHE_UPDATE } from './rules/no-mutate-callback-cache-update/index.ts';
import { NO_NEGATED_GROUP } from './rules/no-negated-group/index.ts';
import { NO_NEGATED_QUANTIFIER_CALLBACK } from './rules/no-negated-quantifier-callback/index.ts';
import { NO_PLAIN_TEMPLATE_LITERAL } from './rules/no-plain-template-literal/index.ts';
import { NO_POSITIONAL_SCALARS } from './rules/no-positional-scalars/index.ts';
import { NO_PRIVATE_MODIFIER } from './rules/no-private-modifier/index.ts';
import { NO_REDUCE_ACCUMULATOR_COPY } from './rules/no-reduce-accumulator-copy/index.ts';
import { NO_RENDER_SCOPED_TABLE_SCHEMA } from './rules/no-render-scoped-table-schema/index.ts';
import { NO_STANDALONE_MUTATE_ASYNC } from './rules/no-standalone-mutate-async/index.ts';
import { NO_TEMPORARY_ACCESS } from './rules/no-temporary-access/index.ts';
import { NO_TYPE_PREDICATES } from './rules/no-type-predicates/index.ts';
import { NO_UNKNOWN_RETURNS } from './rules/no-unknown-returns/index.ts';
import { NO_UNKNOWN_TYPE_ALIASES } from './rules/no-unknown-type-aliases/index.ts';
import { NO_UNSAFE_DICTIONARY_TYPE } from './rules/no-unsafe-dictionary-type/index.ts';
import { NO_UNTYPED_EMPTY_INITIALIZER } from './rules/no-untyped-empty-initializer/index.ts';
import { PREFER_CLASS_OVER_FACTORY } from './rules/prefer-class-over-factory/index.ts';
import { PREFER_DE_MORGAN } from './rules/prefer-de-morgan/index.ts';
import { PREFER_PREFIX_INCREMENT } from './rules/prefer-prefix-increment/index.ts';
import { PREFER_QUERY_KEY_CONTEXT } from './rules/prefer-query-key-context/index.ts';
import { PREFER_SWITCH } from './rules/prefer-switch/index.ts';
import { PREFER_TABLE_ATOMS } from './rules/prefer-table-atoms/index.ts';
import { PREFER_TYPEOF_UNDEFINED } from './rules/prefer-typeof-undefined/index.ts';
import { PREFER_WHILE_TRUE } from './rules/prefer-while-true/index.ts';
import { REQUIRE_EXCLUSIVE_INDETERMINATE } from './rules/require-exclusive-indeterminate/index.ts';
import { REQUIRE_TABLE_STATE_PAIRS } from './rules/require-table-state-pairs/index.ts';
import { STEPDOWN_ORDER } from './rules/stepdown-order/index.ts';

/** The slopstopper rules, loadable as an Oxlint JS plugin and as an ESLint plugin. */
export default definePlugin({
	meta: { name: 'slopstopper' },
	rules: {
		'destructure-on-sight': DESTRUCTURE_ON_SIGHT,
		'handle-or-rethrow': HANDLE_OR_RETHROW,
		'merge-exclusive-branches': MERGE_EXCLUSIVE_BRANCHES,
		'needless-type-intersection': NEEDLESS_TYPE_INTERSECTION,
		'no-alias-object-type': NO_ALIAS_OBJECT_TYPE,
		'no-array-filter-map': NO_ARRAY_FILTER_MAP,
		'no-conditional-empty-object-spread': NO_CONDITIONAL_EMPTY_OBJECT_SPREAD,
		'no-defaulted-query-key': NO_DEFAULTED_QUERY_KEY,
		'no-equality-chain': NO_EQUALITY_CHAIN,
		'no-inferrable-return-type': NO_INFERRABLE_RETURN_TYPE,
		'no-known-value-widening': NO_KNOWN_VALUE_WIDENING,
		'no-multiple-optional-parameters': NO_MULTIPLE_OPTIONAL_PARAMETERS,
		'no-mutate-callback-cache-update': NO_MUTATE_CALLBACK_CACHE_UPDATE,
		'no-negated-group': NO_NEGATED_GROUP,
		'no-negated-quantifier-callback': NO_NEGATED_QUANTIFIER_CALLBACK,
		'no-plain-template-literal': NO_PLAIN_TEMPLATE_LITERAL,
		'no-positional-scalars': NO_POSITIONAL_SCALARS,
		'no-private-modifier': NO_PRIVATE_MODIFIER,
		'no-reduce-accumulator-copy': NO_REDUCE_ACCUMULATOR_COPY,
		'no-render-scoped-table-schema': NO_RENDER_SCOPED_TABLE_SCHEMA,
		'no-standalone-mutate-async': NO_STANDALONE_MUTATE_ASYNC,
		'no-temporary-access': NO_TEMPORARY_ACCESS,
		'no-type-predicates': NO_TYPE_PREDICATES,
		'no-unknown-returns': NO_UNKNOWN_RETURNS,
		'no-unknown-type-aliases': NO_UNKNOWN_TYPE_ALIASES,
		'no-unsafe-dictionary-type': NO_UNSAFE_DICTIONARY_TYPE,
		'no-untyped-empty-initializer': NO_UNTYPED_EMPTY_INITIALIZER,
		'prefer-class-over-factory': PREFER_CLASS_OVER_FACTORY,
		'prefer-de-morgan': PREFER_DE_MORGAN,
		'prefer-prefix-increment': PREFER_PREFIX_INCREMENT,
		'prefer-query-key-context': PREFER_QUERY_KEY_CONTEXT,
		'prefer-switch': PREFER_SWITCH,
		'prefer-table-atoms': PREFER_TABLE_ATOMS,
		'prefer-typeof-undefined': PREFER_TYPEOF_UNDEFINED,
		'prefer-while-true': PREFER_WHILE_TRUE,
		'require-exclusive-indeterminate': REQUIRE_EXCLUSIVE_INDETERMINATE,
		'require-table-state-pairs': REQUIRE_TABLE_STATE_PAIRS,
		'stepdown-order': STEPDOWN_ORDER,
	},
});
