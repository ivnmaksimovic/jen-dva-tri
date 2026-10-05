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

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 6px;';
  const nextTurnBtn = document.createElement('button');
  nextTurnBtn.textContent = 'Next Turn';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset Car';
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
