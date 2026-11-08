# Validation corpus

The current 2.5 acceptance packet adds 544 JPL interpolation checks and 48 synthetic SGP4 holdouts. See [sampling, limits and reproduction](V2_5_ACCEPTANCE.md). These are sampled numerical checks; independent physical-model and human qualification remain pending.

Historical corpora under `validation/v2.0.0` through `validation/v2.3.2` retain their original manifests, sidecars, source licenses and recorded artifact names. They describe exact historical trees, including documents that have since moved or been consolidated. Never rewrite their names, hashes or approval states to match a later release.

`npm run check:validation` pins those historical manifests, validates the current catalog closure, and runs the frozen 2.5 science checks. The 2.5 manifest SHA-256 is `002317298fd2abdb9e54ad19add097b81d6eec75b81edc1dfb312807fac96b42`. Acceptance data is never regenerated during normal tests.

A failed holdout becomes diagnostic evidence. Fix the implementation or source, then create a fresh acceptance round; retain the failed round and do not loosen tolerances. Record source queries, frames, time scales, units, hashes, sampling policy and limitations. JPL grid/holdout comparisons share the same physical model; python-sgp4 is a separate implementation of SGP4, not independent orbital truth.

Old source-rights fields remain historical. Current owner publication authorization and upstream terms are documented in [licensing](../governance/LICENSING_TRANSITION_V2_5.md) and [data governance](../governance/DATA_SOURCES.md). No corpus record establishes operational fitness or collision probability without validated uncertainty inputs.
