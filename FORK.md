# Fork maintenance

This fork carries generic evaluation-table fixes on upstream MLflow v3.16.0. The maintained branch is `trace-ui-v3.16.0`; upstream history and tags are preserved. Application instrumentation, datasets, scorers and shared column preferences belong in the HoneyLabs repository.

The UI removes the ten-column cap, defaults to ungrouped traces with IDs hidden, places numeric metrics before Correctness and individual checks, preserves boolean badges, and leaves unscored cells empty. Embedded run-table headers still require assessment metadata to exist. Hovering Correctness summarizes the trace's recorded scorer results, with failures and errors first; clicking keeps the summary open for selection and copying. Long summaries scroll within the available viewport while the header and copy/close controls stay visible. The summary does not recalculate the overall grade or infer pass/fail from numeric metrics.

The experiment tag `mlflow.ui.evaluationRuns.defaultColumns` accepts an ordered JSON array of native column IDs, such as `["run_name", "param.model", "param.reasoning", "metric.latency/mean"]`. It controls the Evaluation runs list, including columns whose values have not arrived yet. Run selection and name remain available; other columns stay in the picker. The list refreshes every 30 seconds while a loaded run is running or scheduled, so published metrics update without a manual reload. Choices survive data refresh; browser reload reapplies the shared default. Missing or malformed configuration uses upstream defaults. HoneyLabs owns its selected field names in catalog synchronization.

The experiment tag `mlflow.ui.judges.gitManaged` publishes catalog-synchronized deterministic judges as a JSON manifest formatted as `{version: 1, judges: [{name, description, kind: "deterministic", source_path, source_sha256, source_tag, expectations_schema_tag}]}`. The manifest keeps the main tag compact and within MLflow's 20,000-character tag limit by storing judge source code in referenced experiment tags (e.g., `source_tag: "mlflow.ui.judges.source.<name>"`) and shared expectation schemas in referenced schema tags (e.g., `expectations_schema_tag: "mlflow.ui.judges.expectationsSchema"`). The native Judges page reads this manifest via the existing experiment query, validates references, hydrates Python source code and expectation schemas, and displays read-only cards alongside registered judges, including when the native registry is empty. Each card exposes the judge's role and description, Git-managed status badge, relative source path, SHA-256 hash, keyboard-accessible expandable Python source code, and formatted expectation schema when present, with height-bounded scrolling and line wrapping to avoid overflow. Git-managed entries omit registration, execution, edit, delete, and scheduling controls. If the manifest tag or referenced tags are missing or malformed, or if duplicate judge names exist, a clear catalog error alert is shown while preserving any existing native judges.

The inherited **Push-Images** and **Update Release Labels** workflows are disabled in this fork's GitHub Actions settings. They assume upstream release names and publishing destinations; fork releases use the wheel workflow below. Keep them disabled unless we deliberately adopt those publishing processes.

1. Make and review changes on the maintained branch. Run the affected UI tests, `yarn lint`, `yarn prettier:check`, `yarn i18n:check`, and `yarn type-check` from `mlflow/server/js`, plus the repository pre-commit checks. Browse a real evaluation run before and after refresh; verify both failed and absent assessments.
2. Push the reviewed commit and start the inherited build workflow with its **full commit SHA**:

   ```sh
   gh workflow run build-wheel.yml \
     --repo Honey-Labs-AI/mlflow \
     --ref trace-ui-v3.16.0 \
     -f ref="$(git rev-parse HEAD)"
   ```

3. Wait for the workflow to pass and download its full `mlflow-<version>-0.sha.<full-sha>-py3-none-any.whl` artifact. This self-contained wheel includes the production UI. The upstream workflow also builds supporting package artifacts; HoneyLabs consumes the full wheel.
4. Publish a new GitHub release targeting that commit and attach the exact wheel. Keep published tags and assets unchanged. The first release is `v3.16.0-trace-ui.1`.
5. In HoneyLabs, update the `mlflow` wheel URL in `pyproject.toml`, run `uv lock` and `uv sync --frozen`, then run `just test` and verify `just mlflow-ui` in the browser. Commit the dependency, lockfile and any changed guidance together. `uv.lock` records the artifact checksum.

For an upstream upgrade, create a branch from the new upstream release tag and reapply only fixes that remain necessary. Repeat the validation and release process above, updating the workflow branch and version. Fixes accepted upstream can be dropped from this fork.

The existing `dev/build.py --package-type dev --sha <full-sha>` assembles the wheel after `yarn build`; "dev" selects self-contained packaging. Installing directly from Git does not compile the UI. Use the released wheel for HoneyLabs installations.
