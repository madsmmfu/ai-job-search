# Publication sanitization

## Plan and scope

Preserve the current source customizations while excluding personal CVs, profiles, applications, recruiter conversations, browser sessions, credentials, generated exports, dependencies, caches, and Git history. Replace personal literals with fictional examples. Keep upstream copyright and attribution. Validate through local, non-submitting tests.

## Applied changes

- Copied source files from the current working tree, including local Chinese UI and BOSS modules. No original Git history or user data directories are included.
- Excluded private profile and BOSS configuration, data-root pointers, real documents, generated reports, browser/login state, logs, caches, installed dependencies, and environment files.
- Replaced personal names, a specific resume filename, and a local home-directory literal in source/tests with demonstration values. The example BOSS configuration starts disabled and contains no candidate identity or search scope.
- Included an empty-value `.env.example`; private configuration and session paths are ignored by Git.
- Preserved public upstream author attribution, license information, generic fixtures, and security test addresses. Such upstream examples are not records from the publisher’s personal job search.

## Validation

- Root syntax check: 1,448 JavaScript modules passed.
- Focused BOSS agent, attachment, bridge, and reply-policy tests: 25 passed, 1 optional CLI test skipped.
- Web BOSS parsing, attachment, and resume-chat tests: 12 passed.
- Web TypeScript typecheck passed.
- Known local personal-name, home-path, private-account, and credential-pattern scan found no remaining matches. This is a bounded automated source review, not a guarantee about every possible identifier.
- Validation borrowed existing local dependency installations only temporarily; no dependency links, browser sessions, or user data are included. No real applications or recruiter messages were sent.
