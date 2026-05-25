import {
  AudioUtils,
  createComponent,
  createSystem,
  eq,
  Mesh,
  MeshBasicMaterial,
  PanelDocument,
  PanelUI,
  PointLight,
  Types,
  UIKitDocument,
  VisibilityState,
} from "@iwsdk/core";

type LaunchPhase = "idle" | "arming" | "countdown" | "launch" | "summary";

const HOLD_TO_ARM_SECONDS = 1.2;
const COUNTDOWN_SECONDS = 8;
const UI_UPDATE_INTERVAL = 0.08;

export const LaunchSequence = createComponent("LaunchSequence", {});

export const LaunchVehicle = createComponent("LaunchVehicle", {
  initialY: { type: Types.Float32, default: 0 },
});

export const EngineFlame = createComponent("EngineFlame", {});

export const EngineFlameLight = createComponent("EngineFlameLight", {
  maxIntensity: { type: Types.Float32, default: 1 },
});

export const SmokePuff = createComponent("SmokePuff", {
  seed: { type: Types.Float32, default: 0 },
});

export const BeaconLight = createComponent("BeaconLight", {
  seed: { type: Types.Float32, default: 0 },
});

export class RocketLaunchSystem extends createSystem({
  sequence: { required: [LaunchSequence] },
  vehicles: { required: [LaunchVehicle] },
  flames: { required: [EngineFlame] },
  flameLights: { required: [EngineFlameLight] },
  smoke: { required: [SmokePuff] },
  beacons: { required: [BeaconLight] },
  missionPanels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  rocketPanels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/rocket-panel.json")],
  },
}) {
  private phase: LaunchPhase = "idle";
  private countdown = COUNTDOWN_SECONDS;
  private holdTime = 0;
  private launchTime = 0;
  private altitude = 0;
  private velocity = 0;
  private paused = false;
  private holdingLaunch = false;
  private status = "HOLD LAUNCH TO ARM";
  private lastPanelUpdate = 0;
  private readonly hookedPanels = new Set<number>();

  init() {
    this.queries.missionPanels.subscribe("qualify", (entity) => {
      this.hookMissionPanel(entity.index);
    });
    this.queries.rocketPanels.subscribe("qualify", () => {
      this.lastPanelUpdate = 0;
    });
  }

  update(delta: number, time: number) {
    this.updateState(delta);
    this.updateRocket();
    this.updateEffects(delta, time);

    if (time - this.lastPanelUpdate > UI_UPDATE_INTERVAL) {
      this.updatePanels();
      this.lastPanelUpdate = time;
    }
  }

  private hookMissionPanel(entityIndex: number) {
    if (this.hookedPanels.has(entityIndex)) {
      return;
    }
    this.hookedPanels.add(entityIndex);

    let entity;
    for (const panel of this.queries.missionPanels.entities) {
      if (panel.index === entityIndex) {
        entity = panel;
        break;
      }
    }
    const document = entity
      ? (PanelDocument.data.document[entity.index] as UIKitDocument)
      : undefined;
    if (!document) {
      return;
    }

    const launchButton = document.getElementById("launch-button");
    const holdButton = document.getElementById("hold-button");
    const systemCheckButton = document.getElementById("system-check-button");

    const onLaunchDown = (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
        this.world.launchXR();
        this.status = "ENTERING AR";
        this.lastPanelUpdate = 0;
        return;
      }
      if (this.phase === "idle" || this.phase === "summary") {
        this.phase = "arming";
        this.holdTime = 0;
        this.holdingLaunch = true;
        this.status = "KEEP HOLDING";
      }
    };
    const onLaunchUp = () => {
      this.holdingLaunch = false;
    };
    const onSystemCheck = (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      this.resetMission("SYSTEMS NOMINAL");
    };
    const onHold = (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      if (this.phase === "countdown") {
        this.paused = !this.paused;
        this.status = this.paused ? "COUNTDOWN HOLD" : "COUNTDOWN RESUMED";
      } else if (this.phase === "arming") {
        this.phase = "idle";
        this.holdingLaunch = false;
        this.holdTime = 0;
        this.status = "LAUNCH HOLD";
      }
      this.lastPanelUpdate = 0;
    };

    launchButton?.addEventListener("pointerdown", onLaunchDown);
    launchButton?.addEventListener("pointerup", onLaunchUp);
    launchButton?.addEventListener("pointerleave", onLaunchUp);
    launchButton?.addEventListener("pointercancel", onLaunchUp);
    holdButton?.addEventListener("click", onHold);
    systemCheckButton?.addEventListener("click", onSystemCheck);

    this.cleanupFuncs.push(() => {
      launchButton?.removeEventListener("pointerdown", onLaunchDown);
      launchButton?.removeEventListener("pointerup", onLaunchUp);
      launchButton?.removeEventListener("pointerleave", onLaunchUp);
      launchButton?.removeEventListener("pointercancel", onLaunchUp);
      holdButton?.removeEventListener("click", onHold);
      systemCheckButton?.removeEventListener("click", onSystemCheck);
    });

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        if (visibilityState === VisibilityState.NonImmersive) {
          this.status = "ENTER AR TO LAUNCH";
        } else if (this.phase === "idle") {
          this.status = "HOLD LAUNCH TO ARM";
        }
        this.lastPanelUpdate = 0;
      }),
    );
  }

  private updateState(delta: number) {
    if (this.phase === "arming") {
      if (this.holdingLaunch) {
        this.holdTime = Math.min(HOLD_TO_ARM_SECONDS, this.holdTime + delta);
        this.status = `ARMING ${Math.round((this.holdTime / HOLD_TO_ARM_SECONDS) * 100)}%`;
        if (this.holdTime >= HOLD_TO_ARM_SECONDS) {
          this.startCountdown();
        }
      } else {
        this.holdTime = Math.max(0, this.holdTime - delta * 2);
        if (this.holdTime === 0) {
          this.phase = "idle";
          this.status = "HOLD LAUNCH TO ARM";
        }
      }
      return;
    }

    if (this.phase === "countdown" && !this.paused) {
      this.countdown = Math.max(0, this.countdown - delta);
      this.status =
        this.countdown <= 3 ? "IGNITION SEQUENCE" : "COUNTDOWN ACTIVE";
      if (this.countdown === 0) {
        this.startLaunch();
      }
      return;
    }

    if (this.phase === "launch") {
      this.launchTime += delta;
      this.velocity = Math.min(320, this.velocity + 46 * delta);
      this.altitude = Math.min(520, this.altitude + this.velocity * delta);
      this.status = "LIFTOFF";
      if (this.launchTime > 5.2) {
        this.phase = "summary";
        this.status = "ASCENT NOMINAL";
      }
    }
  }

  private startCountdown() {
    this.phase = "countdown";
    this.countdown = COUNTDOWN_SECONDS;
    this.holdingLaunch = false;
    this.paused = false;
    this.status = "COUNTDOWN ACTIVE";
    this.playRocketAudio();
  }

  private startLaunch() {
    this.phase = "launch";
    this.launchTime = 0;
    this.velocity = 18;
    this.altitude = 0;
    this.status = "LIFTOFF";
    this.playRocketAudio();
  }

  private resetMission(status: string) {
    this.phase = "idle";
    this.countdown = COUNTDOWN_SECONDS;
    this.holdTime = 0;
    this.launchTime = 0;
    this.altitude = 0;
    this.velocity = 0;
    this.paused = false;
    this.holdingLaunch = false;
    this.status = status;
    this.lastPanelUpdate = 0;
  }

  private playRocketAudio() {
    const rocket = this.getRocketEntity();
    if (rocket) {
      AudioUtils.play(rocket);
    }
  }

  private updateRocket() {
    const rocket = this.getRocketEntity();
    if (!rocket?.object3D) {
      return;
    }

    const initialY = rocket.getValue(LaunchVehicle, "initialY") ?? 0;
    let launchOffset = 0;
    if (this.phase === "launch" || this.phase === "summary") {
      launchOffset = Math.min(1.45, this.launchTime * this.launchTime * 0.08);
    }
    rocket.object3D.position.y = initialY + launchOffset;
  }

  private updateEffects(delta: number, time: number) {
    const flamePower = this.getFlamePower(time);
    for (const entity of this.queries.flames.entities) {
      const flame = entity.object3D;
      if (!flame) {
        continue;
      }
      flame.visible = flamePower > 0.01;
      flame.scale.set(1 + flamePower * 0.18, 1 + flamePower * 1.9, 1 + flamePower * 0.18);
      const material = (flame as Mesh).material as MeshBasicMaterial | undefined;
      if (material) {
        material.opacity = Math.min(0.9, 0.22 + flamePower * 0.68);
      }
    }

    for (const entity of this.queries.flameLights.entities) {
      const light = entity.object3D as PointLight | undefined;
      if (!light) {
        continue;
      }
      const maxIntensity = entity.getValue(EngineFlameLight, "maxIntensity") ?? 1;
      light.visible = flamePower > 0.01;
      light.intensity = maxIntensity * flamePower;
    }

    const smokePower = this.phase === "countdown" || this.phase === "launch" ? 1 : 0.2;
    for (const entity of this.queries.smoke.entities) {
      const puff = entity.object3D as Mesh | undefined;
      if (!puff) {
        continue;
      }
      const seed = entity.getValue(SmokePuff, "seed") ?? 0;
      const cycle = (time * (0.22 + seed * 0.04) + seed) % 1;
      const size = (0.35 + cycle * 1.9) * smokePower;
      puff.visible = smokePower > 0.05;
      puff.scale.setScalar(size);
      puff.position.y += delta * (0.004 + cycle * 0.012) * smokePower;
      if (puff.position.y > 0.11) {
        puff.position.y = 0.018 + seed * 0.008;
      }
      const material = puff.material as MeshBasicMaterial;
      material.opacity = Math.max(0, (1 - cycle) * 0.34 * smokePower);
    }

    for (const entity of this.queries.beacons.entities) {
      const beacon = entity.object3D as Mesh | undefined;
      if (!beacon) {
        continue;
      }
      const seed = entity.getValue(BeaconLight, "seed") ?? 0;
      const on = Math.sin(time * 7 + seed) > -0.15;
      beacon.visible = on || this.phase === "launch";
    }
  }

  private getFlamePower(time: number) {
    if (this.phase === "launch") {
      return 0.75 + Math.sin(time * 38) * 0.2;
    }
    if (this.phase === "countdown" && this.countdown <= 3) {
      return 0.18 + (3 - this.countdown) / 3 + Math.sin(time * 24) * 0.08;
    }
    return 0;
  }

  private getRocketEntity() {
    for (const rocket of this.queries.vehicles.entities) {
      return rocket;
    }
    return undefined;
  }

  private updatePanels() {
    for (const entity of this.queries.missionPanels.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.setText(document, "countdown-value", this.formatCountdown());
      this.setText(document, "mission-status", this.status);
      this.setText(document, "height-number", this.altitude.toFixed(1));
      this.setText(document, "launch-button-label", this.launchButtonLabel());
      this.setText(document, "hold-button-label", this.paused ? "RESUME" : "HOLD");
    }

    for (const entity of this.queries.rocketPanels.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.setText(document, "rocket-altitude", `${this.altitude.toFixed(1)} m`);
      this.setText(document, "rocket-velocity", `${Math.round(this.velocity)} m/s`);
      this.setText(document, "rocket-stage", this.stageLabel());
      this.setText(document, "rocket-status", this.status);
    }
  }

  private setText(document: UIKitDocument, id: string, text: string) {
    document.getElementById(id)?.setProperties({ text });
  }

  private formatCountdown() {
    if (this.phase === "launch" || this.phase === "summary") {
      return "00:00:00";
    }
    const seconds = Math.ceil(this.countdown).toString().padStart(2, "0");
    return `00:00:${seconds}`;
  }

  private launchButtonLabel() {
    if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
      return "ENTER AR";
    }
    if (this.phase === "arming") {
      return "HOLD";
    }
    if (this.phase === "countdown") {
      return "ARMED";
    }
    if (this.phase === "launch") {
      return "LIFTOFF";
    }
    if (this.phase === "summary") {
      return "RESET";
    }
    return "LAUNCH";
  }

  private stageLabel() {
    if (this.phase === "launch" || this.phase === "summary") {
      return "STAGE 1";
    }
    if (this.phase === "countdown") {
      return "ARMED";
    }
    return "READY";
  }
}
