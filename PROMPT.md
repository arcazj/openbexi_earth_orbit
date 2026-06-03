# General Execution Prompt

Execute the latest release defined in `PROMPT_History.md`.

1. Identify the most recent release entry in `PROMPT_History.md` by release date and version number.
2. Implement the full scope of that release. Treat its requirements, verification steps, and deliverables as authoritative.
3. Before making code changes, inspect `git status` and avoid mixing unrelated existing work, generated files, or untracked assets into the release implementation.
4. Update `Test_and_Integration.md` to cover every feature, behavior change, regression risk, and verification step introduced by the latest release.
5. After `Test_and_Integration.md` is updated, run all automated tests and complete every required integration/manual check listed in that file.
6. Update `README.md` if the latest release changes usage, setup, testing, controls, features, architecture, or known limitations.
7. Ensure `README.md` references every repository Markdown file (`*.md`) with a short explanation of what each file contains and when to use it.
8. Do not report the release as complete until implementation is finished, `Test_and_Integration.md` is current, all required tests/checks pass or are explicitly documented as limitations, and `README.md` is accurate.

Final report must include:

1. Latest release executed.
2. Files changed.
3. Features or fixes implemented.
4. `Test_and_Integration.md` updates.
5. Tests and integration checks performed, with results.
6. `README.md` updates, including Markdown-file references.
7. Remaining limitations or follow-up work, if any.
