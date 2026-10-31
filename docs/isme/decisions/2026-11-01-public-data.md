# Public documentation and sensitive-history cleanup

Status: accepted. Designer: user in this conversation, 2026-11-01.

## Basis

The user requested maintainable, portable documentation with no private/sensitive information, then explicitly instructed removal of sensitive Git history. Existing authorization covers syncing branches and publishing the completed changes to main. The user subsequently stated teammates will develop on main; main is the collaboration baseline. This sensitive-data cleanup is a one-time authorized rewrite; ordinary updates remain fast-forward or merge-based.

## Decisions and invariants

- Public examples contain placeholders, loopback endpoints and project-relative or generic service paths.
- Remove the discovered contact number, personal workstation path, obsolete host address and private Git email from the repository history. Preserve public author names; use the verified public GitHub noreply identity for that author's email.
- The two reviewed API-key strings in the smoke test are synthetic fixtures, not credentials. Exempt only their exact file/rule/value fingerprints.
- Rewrite in an isolated bare clone. Preserve all local branch work and the existing stash; do not publish local-only branches or stash refs.
- Fetch and record remote heads before rewriting. Publish affected refs atomically with explicit force-with-lease expectations. A concurrent remote update rejects the push and requires a new snapshot; never replace that guard with a blind force push.
- Remap local refs only after remote publication succeeds and current file/index content is verified. Preserve working-tree contents, including other worktrees and unrelated untracked files.
- Retire old reachable refs/reflogs/objects and generated source bundles that contain the removed values. Temporary replacement rules stay outside the repository with private permissions and are deleted after verification.
- Verify a fresh remote clone and the final delivery archive. Remote caches and other people's existing clones are outside Git-ref rewrite control and must not be described as erased by this operation.

No Git hooks or repository access rules are installed or changed.
