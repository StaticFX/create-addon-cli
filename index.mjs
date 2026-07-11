#!/usr/bin/env node
// create-addon-cli — scaffold a Create (Minecraft) mod addon by cloning the
// template and rebranding it to your own mod.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { color, intro, outro, note, cancel, text, confirm, spinner } from './lib/ui.mjs';
import { deriveNames, applyRename, slugify } from './lib/transform.mjs';
import { fetchTemplate, hasGit, DEFAULT_TEMPLATE } from './lib/clone.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (a === '-y' || a === '--yes') opts.yes = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--git') opts.git = true;
    else if (a === '--no-git') opts.git = false;
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      opts[k] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true);
    } else opts._.push(a);
  }
  return opts;
}

const HELP = `
  ${color.bold('create-addon-cli')} — scaffold a Create mod addon

  ${color.gray('Usage')}
    npm create addon-cli@latest ${color.gray('[dir] [options]')}
    npx create-addon-cli ${color.gray('[dir] [options]')}

  ${color.gray('Options')}
    --name <name>        Mod display name (e.g. "Sick Mod")
    --id <id>            Mod id             ${color.gray('(default: name, lowercased)')}
    --group <group>      Base package       ${color.gray('(default: com.example.<id>)')}
    --author <author>    Mod author
    --template <spec>    Template to clone  ${color.gray(`(default: ${DEFAULT_TEMPLATE}; owner/repo[#ref] or URL)`)}
    --no-git             Skip git init
    -y, --yes            Accept defaults, no prompts
    --force              Scaffold into a non-empty directory
    -h, --help           Show this help
`;

async function isEmptyDir(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.length === 0;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return void console.log(HELP);
  if (opts.version) {
    const pkg = JSON.parse(await fs.readFile(path.join(here, 'package.json'), 'utf8'));
    return void console.log(pkg.version);
  }

  if (!(await hasGit())) {
    console.error(color.red('\nThis tool needs `git` on your PATH to fetch the template. Install git and retry.\n'));
    process.exit(1);
  }

  const interactive = stdout.isTTY && !opts.yes;
  const rl = interactive ? readline.createInterface({ input: stdin, output: stdout }) : null;
  rl?.on('SIGINT', () => cancel());

  intro(`${color.magenta('create')} a Create addon`);

  try {
    // Mod name — the one thing we truly need.
    let name = opts.name || opts._[0];
    if (!name && interactive) {
      name = await text(rl, {
        message: 'What is your mod named?',
        placeholder: 'Sick Mod',
        validate: (v) => (v ? undefined : 'Please enter a name.'),
      });
    }
    if (!name) {
      cancel('A mod name is required (pass --name or run without --yes).');
    }

    // Target directory.
    const defaultDir = opts._[0] && !opts.name ? opts._[0] : slugify(name);
    let dir = opts.dir || (opts._[0] && opts.name ? opts._[0] : defaultDir);
    if (!opts.dir && !opts._[0] && interactive) {
      dir = await text(rl, { message: 'Project directory?', initial: defaultDir });
    }
    const targetDir = path.resolve(process.cwd(), dir);

    // Remaining details.
    let id = opts.id;
    if (!id && interactive) {
      id = await text(rl, {
        message: 'Mod id?',
        initial: slugify(name).replace(/-/g, ''),
        validate: (v) => (/^[a-z][a-z0-9_]*$/.test(v) ? undefined : 'Lowercase letters, digits, underscore; must start with a letter.'),
      });
    }
    const previewId = id || slugify(name).replace(/-/g, '');

    let group = opts.group;
    if (!group && interactive) {
      group = await text(rl, { message: 'Base package (group)?', initial: `com.example.${previewId}` });
    }

    let author = opts.author;
    if (!author && interactive) {
      author = await text(rl, { message: 'Author?', initial: 'YourName' });
    }

    const doGit = typeof opts.git === 'boolean'
      ? opts.git
      : interactive
        ? await confirm(rl, { message: 'Initialize a git repository?', initial: true })
        : true;

    rl?.close();

    // Guard against clobbering an existing project.
    if (!(await isEmptyDir(targetDir)) && !opts.force) {
      cancel(`${color.bold(dir)} already exists and is not empty. Use --force to scaffold anyway.`);
    }

    const names = deriveNames({ name, id, group });
    const templateSpec = typeof opts.template === 'string' ? opts.template : DEFAULT_TEMPLATE;

    const spinDl = spinner();
    spinDl.start(`Cloning template ${color.gray(templateSpec)}`);
    const src = await fetchTemplate({ spec: templateSpec, targetDir });
    spinDl.stop(`Fetched template ${color.gray(`(${src.ref})`)}`);

    const spin = spinner();
    spin.start(`Configuring ${color.bold(names.display)}`);
    await applyRename({ targetDir, names });
    // Finish gradle.properties fields the transform doesn't touch.
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
    outro(`${color.green('Done.')} Happy modding! ${color.gray('(id: ' + names.modId + ', pkg: ' + names.group + ')')}`);
  } catch (err) {
    rl?.close();
    cancel(err.message || String(err));
  }
}

async function initGit(dir) {
  const { spawn } = await import('node:child_process');
  const run = (args) => new Promise((resolve) => {
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

main();
