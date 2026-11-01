import type { Hud, Mode } from './rules.js';

/**
 * THROWAWAY PROTOTYPE CODE — the HUD.
 *
 * The UI is CHALK ON SLATE: the same material as the game's signature mark,
 * turned into a panel. That is not decoration — the chalk line is the thing
 * the whole game is about, and putting the interface in the same material
 * ties the phone to the world it is showing. It also solves the contrast
 * problem the old HUD had: raw browser buttons over sunlit concrete were
 * grey-on-grey and fought the game for attention.
 *
 * The rule the interface has to obey: **the game is the picture, the panel is
 * a label on it.** So the panel is compact, it sits in a corner, it never
 * covers the Track, and the one thing that must always be readable — which
 * Car is aimed at, and how many Pushes are left — is the biggest thing in it.
 *
 * Everything below is CSS in `style.css`; this file only builds the DOM and
 * owns the behaviour.
 */

export function createHud(
  onNextTurn: () => void,
  onReset: () => void,
  onSetMode: (mode: Mode) => void,
  /** Recentre the camera. It belongs on screen: once you have moved the view it
   *  is part of playing, not a setting behind a menu. */
  onRecentre: () => void,
): Hud {
  const root = document.createElement('div');
  root.className = 'jdt-hud';

  // --- The slate: who is aimed at, and what state the Turn is in ---
  const panel = document.createElement('div');
  panel.className = 'jdt-panel';

  const head = document.createElement('div');
  head.className = 'jdt-row jdt-head';

  // Which Car is being aimed at right now — with several Cars on the Track,
  // whose Turn it is has to be readable, not remembered.
  const who = document.createElement('div');
  who.className = 'jdt-who';
  const swatch = document.createElement('span');
  swatch.className = 'jdt-swatch';
  const whoText = document.createElement('span');
  whoText.className = 'jdt-who-name';
  who.append(swatch, whoText);

  // The three Pushes, drawn as three chalk pips. The rule IS three Pushes
  // per Turn, so the interface shows three marks rather than a number that
  // has to be counted.
  const pips = document.createElement('div');
  pips.className = 'jdt-pips';
  const pipEls = [0, 1, 2].map(() => {
    const p = document.createElement('span');
    p.className = 'jdt-pip';
    pips.appendChild(p);
    return p;
  });

  // Telemetry: quiet, monospaced, and clearly secondary. It lives in the
  // head row so the panel keeps its rows down — on a phone the panel was
  // eating a fifth of the screen.
  const lap = document.createElement('span');
  lap.className = 'jdt-lap';
  lap.textContent = '—';

  head.append(who, lap, pips);
  panel.appendChild(head);

  // Mode: a two-way chalk toggle, not two browser buttons.
  const modes = document.createElement('div');
  modes.className = 'jdt-seg';
  const sandboxBtn = document.createElement('button');
  sandboxBtn.type = 'button';
  sandboxBtn.textContent = 'Sandbox';
  const lapBtn = document.createElement('button');
  lapBtn.type = 'button';
  lapBtn.textContent = 'Lap';
  modes.append(sandboxBtn, lapBtn);
  panel.appendChild(modes);

  // Ticket 16: the Surface under EACH wheel. The only way to see "no
  // transition code" happening rather than believe it — a Car straddling a
  // boundary shows two different names at once. It is a debug readout, so it
  // stays quiet: small, dim, and out of the way of the game.
  const wheels = document.createElement('div');
  wheels.className = 'jdt-wheels';
  // Order matches Car's wheel colliders: rear-left, rear-right, front-left,
  // front-right (local X = forward, local Z = the Car's right).
  const wheelCells = ['RL', 'RR', 'FL', 'FR'].map((tag) => {
    const cell = document.createElement('span');
    cell.className = 'jdt-wheel';
    cell.dataset.tag = tag;
    const dot = document.createElement('i');
    const label = document.createElement('span');
    cell.append(dot, label);
    wheels.appendChild(cell);
    return { cell, dot, label };
  });
  panel.appendChild(wheels);
  root.appendChild(panel);

  // --- Actions: bottom right, ghost buttons ---
  const actions = document.createElement('div');
  actions.className = 'jdt-actions';
  const nextTurnBtn = document.createElement('button');
  nextTurnBtn.type = 'button';
  nextTurnBtn.textContent = 'Next Turn';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset';

  /**
   * The camera button.
   *
   * Following is a MODE, and any two-finger gesture ends it (ticket 19) — so
   * the player has to be able to tell, at a glance, whether the camera is
   * attached, and to get it back without hunting through a menu. The button
   * says which of the two states it is in:
   *
   *   attached     → "Camera", with a filled mark. Tapping it snaps the
   *                  view back over the Car (zoom, turn and tilt included).
   *   detached     → "Follow Car", in the accent colour. It is the one
   *                  thing on screen that wants a tap.
   */
  const recentreBtn = document.createElement('button');
  recentreBtn.type = 'button';
  recentreBtn.className = 'jdt-camera';
  const camMark = document.createElement('i');
  camMark.className = 'jdt-cam-mark';
  const camLabel = document.createElement('span');
  camLabel.textContent = 'Camera';
  recentreBtn.append(camMark, camLabel);
  recentreBtn.title = 'Attach the camera to the Car again';
  recentreBtn.setAttribute('aria-label', 'Attach the camera to the Car');
  for (const b of [recentreBtn, nextTurnBtn, resetBtn]) actions.appendChild(b);
  root.appendChild(actions);

  // --- The message line: a chalk toast, centred over the world ---
  const msg = document.createElement('div');
  msg.className = 'jdt-msg';
  root.appendChild(msg);

  // --- The tuning panel toggle ---
  // The lil-gui tuning panel covers a whole phone screen. It is a developer
  // tool, not part of the game, so it gets a small way in and out.
  const tune = document.createElement('button');
  tune.type = 'button';
  tune.className = 'jdt-tune';
  tune.textContent = '⚙';
  tune.title = 'Tuning panel';
  tune.setAttribute('aria-label', 'Toggle the tuning panel');
  root.appendChild(tune);

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
  recentreBtn.addEventListener('click', () => onRecentre());
  tune.addEventListener('click', () => {
    const gui = document.querySelector('.lil-gui') as HTMLElement | null;
    if (!gui) return;
    const hidden = gui.style.display === 'none';
    gui.style.display = hidden ? '' : 'none';
    tune.classList.toggle('is-off', !hidden);
  });

  const hud: Hud = {
    flash(text: string): void {
      msg.textContent = text;
      msg.classList.add('is-on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        msg.classList.remove('is-on');
      }, 2600);
    },
    setPushes(text: string): void {
      // "∞" in Sandbox; a count in Lap Challenge. Either way the pips show
      // what is left.
      const n = Number(text);
      const infinite = !Number.isFinite(n);
      pipEls.forEach((p, i) => {
        p.classList.toggle('is-spent', !infinite && i >= n);
        p.classList.toggle('is-inf', infinite);
      });
      pips.title = infinite ? 'Unlimited Pushes' : `${n} Pushes left`;
    },
    setLapTime(t: number | null): void {
      lap.textContent = t == null ? '—' : `${(t / 1000).toFixed(2)}s`;
    },
    setCarLabel(name: string, color: number): void {
      whoText.textContent = name;
      swatch.style.background = `#${color.toString(16).padStart(6, '0')}`;
    },
    /**
     * The last strike: how long the finger was on the Car, and whether that
     * overran the legal window. Shown, never acted on — what riding COSTS is
     * a v1 rules question, and inventing a penalty here would be inventing
     * a rule.
     */
    setStrike(text: string | null, illegal: boolean): void {
      if (!text) {
        msg.classList.remove('is-illegal');
        return;
      }
      msg.textContent = text;
      msg.classList.add('is-on');
      msg.classList.toggle('is-illegal', illegal);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        msg.classList.remove('is-on');
        msg.classList.remove('is-illegal');
      }, 2200);
    },
    setWheelSurfaces(reads: { label: string; color: number }[]): void {
      wheelCells.forEach(({ cell, dot, label }, i) => {
        const read = reads[i];
        label.textContent = read ? read.label : 'air';
        dot.style.background = read ? `#${read.color.toString(16).padStart(6, '0')}` : 'transparent';
        cell.classList.toggle('is-air', !read);
      });
    },
    setCameraFollowing(following: boolean): void {
      recentreBtn.classList.toggle('is-detached', !following);
      camLabel.textContent = following ? 'Camera' : 'Follow Car';
      recentreBtn.title = following
        ? 'Snap the view back over the Car'
        : 'Attach the camera to the Car again';
      recentreBtn.setAttribute(
        'aria-label',
        following ? 'Snap the view back over the Car' : 'Attach the camera to the Car',
      );
    },
    setMode(m: Mode): void {
      sandboxBtn.classList.toggle('is-on', m === 'sandbox');
      lapBtn.classList.toggle('is-on', m === 'lap');
      nextTurnBtn.style.display = m === 'lap' ? '' : 'none';
      hud.setPushes(m === 'sandbox' ? '∞' : '3');
      hud.flash(m === 'sandbox' ? 'Sandbox — unlimited Pushes' : 'Lap Challenge — 3 Pushes per Turn');
    },
  };

  hud.setMode('sandbox');
  return hud;
}
