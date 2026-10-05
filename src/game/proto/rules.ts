import * as THREE from 'three';
import type { Car } from './car.js';
import type { Track } from './track.js';

/**
 * THROWAWAY PROTOTYPE CODE — the game rules engine.
 * Out of Track (3+ wheels fully beyond a Boundary), Rock (one wheel touches),
 * Lake (2 checkpoints back), Bridge (stop on it → back to the Start),
 * finish-line crossing with lap timing, and 3-Push Turns in Lap Challenge.
 */

export type Mode = 'sandbox' | 'lap';

export interface Hud {
  flash(msg: string): void;
  setPushes(text: string): void;
  setLapTime(t: number | null): void;
  setMode(mode: Mode): void;
}

const RESET_BACK = 0.3; // place the Car this far behind a checkpoint line
export const START_S = 0.35; // just past the start line

export class Rules {
  mode: Mode = 'sandbox';
  /** False while the Test field is active — no rules, unlimited Pushes. */
  enabled = true;
  private pushesLeft = 3;
  private lapActive = false;
  private lapStart = 0;
  private prevS = START_S;

  constructor(
    private readonly track: Track,
    private readonly getCar: () => Car,
    private readonly hud: Hud,
  ) {}

  get lapTime(): number | null {
    return this.lapActive ? performance.now() - this.lapStart : null;
  }

  canPush(): boolean {
    if (!this.enabled) return true;
    return this.mode === 'sandbox' || this.pushesLeft > 0;
  }

  pushUsed(): void {
    if (!this.enabled) return;
    if (this.mode === 'lap') {
      this.pushesLeft = Math.max(0, this.pushesLeft - 1);
      if (this.pushesLeft === 0) {
        this.hud.flash('Turn over — press Next Turn');
      }
    }
    if (!this.lapActive) {
      this.lapActive = true;
      this.lapStart = performance.now();
    }
    this.updateHud();
  }

  nextTurn(): void {
    this.pushesLeft = 3;
    this.updateHud();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.pushesLeft = 3;
    this.lapActive = false;
    this.hud.setMode(mode);
    this.hud.setLapTime(null);
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setPushes(this.mode === 'sandbox' ? '∞' : String(this.pushesLeft));
  }

  update(_dt: number): void {
    if (!this.enabled) return;
    const car = this.getCar();
    const track = this.track;
    const center = car.position;
    const s = track.progressOf(center).s;

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
    if (offCount >= 3) {
      this.resetTo(track.checkpointsBack(s, 1), 'Out of Track — back to the checkpoint');
    } else if (onRock) {
      this.resetTo(track.checkpointsBack(s, 1), 'Rock! — back to the checkpoint');
    } else if (onLake) {
      this.resetTo(track.checkpointsBack(s, 2), 'Lake — two checkpoints back');
    } else if (car.atRest() && track.carOnBridge(center)) {
      this.resetTo(START_S, 'Stopped on the Bridge — back to the Start!');
    } else {
      // --- Finish line: forward wrap high→low s ---
      const L = track.length;
      if (this.prevS > L * 0.9 && s < L * 0.1 && this.lapActive) {
        const t = (performance.now() - this.lapStart) / 1000;
        this.lapActive = false;
        this.hud.flash(`Lap: ${t.toFixed(2)}s — first push starts the next lap`);
        this.hud.setLapTime(null);
      }
      this.prevS = s;
      this.hud.setLapTime(this.lapTime);
    }
  }

  /** Place the Car behind a checkpoint line, centered, facing forward. */
  private resetTo(s: number, msg: string): void {
    const p = this.track.pointAt(s - RESET_BACK);
    const yaw = Math.atan2(-p.dz, p.dx); // local +X → path direction
    this.getCar().reset(new THREE.Vector3(p.x, p.y, p.z), yaw);
    this.prevS = s - RESET_BACK;
    this.lapActive = false; // a reset voids the running lap
    this.hud.setLapTime(null);
    this.hud.flash(msg);
  }
}
