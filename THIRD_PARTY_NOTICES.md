# Third-party dependencies

SolveBench uses the following direct dependencies. Versions and licenses below
were checked against the installed packages and lockfile for this alpha.

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `@opentui/core` | 0.5.12 | MIT | Terminal renderer |
| `@opentui/solid` | 0.5.12 | MIT | Solid terminal integration |
| `solid-js` | 1.9.12 | MIT | Reactive UI |
| `zod` | 4.6.5 | MIT | Runtime validation |
| `typescript` | 5.9.2 | Apache-2.0 | Development compiler |
| `@types/bun` | 1.4.2 | MIT | Development type definitions |
| `@tsconfig/bun` | 1.0.11 | MIT | Development compiler configuration |

OpenTUI's package metadata identifies its upstream repository as
https://github.com/anomalyco/opentui. Solid's upstream repository is
https://github.com/solidjs/solid. These are dependencies, with their own authors
and licenses; SolveBench's MIT license does not replace those licenses.

Dependency installation also brings transitive packages and platform-specific
OpenTUI native components. Their original license files stay in the installed
packages. TypeScript includes `LICENSE.txt` and `ThirdPartyNoticeText.txt`.
Keep these notices when redistributing installed dependencies. This direct
dependency inventory is not a complete transitive license audit or a bundled
binary's notice manifest.

Exercism, LeetCode, Bun, language runtimes, compilers and test tools are separate
projects or services. Installing or using them remains subject to their terms
and licenses. Imported exercise statements and user solutions are not relicensed
by this repository's license. The committed `examples/local-exercises` files are
the SolveBench sample; downloaded platform exercise content is not included.
