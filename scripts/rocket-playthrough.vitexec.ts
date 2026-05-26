import { Matrix4, Quaternion, Vector3 } from "@iwsdk/core";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function waitFor<T>(
  label: string,
  predicate: () => T | undefined | null | false,
  timeout = 12_000,
) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const value = predicate();
    if (value) {
      return value;
    }
    await frame();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const world = await waitFor("IWSDK world", () => window.FRAMEWORK_MCP_RUNTIME?.world);
const device = await waitFor("IWER device", () => window.IWER_DEVICE);
const system = await waitFor("RocketLaunchSystem", () =>
  world.systems?.find((entry: unknown) => entry?.constructor?.name === "RocketLaunchSystem"),
);
const panel = await waitFor("launch panel", () =>
  world.scene?.getObjectByName?.("Desk Embedded Launch Controls"),
);
const rocket = await waitFor("rocket", () =>
  world.scene?.getObjectByName?.("Kenney Modular Rocket"),
);

const up = new Vector3(0, 1, 0);
const eye = new Vector3();
const target = new Vector3();
const matrix = new Matrix4();
const quat = new Quaternion();
const rocketPos = new Vector3();
const launchTarget = new Vector3();
const launchLocalTarget = new Vector3(0.19, -0.19, 0.004);

function getLaunchTarget() {
  panel.updateWorldMatrix(true, false);
  return launchTarget.copy(launchLocalTarget).applyMatrix4(panel.matrixWorld);
}

function getRocketTarget(extraY = 0.16) {
  rocket.updateWorldMatrix(true, true);
  rocket.getWorldPosition(rocketPos);
  return rocketPos.clone().add(new Vector3(0, extraY, 0));
}

function lookAtWithQuaternion(
  position: Vector3,
  lookTarget: Vector3,
  outPosition: { set: (x: number, y: number, z: number) => void },
  outQuaternion: { set: (x: number, y: number, z: number, w: number) => void },
) {
  eye.copy(position);
  target.copy(lookTarget);
  matrix.lookAt(eye, target, up);
  quat.setFromRotationMatrix(matrix);
  outPosition.set(eye.x, eye.y, eye.z);
  outQuaternion.set(quat.x, quat.y, quat.z, quat.w);
}

function setViewerLookAt(position: Vector3, lookTarget: Vector3) {
  lookAtWithQuaternion(position, lookTarget, device.position, device.quaternion);
  device.notifyStateChange?.();
}

function setControllerLookAt(position: Vector3, lookTarget: Vector3) {
  lookAtWithQuaternion(
    position,
    lookTarget,
    device.controllers.right.position,
    device.controllers.right.quaternion,
  );
  device.notifyStateChange?.();
}

async function rotateViewer(
  fromTarget: Vector3,
  toTarget: Vector3,
  durationMs: number,
  position: Vector3,
  controllerPosition: Vector3,
  launchButtonWorld: Vector3,
) {
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const eased = t * t * (3 - 2 * t);
    const blended = fromTarget.clone().lerp(toTarget, eased);
    setViewerLookAt(position, blended);
    setControllerLookAt(controllerPosition, launchButtonWorld);
    await frame();
  }
}

async function holdIwerTrigger(
  seconds: number,
  controllerPosition: Vector3,
  launchButtonWorld: Vector3,
) {
  device.controllers.right.updateButtonValue("trigger", 1);
  device.notifyStateChange?.();
  const start = performance.now();
  while (performance.now() - start < seconds * 1000) {
    setControllerLookAt(controllerPosition, launchButtonWorld);
    await frame();
  }
  device.controllers.right.updateButtonValue("trigger", 0);
  device.notifyStateChange?.();
}

console.log(
  "rocket-playthrough-start",
  JSON.stringify({
    url: location.href,
    canvasCount: document.querySelectorAll("canvas").length,
    sessionOffered: device.sessionOffered,
    activeSession: Boolean(device.activeSession),
    initialPhase: system.phase,
    hasManagedMcp: Boolean(window.__IWER_MCP_MANAGED),
  }),
);

