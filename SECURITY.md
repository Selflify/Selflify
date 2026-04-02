# Security Policy

## Supported versions

Selflify currently supports:

- the latest `stable` branch
- the latest published release assets and container images

Older commits, unpublished branches, and locally modified deployments are outside the supported security window.

## Reporting a vulnerability

Do not open public GitHub issues for security reports.

Use this order of preference:

1. GitHub private vulnerability reporting, if the repository shows a `Report a vulnerability` button.
2. If private reporting is not available, contact [@aleksnick](https://github.com/aleksnick) privately on GitHub and include:
   - affected version or commit
   - impact
   - reproduction steps
   - any suggested mitigation

## Response expectations

- Initial acknowledgement: within 3 business days
- Follow-up status update: within 7 business days

## Scope

Please report issues that affect:

- authentication and session handling
- first-time setup and bootstrap flows
- generated `Caddyfile` and runtime configuration handling
- Cloudflare integration
- GitHub Actions, bootstrap installer, and deployment images

## Out of scope

The following are generally out of scope unless they clearly lead to a security impact:

- spelling or copy issues
- UI-only bugs without a security consequence
- rate limits or quotas imposed by third-party services
