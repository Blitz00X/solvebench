# Reddit post draft — not posted

Do not publish this draft until the repository, alpha tag and installation URL
are real and the final release checks pass. The owner selected the public
repository `Blitz00X/solvebench`; it has not been created or published yet.

## Publishing notes

One provisional candidate: **r/sideprojects** (plural, distinct from
r/SideProject). Its [June 16, 2025 moderator rules announcement](https://www.reddit.com/r/sideprojects/comments/1ld5xve/my_side_project_rsideprojects_new_rules_and_an/)
permits advertising projects, requires significant changes before sharing a
project again, prohibits astroturfing and contact-bait service advertising,
and says post flairs will be required. That makes an honest first showcase a
plausible fit; this is an inference from a dated announcement, not moderator
approval or verification of today's complete rules.

**Current eligibility is unverified as of October 19, 2026.** The search index
did not establish this community's current AI-development/AI-written-text
policy, repository-age or account requirements, exact flair, or whether a
showcase thread/day is now required. The owner must read its current rules and
pinned threads in Reddit's own UI before deciding to publish. Disclose AI's
role in development accurately and write the final submission personally if
the current rules require human-written text. This draft is working material.

Do not use **r/commandline** for this draft: its [May 9, 2026 rules](https://www.reddit.com/r/commandline/comments/1t8pkj7/please_read_the_rules/)
explicitly prohibit AI-generated post text and titles. No verified alternative
permission was established for r/SideProject; its similarly named plural
community's rules must not be applied to it. The [August 6, 2026 r/opensource
AI-policy discussion](https://www.reddit.com/r/opensource/comments/1vhfs49/aipolicy/)
is a request for policy feedback, not evidence that this launch is allowed.

Evidence access: **2026-10-19 13:20 UTC**, search-engine index only (level C),
primary community moderator/rules announcements for the linked sources; no
direct Reddit fetch, authenticated rule inspection, posting, or moderator
contact. Queries included `site:reddit.com/r/SideProject/about/rules`,
`site:reddit.com/r/opensource "Read the rules" "AI"`, and
`site:reddit.com/r/sideprojects "rules" "2026" "AI"`. Supporting indexed rule
fragments: r/sideprojects, “will allow advertising projects”; r/commandline,
“Post text or titles generated with AI are strictly prohibited.” The date
above is access time; each linked announcement's publication date is given
separately. Search snippets may be stale or incomplete.

Before sending, replace the release-link marker below with the verified public
release URL, confirm the README setup command from a clean Linux environment,
and attach a readable demo if one has been recorded. Say whether the demo uses
the mock assistant or an actual configured provider. Do not imply a mock reply
is real AI. Publishing requires the owner's separate instruction.

## Title

I built SolveBench, a terminal workbench for solving coding exercises yourself (Linux alpha)

## Body

I wanted the question, my solution, test output and an optional assistant in
one terminal window, without giving an agent control of the solution files.
SolveBench is an early open-source attempt at that workflow.

You open an exercise, edit the code yourself and run its tests. The optional
assistant gets the opened question, current code and latest test output, so
there is less context to paste by hand. Its replies are text for you to review.

There is a bundled Local sample you can try without an account or API key.
It starts with an incomplete solution so you can see a failure, fix it and run
the test again. Custom folders can supply a Markdown question, solution files
and a test command. Keyboard navigation and fullscreen reading work for the
question and assistant panes.

Release and setup: **[insert verified public alpha release URL before posting]**

This is a Linux alpha. macOS and Windows have not been validated. Exercism and
LeetCode adapters exist, but live account workflows have not been validated for
this release. The default assistant is an offline mock; a real model connection
is optional and uses your configured provider. Local tests execute with your
user permissions, not in a sandbox. Full chat/session restoration is not built
yet.

If you try it, where did you first get stuck: installation or solving the first
sample exercise?
