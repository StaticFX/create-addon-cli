# create-addon-cli

Scaffold a [Create](https://modrinth.com/mod/create) (Minecraft) mod addon in one
command — the `create-next-app` of Create addons.

```bash
npm create addon-cli@latest
# or
npx create-addon-cli my-mod
```

It shallow-clones the
[Create addon template](https://github.com/StaticFX/create-addon-template) (kinetic
block, sequenced-assembly + fan-processing recipes, a Ponder plugin scaffold,
datagen, CI) and rebrands every `Example` / `examplemod` reference to your own mod —
package, classes, mixin config and all — so you start from a compiling project
instead of a find-and-replace chore.

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
No template is bundled in the package, so `npx` always gets the latest template.

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

CI does it — `.github/workflows/publish.yml` builds a smoke-test project (real clone
+ rebrand), then publishes to npm.

One-time setup: create an npm **automation token** (npmjs.com → Access Tokens) and
add it to the repo as a secret named `NPM_TOKEN` (Settings → Secrets and variables →
Actions).

To cut a release:

```bash
# bump "version" in package.json, then:
git tag v0.1.0
git push origin v0.1.0
```

The workflow skips automatically if that version is already on npm, so re-runs are
safe. You can also trigger it manually from the Actions tab. To publish by hand:
`npm login && npm publish`.
