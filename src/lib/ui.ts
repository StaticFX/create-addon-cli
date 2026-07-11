// @clack-style terminal UI built on plain ANSI + readline (no prompt library).

import type { Interface } from 'node:readline/promises';

type Colorize = (s: string | number) => string;

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number): Colorize => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const color: Record<'dim' | 'bold' | 'red' | 'green' | 'yellow' | 'cyan' | 'gray' | 'magenta', Colorize> = {
  dim: paint(2),
  bold: paint(1),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
  gray: paint(90),
  magenta: paint(35),
};

const S_BAR = color.gray('│');
const S_STEP = color.green('◇');
const S_ERR = color.red('▲');

export function intro(title: string): void {
  console.log('');
  console.log(`${color.gray('┌')}  ${color.bold(title)}`);
  console.log(S_BAR);
}

export function outro(message: string): void {
  console.log(S_BAR);
  console.log(`${color.gray('└')}  ${message}`);
  console.log('');
}

export function note(title: string, lines: string[]): void {
  console.log(S_BAR);
  console.log(`${color.green('◆')}  ${color.bold(title)}`);
  for (const line of lines) console.log(`${S_BAR}  ${line}`);
}

export function cancel(message = 'Cancelled.'): never {
  console.log(S_BAR);
  console.log(`${color.red('■')}  ${message}`);
  console.log('');
  process.exit(1);
}

function askLine(rl: Interface, message: string): Promise<string> {
  console.log(S_BAR);
  console.log(`${S_STEP}  ${message}`);
  return rl.question(`${S_BAR}  ${color.cyan('›')} `);
}

export interface TextOptions {
  message: string;
  initial?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}

export async function text(rl: Interface, { message, initial = '', placeholder, validate }: TextOptions): Promise<string> {
  const hint = placeholder ?? initial;
  const label = hint ? `${message} ${color.gray(`(${hint})`)}` : message;
  for (;;) {
    const raw = (await askLine(rl, label)).trim();
    const value = raw || initial;
    const err = validate ? validate(value) : undefined;
    if (err) {
      console.log(`${S_BAR}  ${S_ERR} ${color.yellow(err)}`);
      continue;
    }
    return value;
  }
}

export async function confirm(rl: Interface, { message, initial = true }: { message: string; initial?: boolean }): Promise<boolean> {
  const hint = initial ? 'Y/n' : 'y/N';
  const raw = (await askLine(rl, `${message} ${color.gray(`(${hint})`)}`)).trim().toLowerCase();
  if (!raw) return initial;
  return raw[0] === 'y';
}

export interface Spinner {
  start(message: string): void;
  stop(message?: string): void;
}

export function spinner(): Spinner {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let text = '';
  return {
    start(message: string): void {
      text = message;
      if (!process.stdout.isTTY) {
        console.log(`${S_BAR}  ${color.magenta('•')} ${text}`);
        return;
      }
      timer = setInterval(() => {
        process.stdout.write(`\r${S_BAR}  ${color.magenta(frames[(i = ++i % frames.length)])} ${text}`);
      }, 80);
    },
    stop(message: string = text): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
        process.stdout.write('\r\x1b[K');
      }
      console.log(`${S_BAR}  ${color.green('✔')} ${message}`);
    },
  };
}
