# Security policy

## Supported versions

The latest release is supported. Older versions are not patched.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use [GitHub's private vulnerability reporting](https://github.com/athosbes/recall-extension/security/advisories/new),
or email <athosbes@gmail.com>. A first response should arrive within a week.

Include what an attacker could do, how to reproduce it, and the version affected.

## What is in scope

Recall runs entirely in the browser and stores everything locally, so the interesting
surfaces are:

- Anything that lets a visited web page read, modify or exfiltrate the local library —
  the content script and the extension's message handlers are the boundary here.
- Anything that causes silent data loss (a migration, an import, or a delete path that
  destroys records it should not).
- Anything that causes data to leave the device. Recall makes no network requests; a
  path that does is a vulnerability, not a feature.
- Content injected into the dashboard or popup from captured page metadata.

## What is not in scope

- An attacker who already has access to the browser profile. Local storage is not
  encrypted at rest, and Recall does not claim it is.
- Backup files you export. They are plain JSON and contain everything you saved —
  protect them accordingly.
