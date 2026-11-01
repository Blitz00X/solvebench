# Security reports

SolveBench is an early alpha. Security fixes target the latest alpha; there
is no long-term support branch or promised response time.

Do not put exploit details, private code, API keys or cookies in a public issue.
Use the repository's Security tab and its **Report a vulnerability** action when
private vulnerability reporting is enabled. If it is not enabled, open a minimal
public issue asking the maintainer for a private channel, without disclosing the
vulnerability or sensitive attachments.

Include the version, OS, affected component, minimal reproduction, expected
impact and a sanitized example. If a credential was exposed, revoke it through
the relevant provider; deleting a message or Git commit does not revoke it.

Local exercise commands are deliberately executable user code, with inherited
environment and filesystem/network access. They are not sandboxed. AI replies
are text and have no workspace mutation tool. See [PRIVACY.md](PRIVACY.md) for
what reaches an optional model endpoint and where credentials are stored.