if (!device.activeSession) {
  if (!device.sessionOffered) {
    world.launchXR?.();
    await waitFor("offered AR session", () => device.sessionOffered, 5000);
  }
  device.grantOfferedSession();
  await waitFor("active AR session", () => device.activeSession, 5000);
}

device.primaryInputMode = "controller";
device.controlMode = "programmatic";
device.controllers.right.connected = true;
device.controllers.left.connected = true;

const launchButtonWorld = getLaunchTarget().clone();
const controllerPosition = new Vector3(
  launchButtonWorld.x + 0.02,
  launchButtonWorld.y + 0.34,
  launchButtonWorld.z + 0.05,
);
const viewerPosition = new Vector3(0.08, 1.12, 0.08);

setViewerLookAt(viewerPosition, launchButtonWorld);
setControllerLookAt(controllerPosition, launchButtonWorld);
await wait(1500);
console.log(
  "iwer-pointing-at-launch",
  JSON.stringify({
    activeSession: Boolean(device.activeSession),
    launchButtonWorld: launchButtonWorld.toArray().map((value) => Number(value.toFixed(3))),
    rightController: [
      Number(device.controllers.right.position.x.toFixed(3)),
      Number(device.controllers.right.position.y.toFixed(3)),
      Number(device.controllers.right.position.z.toFixed(3)),
    ],
  }),
);

await holdIwerTrigger(1.65, controllerPosition, launchButtonWorld);
await wait(350);
console.log(
  "iwer-trigger-result",
  JSON.stringify({
    phase: system.phase,
    status: system.status,
    holdTime: Number(system.holdTime?.toFixed?.(2) ?? 0),
    countdown: Number(system.countdown?.toFixed?.(2) ?? 0),
  }),
);

await rotateViewer(
  launchButtonWorld.clone(),
  getRocketTarget(0.18),
  1700,
  viewerPosition,
  controllerPosition,
  launchButtonWorld,
);
console.log(
  "iwer-viewer-rotated-to-rocket",
  JSON.stringify({ phase: system.phase, status: system.status }),
);

let lastPhase = system.phase;
let liftoffLogged = false;
const followStart = performance.now();
while (performance.now() - followStart < 14_500) {
  const elapsed = (performance.now() - followStart) / 1000;
  const followPosition =
    elapsed < 8.2 ? viewerPosition : new Vector3(0.08, 1.26, 0.26);
  const followTarget = getRocketTarget(
    system.phase === "launch" || system.phase === "summary" ? 0.3 : 0.18,
  );
  setViewerLookAt(followPosition, followTarget);
  setControllerLookAt(controllerPosition, launchButtonWorld);

  if (system.phase !== lastPhase) {
    lastPhase = system.phase;
    console.log(
      "iwer-phase-change",
      JSON.stringify({
        phase: system.phase,
        status: system.status,
        countdown: Number(system.countdown?.toFixed?.(2) ?? 0),
        altitude: Number(system.altitude?.toFixed?.(2) ?? 0),
        rocketY: Number(rocket.position.y.toFixed(3)),
      }),
    );
  }

  if (!liftoffLogged && system.phase === "launch") {
    liftoffLogged = true;
    console.log(
      "iwer-following-liftoff",
      JSON.stringify({
        status: system.status,
        altitude: Number(system.altitude.toFixed(2)),
        rocketY: Number(rocket.position.y.toFixed(3)),
      }),
    );
  }

  if (system.phase === "summary" && elapsed > 13) {
    break;
  }
  await frame();
}

setViewerLookAt(new Vector3(0.08, 1.3, 0.3), getRocketTarget(0.35));
await wait(1000);
console.log(
  "rocket-playthrough-complete",
  JSON.stringify({
    activeSession: Boolean(device.activeSession),
    phase: system.phase,
    status: system.status,
    altitude: Number(system.altitude.toFixed(2)),
    velocity: Number(system.velocity.toFixed(2)),
    rocketY: Number(rocket.position.y.toFixed(3)),
    canvasWidth: document.querySelector("canvas")?.width,
    canvasHeight: document.querySelector("canvas")?.height,
  }),
);
