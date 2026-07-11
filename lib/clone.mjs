// Fetches the template by shallow-cloning it with git (degit-style: no history is
// kept). Zero runtime dependencies — just the user's `git`.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const DEFAULT_TEMPLATE = 'StaticFX/create-addon-template';

/** Turn a template spec into a clone URL + optional ref. */
export function parseTemplate(spec) {
  let s = spec;
  let ref;
  const hash = s.indexOf('#');
  if (hash !== -1) {
    ref = s.slice(hash + 1);
    s = s.slice(0, hash);
  }
  let url;
  if (/^(https?:|git@|ssh:|file:)/.test(s) || s.startsWith('/') || s.startsWith('.')) {
    url = s; // full URL or local path
  } else if (/^[\w.-]+\/[\w.-]+$/.test(s)) {
    url = `https://github.com/${s}.git`; // owner/repo shorthand
  } else {
    url = s;
  }
  return { url, ref };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore', ...opts });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/** True if `git` is on PATH. */
export async function hasGit() {
  try {
    await run('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shallow-clone `spec` into a temp dir, strip its .git, and copy the files into
 * targetDir. Returns { url, ref } for the caller's summary.
 */
export async function fetchTemplate({ spec, targetDir }) {
  const { url, ref } = parseTemplate(spec);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'create-addon-'));
  const repoDir = path.join(tmp, 'repo');
  try {
    const args = ['clone', '--depth', '1'];
    if (ref) args.push('--branch', ref);
    args.push(url, repoDir);
    try {
      await run('git', args);
    } catch {
      throw new Error(`Failed to clone template "${spec}". Check the name/network, and that the repo is public.`);
    }
    await fs.rm(path.join(repoDir, '.git'), { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    await fs.cp(repoDir, targetDir, { recursive: true });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  return { url, ref: ref || 'default branch' };
}
