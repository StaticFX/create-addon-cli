// create-addon-cli — scaffold a Create (Minecraft) mod addon by cloning the
// template and rebranding it to your own mod. (The shebang is added by tsup.)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';

import { Command, Option } from 'commander';

import { color, intro, outro, note, cancel, text, confirm, spinner } from './lib/ui.js';
import { deriveNames, applyRename, slugify } from './lib/transform.js';
import { fetchTemplate, hasGit, DEFAULT_TEMPLATE } from './lib/clone.js';

interface CliOptions {
  name?: string;
  id?: string;
  group?: string;
  author?: string;
  template: string;
  git: boolean;
  yes?: boolean;
  force?: boolean;
}

const VERSION = '0.1.0';

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length === 0;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw e;
  }
}

async function initGit(dir: string): Promise<boolean> {
  const run = (args: string[]): Promise<boolean> =>
    new Promise((resolve) => {
      const p = spawn('git', args, { cwd: dir, stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
    });
  if (!(await run(['init', '-b', 'main']))) return false;
  await run(['add', '-A']);
  // A commit needs a configured identity; if it can't, don't leave a half-repo.
  if (!(await run(['commit', '-m', 'Initial commit from create-addon-cli']))) {
    await fs.rm(path.join(dir, '.git'), { recursive: true, force: true });
    return false;
  }
  return true;
}

async function run(dirArg: string | undefined, opts: CliOptions, gitFromCli: boolean): Promise<void> {
  if (!(await hasGit())) {
    console.error(color.red('\nThis tool needs `git` on your PATH to fetch the template. Install git and retry.\n'));
    process.exit(1);
  }

  const interactive = Boolean(stdout.isTTY) && !opts.yes;
  const rl = interactive ? readline.createInterface({ input: stdin, output: stdout }) : null;
  rl?.on('SIGINT', () => cancel());

  intro(`${color.magenta('create')} a Create addon`);

  try {
    // Mod name — the one thing we truly need.
    let name = opts.name;
    if (!name && interactive) {
      name = await text(rl!, {
        message: 'What is your mod named?',
        placeholder: 'Sick Mod',
        validate: (v) => (v ? undefined : 'Please enter a name.'),
      });
    }
    // Non-interactive with a directory but no name: derive a display name from it.
    if (!name && dirArg) name = dirArg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!name) cancel('A mod name is required (pass --name or run without --yes).');

    // Target directory.
    let dir = dirArg ?? slugify(name!);
    if (!dirArg && interactive) {
      dir = await text(rl!, { message: 'Project directory?', initial: slugify(name!) });
    }
    const targetDir = path.resolve(process.cwd(), dir);

    // Remaining details.
    let id = opts.id;
    if (!id && interactive) {
      id = await text(rl!, {
        message: 'Mod id?',
        initial: slugify(name!).replace(/-/g, ''),
        validate: (v) => (/^[a-z][a-z0-9_]*$/.test(v) ? undefined : 'Lowercase letters, digits, underscore; must start with a letter.'),
      });
    }
    const previewId = id || slugify(name!).replace(/-/g, '');

    let group = opts.group;
    if (!group && interactive) {
      group = await text(rl!, { message: 'Base package (group)?', initial: `com.example.${previewId}` });
    }

    let author = opts.author;
    if (!author && interactive) {
      author = await text(rl!, { message: 'Author?', initial: 'YourName' });
    }

    // Only prompt about git when the user didn't pass --git/--no-git.
    const doGit = gitFromCli ? opts.git : interactive ? await confirm(rl!, { message: 'Initialize a git repository?', initial: true }) : true;

    rl?.close();

    if (!(await isEmptyDir(targetDir)) && !opts.force) {
      cancel(`${color.bold(dir)} already exists and is not empty. Use --force to scaffold anyway.`);
    }

    const names = deriveNames({ name: name!, id, group });

    const spinDl = spinner();
    spinDl.start(`Cloning template ${color.gray(opts.template)}`);
    const src = await fetchTemplate({ spec: opts.template, targetDir });
    spinDl.stop(`Fetched template ${color.gray(`(${src.ref})`)}`);

    const spin = spinner();
    spin.start(`Configuring ${color.bold(names.display)}`);
    await applyRename({ targetDir, names });
    if (author) {
      const props = path.join(targetDir, 'gradle.properties');
      let txt = await fs.readFile(props, 'utf8');
      txt = txt.replace(/^mod_authors=.*$/m, `mod_authors=${author}`);
      await fs.writeFile(props, txt);
    }
    spin.stop(`Created ${color.bold(names.display)} in ${color.cyan(dir)}`);

    if (doGit) {
      const spinGit = spinner();
      spinGit.start('Initializing git repository');
      const ok = await initGit(targetDir);
      spinGit.stop(ok ? 'Git repository initialized' : color.yellow('Skipped git init (configure a git identity, then run git init)'));
    }

    note('Next steps', [
      color.cyan(`cd ${dir}`),
      `${color.gray('# generate assets & recipes')}  ./gradlew runData`,
      `${color.gray('# launch the game')}            ./gradlew runClient`,
    ]);
    outro(`${color.green('Done.')} Happy modding! ${color.gray(`(id: ${names.modId}, pkg: ${names.group})`)}`);
  } catch (err) {
    rl?.close();
    cancel(err instanceof Error ? err.message : String(err));
  }
}

const program = new Command();
program
  .name('create-addon-cli')
  .description('Scaffold a Create (Minecraft) mod addon by cloning the template and rebranding it.')
  .version(VERSION, '-v, --version')
  .argument('[dir]', 'target directory for the new project')
  .option('--name <name>', 'mod display name (e.g. "Sick Mod")')
  .option('--id <id>', 'mod id (default: name, lowercased)')
  .option('--group <group>', 'base package (default: com.example.<id>)')
  .option('--author <author>', 'mod author')
  .addOption(new Option('--template <spec>', 'template to clone (owner/repo[#ref] or URL)').default(DEFAULT_TEMPLATE))
  .option('--no-git', 'skip git init')
  .option('-y, --yes', 'accept defaults, no prompts')
  .option('--force', 'scaffold into a non-empty directory')
  .action(async (dir: string | undefined, opts: CliOptions) => {
    // Distinguish "user passed --git/--no-git" from the default, so we can still
    // prompt about git in interactive mode.
    const gitFromCli = program.getOptionValueSource('git') === 'cli';
    await run(dir, opts, gitFromCli);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
