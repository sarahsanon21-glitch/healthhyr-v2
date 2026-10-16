// Starts the local Supabase and hides the keys it prints.
//
// `supabase start` ends by printing the local keys (anon, service role, JWT secret). They are
// local-only demo values, but they should never end up in a log, a screenshot or a chat. This runs
// the real command and masks key-looking values in everything it prints. To see the keys on
// purpose, in a private terminal, run `npm run db:status`.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const patterns = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT-style keys
  /sb_(publishable|secret)_[A-Za-z0-9_-]+/g, // new-style keys
  /("JWT_SECRET"\s*:\s*")[^"]+(")/g, // the JWT secret
  /(JWT_SECRET[=:]\s*)\S+/g,
];

function mask(text) {
  return text
    .replace(patterns[0], '[key hidden]')
    .replace(patterns[1], 'sb_$1_[hidden]')
    .replace(patterns[2], '$1[hidden]$2')
    .replace(patterns[3], '$1[hidden]');
}

// One command string (not an argument list) so the shell option does not trigger Node's warning.
const command = ['npx supabase start', ...process.argv.slice(2)].join(' ');
const child = spawn(command, { cwd: root, shell: true });
child.stdout.on('data', (chunk) => process.stdout.write(mask(chunk.toString())));
child.stderr.on('data', (chunk) => process.stderr.write(mask(chunk.toString())));
child.on('close', (code) => {
  console.log('Keys are hidden here. In a private terminal, `npm run db:status` shows them.');
  process.exit(code ?? 1);
});
