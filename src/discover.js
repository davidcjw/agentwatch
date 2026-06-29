import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { readdirSync, statSync, existsSync } from 'node:fs';

/**
 * Default transcript root: ~/.claude/projects. Each immediate subdirectory is
 * one project; each *.jsonl inside it is one session transcript.
 * @param {string} [home] override home dir (for testing)
 */
export function defaultRoot(home) {
  return join(home || homedir(), '.claude', 'projects');
}

/**
 * Stat every transcript file under a root, cheaply. We never read file contents
 * here — just the directory tree and mtime/size — so this is safe to call on
 * every tick even with hundreds of transcripts.
 *
 * @param {string} root the projects directory
 * @returns {Array<{ file: string, projectDir: string, mtimeMs: number, size: number }>}
 */
export function statAll(root) {
  if (!existsSync(root)) {
    throw new Error(`transcript directory not found: ${root}`);
  }
  const out = [];
  walk(root, '(root)', out, true);
  return out;
}

function walk(dir, projectDir, out, isRoot) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      // At the root, each immediate child dir names a project.
      walk(full, isRoot ? ent.name : projectDir, out, false);
    } else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      out.push({ file: full, projectDir, mtimeMs: st.mtimeMs, size: st.size });
    }
  }
}

/**
 * Best-effort human label for a project, given the encoded directory name and
 * the `cwd` seen in the transcript. cwd is exact when present; the encoded dir
 * name is lossy (it replaced every "/" with "-") so we only basename it.
 * @param {string} projectDir encoded directory name
 * @param {string|null} cwd working directory captured from a record
 */
export function projectLabel(projectDir, cwd) {
  if (cwd) return basename(cwd) || cwd;
  if (!projectDir || projectDir === '(root)') return projectDir || '(root)';
  if (!projectDir.startsWith('-')) return projectDir;
  const parts = projectDir.split('-').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : projectDir;
}
