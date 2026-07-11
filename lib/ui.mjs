// Zero-dependency, @clack-style terminal UI. No prompt library — just ANSI + readline
// so the CLI installs with nothing to resolve under npx.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const color = {
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

export function intro(title) {
  console.log('');
  console.log(`${color.gray('┌')}  ${color.bold(title)}`);
  console.log(S_BAR);
}

export function outro(message) {
  console.log(S_BAR);
  console.log(`${color.gray('└')}  ${message}`);
  console.log('');
}

export function note(title, lines) {
  console.log(S_BAR);
  console.log(`${color.green('◆')}  ${color.bold(title)}`);
  for (const line of lines) console.log(`${S_BAR}  ${line}`);
}

export function cancel(message = 'Cancelled.') {
  console.log(S_BAR);
  console.log(`${color.red('■')}  ${message}`);
  console.log('');
  process.exit(1);
}

function askLine(rl, message) {
  console.log(S_BAR);
  console.log(`${S_STEP}  ${message}`);
  return rl.question(`${S_BAR}  ${color.cyan('›')} `);
}

export async function text(rl, { message, initial = '', placeholder, validate } = {}) {
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

export async function confirm(rl, { message, initial = true } = {}) {
  const hint = initial ? 'Y/n' : 'y/N';
  const raw = (await askLine(rl, `${message} ${color.gray(`(${hint})`)}`)).trim().toLowerCase();
  if (!raw) return initial;
  return raw[0] === 'y';
}

export function spinner() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let timer = null;
  let text = '';
  return {
    start(message) {
      text = message;
      if (!process.stdout.isTTY) {
        console.log(`${S_BAR}  ${color.magenta('•')} ${text}`);
        return;
      }
      timer = setInterval(() => {
        process.stdout.write(`\r${S_BAR}  ${color.magenta(frames[(i = ++i % frames.length)])} ${text}`);
      }, 80);
    },
    stop(message = text) {
      if (timer) {
        clearInterval(timer);
        timer = null;
        process.stdout.write('\r\x1b[K');
      }
      console.log(`${S_BAR}  ${color.green('✔')} ${message}`);
    },
  };
}
