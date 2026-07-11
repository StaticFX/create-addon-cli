# create-addon-cli

Scaffold a [Create](https://modrinth.com/mod/create) (Minecraft) mod addon in one
command — the `create-next-app` of Create addons.

```bash
npm create addon-cli@latest
# or
npx create-addon-cli my-mod
```

## Usage

```
npm create addon-cli@latest [dir] [options]

Options
  --name <name>       Mod display name (e.g. "Sick Mod")
  --id <id>           Mod id             (default: name, lowercased)
  --group <group>     Base package       (default: com.example.<id>)
  --author <author>   Mod author
  --template <spec>   Template to clone  (default: StaticFX/create-addon-template;
                                          owner/repo[#ref] or any git URL)
  --no-git            Skip git init
  -y, --yes           Accept defaults, no prompts
  --force             Scaffold into a non-empty directory
```

Run with no options for an interactive walkthrough, or pass flags for a
non-interactive/CI run:

```bash
npx create-addon-cli sick-mod --name "Sick Mod" --group com.acme.sickmod --author Devin
```

Then:

```bash
cd sick-mod
./gradlew runData     # generate assets & recipes
./gradlew runClient   # launch the game
```

## How it works

The tool clones the template with `git clone --depth 1` into a temp dir, strips the
`.git`, copies the files into your target directory, and applies the rename rules in
`src/lib/transform.ts` (which mirror the template's `gradle/rename-mod.gradle` task).

Point `--template` at a fork or a pinned ref (`owner/repo#v1.2.0`) to scaffold from
something other than the default.

## Requirements

- Node.js ≥ 18 and `git` on your PATH
- The template repo must be reachable (public, or you have clone access)
- JDK 21 to build the generated mod

## Development

TypeScript, bundled with [tsup](https://tsup.egoist.dev/) into a single
zero-dependency ESM file (commander is inlined). Arg parsing is
[commander](https://github.com/tj/commander.js); prompts are hand-rolled ANSI.

```bash
npm install
npm run dev -- --name "Sick Mod"   # run src/index.ts directly via tsx
npm run typecheck                  # tsc --noEmit
npm run build                      # bundle to dist/index.js
```

Source lives in `src/` (`index.ts` + `lib/{ui,transform,clone}.ts`); `dist/` is built
output (git-ignored, produced on `prepack`).

## Publishing

Releases go through `.github/workflows/publish.yml` using npm **Trusted Publishing**
(OIDC) — no `NPM_TOKEN` secret to manage. The workflow authenticates to npm with a
short-lived GitHub OIDC token (`id-token: write`) and provenance is attached
automatically.

One-time setup on npmjs.com → the package → **Settings → Trusted Publisher → GitHub
Actions**:

| Field | Value |
| --- | --- |
| Organization or user | `StaticFX` |
| Repository | `create-addon-cli` |
| Workflow filename | `publish.yml` |
| Environment | *(leave blank)* |

Because a trusted publisher is configured on an existing package, do the **first**
publish once by hand, then every release after that is tokenless:

```bash
npm install && npm publish --access public   # first time only (creates the package)
```

To cut a release once trusted publishing is set up — bump `version` in
`package.json`, then:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow skips automatically if that version is already on npm, so re-runs are
safe.
