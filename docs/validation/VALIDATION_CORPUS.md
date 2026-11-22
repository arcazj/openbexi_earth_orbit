# Validation corpus

The 2.6.0 local run passed all 544 JPL interpolation checks and 48 synthetic SGP4 holdouts from the frozen 2.5 acceptance packet. Independent physical-model and human qualification remain open. [Sampling and numerical limits](V2_5_ACCEPTANCE.md) · [2.6.0 run results](../../release/evidence/v2.6.0-development-checks.json)

Historical corpora under `validation/v2.0.0` through `validation/v2.3.2` retain their original manifests, sidecars, source licenses and recorded artifact names. They describe exact historical trees, including documents that have since moved or been consolidated. Never rewrite their names, hashes or approval states to match a later release.

`npm run check:validation` pins those historical manifests, validates the current catalog closure, and runs the frozen 2.5 science checks. The 2.5 manifest SHA-256 is `002317298fd2abdb9e54ad19add097b81d6eec75b81edc1dfb312807fac96b42`. Acceptance data is never regenerated during normal tests.

A failed holdout becomes diagnostic evidence. Fix the implementation or source, then create a fresh acceptance round; retain the failed round and do not loosen tolerances. Record source queries, frames, time scales, units, hashes, sampling policy and limitations. JPL grid/holdout comparisons share the same physical model; python-sgp4 is a separate implementation of SGP4, not independent orbital truth.

The source-rights fields record the terms reviewed for each historical corpus. The release policy records the status of the current build. [Release policy](../governance/RELEASE_POLICY.md) · [Data governance](../governance/DATA_SOURCES.md)
