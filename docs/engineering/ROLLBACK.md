# Recovery and rollback

Stop admission/updates when source lineage, catalog counts, frame/time semantics, access controls or deployment integrity fail. Preserve private diagnostics and the selected pointer. Never repair a private candidate by editing release snapshots.

## Runtime recovery

1. Stop the server and checksum-copy the entire private runtime root, including database, catalogs and candidate pointer.
2. Select a previously validated candidate. Recheck GP/TLE/SATCAT/launch/decay revision pairs, raw hashes, tracked chunks and current source lineage.
3. Restore the pointer atomically while stopped, then restart the same compatible server version. Failed writes must retain the old readable pointer.
4. Verify API/static aliases agree and the durable catalog activates the selected revision. Request-time activation failure retains the prior coherent root; scheduler callback failures are separately reported and retried.
5. Re-enable updates only after the defect is understood and a regression test passes.

`node scripts/python.mjs tools/rehearse_v25_recovery.py` exercises synthetic backup, restore, idempotence and restart in disposable roots. It does not qualify production backup operations or mutate the user's pointer.

## Static application recovery

`npm run rehearse:rollback` verifies the artifact, required notices, corrupt-candidate rejection, tracked-to-GP fallback and restoration. If needed, disable the tracked feature in release metadata, regenerate, build and test a new coherent artifact.

The Pages workflow accepts only the exact current master commit. Restore a known-good application with a reviewed revert as a new master commit, then separately authorize and dispatch Pages for that commit. Do not force-push history, combine files from releases or assume archived dist uploads are supported. Verify the uploaded archive and deployed bytes as described in [Pages deployment](PAGES_DEPLOYMENT.md).
