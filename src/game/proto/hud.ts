import type { Hud, Mode } from './rules.js';

/**
 * THROWAWAY PROTOTYPE CODE — minimal DOM HUD: mode buttons, push counter,
 * lap time, message line, Next Turn / Reset buttons.
 */

export function createHud(
  onNextTurn: () => void,
  onReset: () => void,
  onSetMode: (mode: Mode) => void,
): Hud {
  const root = document.createElement('div');
  root.style.cssText = `
    position: fixed; top: 12px; left: 12px; z-index: 10;
    font: 13px/1.4 system-ui, sans-serif; color: #fff;
    display: flex; flex-direction: column; gap: 6px;
    text-shadow: 0 1px 2px rgba(0,0,0,.7); user-select: none;`;

  const btnStyle = `
    pointer-events: auto; padding: 6px 10px; border: 1px solid rgba(255,255,255,.5);
    border-radius: 6px; background: rgba(0,0,0,.45); color: #fff;
    font: inherit; cursor: pointer;`;
  const activeStyle = 'background: rgba(255,255,255,.85); color: #222; text-shadow: none;';

  // Which Car is being aimed at right now — with several Cars on the Track,
  // whose Turn it is has to be readable, not remembered.
  const who = document.createElement('div');
  who.style.cssText =
    'display: flex; align-items: center; gap: 6px; font-weight: 600;';
  const swatch = document.createElement('span');
  swatch.style.cssText =
    'width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,.7);';
  const whoText = document.createElement('span');
  who.append(swatch, whoText);
  root.appendChild(who);

  const modes = document.createElement('div');
  modes.style.cssText = 'display: flex; gap: 6px;';
  const sandboxBtn = document.createElement('button');
  const lapBtn = document.createElement('button');
  for (const [btn, text] of [
    [sandboxBtn, 'Sandbox'],
    [lapBtn, 'Lap Challenge'],
  ] as const) {
    btn.textContent = text;
    btn.style.cssText = btnStyle;
    modes.appendChild(btn);
  }
  root.appendChild(modes);

  const info = document.createElement('div');
  info.style.cssText = 'display: flex; gap: 14px; font-variant-numeric: tabular-nums;';
  const pushes = document.createElement('span');
  pushes.textContent = 'Pushes: ∞';
  const lap = document.createElement('span');
  lap.textContent = 'Lap: —';
  info.append(pushes, lap);
  root.appendChild(info);

  // Ticket 16: the Surface under EACH wheel. The only way to see "no
  // transition code" happening rather than believe it — a Car straddling a
  // boundary shows two different names at once.
  const wheels = document.createElement('div');
  wheels.style.cssText =
    'display: flex; gap: 5px; font-size: 11px; font-weight: 600; min-height: 14px;';
  root.appendChild(wheels);
  // Order matches Car's wheel colliders: rear-left, rear-right, front-left,
  // front-right (local X = forward, local Z = the Car's right).
  const wheelCells = ['RL', 'RR', 'FL', 'FR'].map((tag) => {
    const cell = document.createElement('span');
    cell.dataset.tag = tag;
    cell.style.cssText =
      'padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.45);'
      + ' border: 1px solid rgba(255,255,255,.35); text-shadow: none;';
    cell.textContent = `${tag}: —`;
    wheels.appendChild(cell);
    return cell;
  });

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 6px;';
  const nextTurnBtn = document.createElement('button');
  nextTurnBtn.textContent = 'Next Turn';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset Cars';
  for (const b of [nextTurnBtn, resetBtn]) {
    b.style.cssText = btnStyle;
    actions.appendChild(b);
  }
  root.appendChild(actions);

  const msg = document.createElement('div');
  msg.style.cssText = 'min-height: 18px; font-weight: 600;';
  root.appendChild(msg);

  document.getElementById('app')!.appendChild(root);

  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  sandboxBtn.addEventListener('click', () => {
    hud.setMode('sandbox');
    onSetMode('sandbox');
  });
  lapBtn.addEventListener('click', () => {
    hud.setMode('lap');
    onSetMode('lap');
  });
  nextTurnBtn.addEventListener('click', () => onNextTurn());
  resetBtn.addEventListener('click', () => onReset());

  const hud: Hud = {
    flash(text: string): void {
      msg.textContent = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (msg.textContent = ''), 2600);
    },
    setPushes(text: string): void {
      pushes.textContent = `Pushes: ${text}`;
    },
    setLapTime(t: number | null): void {
      lap.textContent = t == null ? 'Lap: —' : `Lap: ${(t / 1000).toFixed(2)}s`;
    },
    setCarLabel(name: string, color: number): void {
      whoText.textContent = name;
      swatch.style.background = `#${color.toString(16).padStart(6, '0')}`;
    },
    setWheelSurfaces(reads: { label: string; color: number }[]): void {
      wheelCells.forEach((cell, i) => {
        const read = reads[i];
        cell.textContent = `${wheelCells[i].dataset.tag} ${read ? read.label : 'air'}`;
        cell.style.color = read ? `#${read.color.toString(16).padStart(6, '0')}` : '#ffffff';
        cell.style.opacity = read ? '1' : '0.55';
      });
    },
    setMode(m: Mode): void {
      sandboxBtn.style.cssText = btnStyle + (m === 'sandbox' ? activeStyle : '');
      lapBtn.style.cssText = btnStyle + (m === 'lap' ? activeStyle : '');
      nextTurnBtn.style.display = m === 'lap' ? '' : 'none';
      hud.setPushes(m === 'sandbox' ? '∞' : '3');
      hud.flash(m === 'sandbox' ? 'Sandbox — unlimited Pushes' : 'Lap Challenge — 3 Pushes per Turn');
    },
  };

  hud.setMode('sandbox');
  return hud;
}
