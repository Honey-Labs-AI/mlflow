import type { GitManagedJudge } from './types';

export const GIT_MANAGED_JUDGES_TAG = 'mlflow.ui.judges.gitManaged';

export interface ParseGitManagedJudgesResult {
  judges: GitManagedJudge[];
  error: string | null;
}

export type ExperimentTagsInput =
  | Record<string, string | null | undefined>
  | Array<{ key?: string | null; value?: string | null }>
  | null
  | undefined;

/**
 * Validates and parses the Git-managed judges catalog tag and hydrates source and
 * schema references from the experiment tags.
 *
 * Manifest tag shape:
 * {
 *   version: 1,
 *   judges: [
 *     {
 *       name: string,
 *       description: string,
 *       kind: string,
 *       source_path: string,
 *       source_sha256: string,
 *       source_tag: string,
 *       expectations_schema_tag?: string
 *     }
 *   ]
 * }
 */
export const parseGitManagedJudgesTag = (
  tagValue?: string | null,
  allTags?: ExperimentTagsInput,
): ParseGitManagedJudgesResult => {
  if (!tagValue || tagValue.trim() === '') {
    return { judges: [], error: null };
  }

  try {
    const parsed = JSON.parse(tagValue);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { judges: [], error: 'Catalog must be a JSON object' };
    }

    if (parsed.version !== 1) {
      return { judges: [], error: `Unsupported catalog version: ${parsed.version} (expected 1)` };
    }

    if (!Array.isArray(parsed.judges)) {
      return { judges: [], error: 'Catalog property "judges" must be an array' };
    }

    // Index all experiment tags for fast lookup
    const tagsMap = new Map<string, string>();
    if (Array.isArray(allTags)) {
      for (const tag of allTags) {
        if (tag && tag.key && typeof tag.value === 'string') {
          tagsMap.set(tag.key, tag.value);
        }
      }
    } else if (allTags && typeof allTags === 'object') {
      for (const [key, value] of Object.entries(allTags)) {
        if (typeof value === 'string') {
          tagsMap.set(key, value);
        }
      }
    }

    const hydratedJudges: GitManagedJudge[] = [];
    const seenNames = new Set<string>();

    for (let i = 0; i < parsed.judges.length; i++) {
      const judge = parsed.judges[i];
      if (!judge || typeof judge !== 'object' || Array.isArray(judge)) {
        return { judges: [], error: `Judge at index ${i} must be a valid JSON object` };
      }
      if (typeof judge.name !== 'string' || !judge.name.trim()) {
        return { judges: [], error: `Judge at index ${i} is missing a valid name` };
      }

      if (seenNames.has(judge.name)) {
        return { judges: [], error: `Duplicate judge name "${judge.name}" found in catalog` };
      }
      seenNames.add(judge.name);

      if (typeof judge.description !== 'string') {
        return { judges: [], error: `Judge "${judge.name}" is missing a description` };
      }
      if (typeof judge.kind !== 'string' || !judge.kind.trim()) {
        return { judges: [], error: `Judge "${judge.name}" is missing a valid kind` };
      }
      if (typeof judge.source_path !== 'string' || !judge.source_path.trim()) {
        return { judges: [], error: `Judge "${judge.name}" is missing a source_path` };
      }
      if (typeof judge.source_sha256 !== 'string' || !judge.source_sha256.trim()) {
        return { judges: [], error: `Judge "${judge.name}" is missing a source_sha256` };
      }

      // Validate source_tag reference (strictly reference contract, no inline fallback)
      if (typeof judge.source_tag !== 'string' || !judge.source_tag.trim()) {
        return { judges: [], error: `Judge "${judge.name}" is missing a valid source_tag reference` };
      }

      const sourceCode = tagsMap.get(judge.source_tag);
      if (sourceCode === undefined) {
        return {
          judges: [],
          error: `Referenced source tag "${judge.source_tag}" not found for judge "${judge.name}"`,
        };
      }

      // Validate expectations_schema_tag reference if present
      let expectationsSchema: Record<string, unknown> | undefined = undefined;
      if (judge.expectations_schema_tag !== undefined && judge.expectations_schema_tag !== null) {
        if (typeof judge.expectations_schema_tag !== 'string' || !judge.expectations_schema_tag.trim()) {
          return {
            judges: [],
            error: `Judge "${judge.name}" has invalid expectations_schema_tag reference`,
          };
        }

        const rawSchema = tagsMap.get(judge.expectations_schema_tag);
        if (rawSchema === undefined) {
          return {
            judges: [],
            error: `Referenced expectations schema tag "${judge.expectations_schema_tag}" not found for judge "${judge.name}"`,
          };
        }

        try {
          const parsedSchema = JSON.parse(rawSchema);
          if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
            return {
              judges: [],
              error: `Referenced expectations schema tag "${judge.expectations_schema_tag}" must be a JSON object`,
            };
          }
          expectationsSchema = parsedSchema;
        } catch (err: any) {
          return {
            judges: [],
            error: `Failed to parse expectations schema tag "${judge.expectations_schema_tag}": ${err?.message || 'Invalid JSON'}`,
          };
        }
      }

      hydratedJudges.push({
        name: judge.name,
        description: judge.description,
        kind: judge.kind,
        source: sourceCode,
        source_path: judge.source_path,
        source_sha256: judge.source_sha256,
        source_tag: judge.source_tag,
        expectations_schema_tag: judge.expectations_schema_tag,
        expectations_schema: expectationsSchema,
      });
    }

    return { judges: hydratedJudges, error: null };
  } catch (err: any) {
    return { judges: [], error: err?.message || 'Invalid JSON format' };
  }
};
