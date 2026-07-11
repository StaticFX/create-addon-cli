// The rename rules that turn the freshly-cloned "examplemod" template into a real
// project, applied in place. These mirror the repo's gradle/rename-mod.gradle task,
// so keep the two in lockstep.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const OLD_GROUP = 'com.example.examplemod';
const OLD_PKG_PATH = 'com/example/examplemod';

// Files we rewrite the contents of (everything that can mention the mod).
const TEXT_EXT = new Set(['.java', '.gradle', '.properties', '.json', '.md', '.toml']);

/** The identifiers a project is rebranded to. */
export interface Names {
  display: string;
  pascal: string;
  modId: string;
  group: string;
  mainClass: string;
}

export interface DeriveInput {
  name: string;
  id?: string;
  group?: string;
}

const capitalize = (s: string): string =>
  s.length > 1 ? s[0].toUpperCase() + s.slice(1) : s.toUpperCase();

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Derive every identifier the template needs from the user's answers. */
export function deriveNames({ name, id, group }: DeriveInput): Names {
  const display = name.trim();
  const pascal = display.split(/[^A-Za-z0-9]+/).filter(Boolean).map(capitalize).join('');
  if (!pascal) throw new Error(`"${display}" has no letters or digits to build a class name from.`);
  const modId = id?.trim() || display.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!modId) throw new Error(`Could not derive a mod id from "${display}"; pass one explicitly.`);
  const modGroup = group?.trim() || `com.example.${modId}`;
  return { display, pascal, modId, group: modGroup, mainClass: pascal };
}

/** Rewrite a file's text, most-specific token first (see the gradle task). */
export function transformContent(s: string, n: Names): string {
  return s
    .split(OLD_GROUP).join(n.group)
    .split('ExampleMod').join(n.mainClass)
    .replace(/Example(?=[A-Z])/g, n.pascal)
    .split('Example Create Addon').join(n.display)
    .split('examplemod').join(n.modId)
    .split('example_').join(`${n.modId}_`);
}

/** Rewrite a file/dir name (class names + the mixin config id). */
export function transformName(s: string, n: Names): string {
  return s
    .split('ExampleMod').join(n.mainClass)
    .replace(/Example(?=[A-Z])/g, n.pascal)
    .split('examplemod').join(n.modId);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(d: string): Promise<void> {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) await rec(p);
      else out.push(p);
    }
  }
  await rec(dir);
  return out;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function removeIfEmpty(dir: string): Promise<void> {
  if (!(await pathExists(dir))) return;
  const entries = await fs.readdir(dir);
  if (entries.length === 0) await fs.rmdir(dir);
}

/** Rebrand an already-populated project directory in place. */
export async function applyRename({ targetDir, names }: { targetDir: string; names: Names }): Promise<Names> {
  // 1. Rewrite text file contents.
  for (const file of await walk(targetDir)) {
    if (!TEXT_EXT.has(path.extname(file))) continue;
    const before = await fs.readFile(file, 'utf8');
    const after = transformContent(before, names);
    if (after !== before) await fs.writeFile(file, after);
  }

  // 2. Drop the gradle rename task — the project is already named.
  const renameGradle = path.join(targetDir, 'gradle', 'rename-mod.gradle');
  if (await pathExists(renameGradle)) await fs.rm(renameGradle);
  const buildGradle = path.join(targetDir, 'build.gradle');
  if (await pathExists(buildGradle)) {
    const lines = (await fs.readFile(buildGradle, 'utf8')).split('\n');
    const kept = lines.filter(
      (l) => !l.includes("apply from: 'gradle/rename-mod.gradle'") &&
             !l.includes('Template bootstrap task:'),
    );
    await fs.writeFile(buildGradle, kept.join('\n'));
  }

  // 3. Rename Example*.java files.
  for (const file of await walk(targetDir)) {
    if (path.extname(file) !== '.java') continue;
    const base = path.basename(file);
    const renamed = transformName(base, names);
    if (renamed !== base) await fs.rename(file, path.join(path.dirname(file), renamed));
  }

  // 4. Move the Java package to the new group path.
  const srcJava = path.join(targetDir, 'src', 'main', 'java');
  const oldPkg = path.join(srcJava, OLD_PKG_PATH);
  const newPkg = path.join(srcJava, ...names.group.split('.'));
  if ((await pathExists(oldPkg)) && oldPkg !== newPkg) {
    await fs.mkdir(path.dirname(newPkg), { recursive: true });
    await fs.rename(oldPkg, newPkg);
  }
  await removeIfEmpty(path.join(srcJava, 'com', 'example'));
  await removeIfEmpty(path.join(srcJava, 'com'));

  // 5. Rename the mixin config.
  const oldMixins = path.join(targetDir, 'src', 'main', 'resources', 'examplemod.mixins.json');
  if (await pathExists(oldMixins)) {
    await fs.rename(oldMixins, path.join(path.dirname(oldMixins), `${names.modId}.mixins.json`));
  }

  // 6. src/generated is regenerated by runData; drop the template's committed copy.
  const generated = path.join(targetDir, 'src', 'generated');
  if (await pathExists(generated)) await fs.rm(generated, { recursive: true, force: true });

  // 7. Keep the launcher executable.
  const gradlew = path.join(targetDir, 'gradlew');
  if (await pathExists(gradlew)) await fs.chmod(gradlew, 0o755);

  return names;
}
