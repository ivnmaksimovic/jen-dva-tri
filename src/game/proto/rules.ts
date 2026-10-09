import * as THREE from 'three';
import type { Car } from './car.js';
import type { Track } from './track.js';

/**
 * THROWAWAY PROTOTYPE CODE — the game rules engine.
 * Out of Track (3+ wheels fully beyond a Boundary), Rock (one wheel touches),
 * Lake (2 checkpoints back), Bridge (stop on it → back to the Start),
 * finish-line crossing with lap timing, and 3-Push Turns in Lap Challenge.
 *
 * Several Cars live together now (ticket 12), and a Turn belongs to the Car's
 * owner — one owner, one Car, one Turn. So each Car carries its OWN rules
 * state: its own Pushes left, its own lap timer, its own progress along the
 * Track. The HUD reads the aimed Car's state; the other Cars keep being ruled
 * whether or not you are looking at them (a Car you shoved sideways still
 * comes out of the Track on its own).
 */

export type Mode = 'sandbox' | 'lap';

export interface Hud {
  flash(msg: string): void;
  setPushes(text: string): void;
  setLapTime(t: number | null): void;
  setMode(mode: Mode): void;
  /** Which Car is being aimed at right now (name + colour swatch). */
  setCarLabel(name: string, color: number): void;
}

const RESET_BACK = 0.3; // place the Car this far behind a checkpoint line
export const START_S = 0.35; // just past the start line

/** Per-Car rules state: a Turn is the owner's, so nothing here is shared. */
interface CarState {
  pushesLeft: number;
  lapActive: boolean;
  lapStart: number;
  prevS: number;
}

export class Rules {
  mode: Mode = 'sandbox';
  /** False while the Test field is active — no rules, unlimited Pushes. */
  enabled = true;
  private readonly states: (CarState | undefined)[] = [];

  constructor(
    private readonly track: Track,
    private readonly getCars: () => Car[],
    private readonly getActive: () => number,
    private readonly hud: Hud,
  ) {}

  private state(i: number): CarState {
    let s = this.states[i];
    if (!s) {
      s = { pushesLeft: 3, lapActive: false, lapStart: 0, prevS: START_S };
      this.states[i] = s;
    }
    return s;
  }

  /** Lap time of the aimed Car, or null. */
  get lapTime(): number | null {
    const s = this.state(this.getActive());
    return s.lapActive ? performance.now() - s.lapStart : null;
  }

  pushesLeft(i: number): number {
    return this.state(i).pushesLeft;
  }

  canPush(): boolean {
    if (!this.enabled) return true;
    return this.mode === 'sandbox' || this.state(this.getActive()).pushesLeft > 0;
  }

  pushUsed(): void {
    if (!this.enabled) return;
    const i = this.getActive();
    const s = this.state(i);
    if (this.mode === 'lap') {
      s.pushesLeft = Math.max(0, s.pushesLeft - 1);
      if (s.pushesLeft === 0) {
        this.hud.flash(`Turn over — ${this.getCars()[i].params.name} is done (Next Turn)`);
      }
    }
    if (!s.lapActive) {
      s.lapActive = true;
      s.lapStart = performance.now();
    }
    this.updateHud();
  }

  /** Ends the aimed Car's Turn (its owner is next in line). */
  nextTurn(): void {
    const s = this.state(this.getActive());
    s.pushesLeft = 3;
    this.updateHud();
    this.hud.flash(`${this.getCars()[this.getActive()].params.name} — 3 Pushes`);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    for (const s of this.states) {
      if (!s) continue;
      s.pushesLeft = 3;
      s.lapActive = false;
    }
    this.hud.setMode(mode);
    this.hud.setLapTime(null);
    this.updateHud();
  }

  /** Re-read the aimed Car into the HUD (called when the aimed Car changes). */
  refreshHud(): void {
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setPushes(
      this.mode === 'sandbox' ? '∞' : String(this.state(this.getActive()).pushesLeft),
    );
  }

  update(_dt: number): void {
    if (!this.enabled) return;
    const track = this.track;
    const active = this.getActive();
    const cars = this.getCars();

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const s = this.state(i);
      const center = car.position;
      const prog = track.progressOf(center);
      const arc = prog.s;

      // --- Hazards & Out of Track (checked continuously, wheels) ---
      const wheels = car.wheelPoints();
      const r = car.wheelRadius;
      let offCount = 0;
      let onRock = false;
      let onLake = false;
      for (const w of wheels) {
        if (track.isWheelOff(w, r)) offCount++;
        if (!onRock && track.wheelOnRock(w)) onRock = true;
        if (!onLake && track.wheelOnLake(w)) onLake = true;
      }
      const who = car.params.name;
      if (offCount >= 3) {
        this.resetTo(car, s, arc, 1, `Out of Track — ${who} back to the checkpoint`);
        continue;
      }
      if (onRock) {
        this.resetTo(car, s, arc, 1, `Rock! — ${who} back to the checkpoint`);
        continue;
      }
      if (onLake) {
        this.resetTo(car, s, arc, 2, `Lake — ${who} two checkpoints back`);
        continue;
      }
      if (car.atRest() && track.carOnBridge(center)) {
        this.resetTo(car, s, START_S, 0, `Stopped on the Bridge — ${who} back to the Start!`);
        continue;
      }

      // --- Finish line: forward wrap high→low s ---
      const L = track.length;
      if (s.prevS > L * 0.9 && arc < L * 0.1 && s.lapActive) {
        const t = (performance.now() - s.lapStart) / 1000;
        s.lapActive = false;
        this.hud.flash(`Lap: ${t.toFixed(2)}s — ${who}`);
        this.hud.setLapTime(null);
      }
      s.prevS = arc;
      if (i === active) this.hud.setLapTime(this.lapTime);
    }
  }

  /** Place the Car behind a checkpoint line, centered, facing forward. */
  private resetTo(
    car: Car,
    s: CarState,
    sNow: number,
    back: number,
    msg: string,
  ): void {
    const to = back === 0 ? sNow : this.track.checkpointsBack(sNow, back);
    const p = this.track.pointAt(to - RESET_BACK);
    const yaw = Math.atan2(-p.dz, p.dx); // local +X → path direction
    car.reset(new THREE.Vector3(p.x, p.y, p.z), yaw);
    s.prevS = to - RESET_BACK;
    s.lapActive = false; // a reset voids the running lap
    this.hud.setLapTime(null);
    this.hud.flash(msg);
  }
}
