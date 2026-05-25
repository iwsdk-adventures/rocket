import {
  AssetManager,
  AssetManifest,
  AssetType,
  Box3,
  AudioSource,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PanelUI,
  PlaneGeometry,
  PointLight,
  PokeInteractable,
  RayInteractable,
  SessionMode,
  SphereGeometry,
  Vector3,
  World,
} from "@iwsdk/core";

import {
  BeaconLight,
  EngineFlame,
  EngineFlameLight,
  LaunchSequence,
  LaunchVehicle,
  RocketLaunchSystem,
  SmokePuff,
} from "./rocket-launch.js";

const kenneyAssets = [
  "barrels",
  "craterLarge",
  "machine_generator",
  "pipe_cornerRound",
  "pipe_straight",
  "pipe_supportHigh",
  "platform_center",
  "platform_large",
  "platform_straight",
  "rocket_baseA",
  "rocket_finsA",
  "rocket_fuelA",
  "rocket_sidesA",
  "rocket_topA",
  "rock",
  "rock_largeA",
  "rover",
  "satelliteDish_large",
  "structure_closed",
  "supports_high",
  "supports_low",
  "terrain",
  "terrain_side",
  "terrain_sideCorner",
  "terrain_sideCornerInner",
] as const;

const assets: AssetManifest = {
  chimeSound: {
    url: "/audio/chime.mp3",
    type: AssetType.Audio,
    priority: "background",
  },
};

for (const key of kenneyAssets) {
  assets[key] = {
    url: `/gltf/space-kit/${key}.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  };
}

const TABLE_Y = 0.74;

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: "always",
    features: {
      handTracking: true,
      anchors: true,
      hitTest: true,
      planeDetection: true,
      meshDetection: true,
      layers: false,
    },
  },
  render: {
    defaultLighting: false,
    camera: {
      position: [0, 1.16, 0.76],
      lookAt: [0, TABLE_Y, -1.15],
    },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: true,
    environmentRaycast: true,
  },
}).then((world) => {
  addLighting(world);
  addDeskSurface(world);

  const siteRoot = new Group();
  siteRoot.name = "Desk Anchored Rocket Launch Site";
  siteRoot.position.set(-0.28, TABLE_Y + 0.018, -1.16);
  const siteEntity = world
    .createTransformEntity(siteRoot, { persistent: true })
    .addComponent(LaunchSequence);

  createKenneyLaunchSite(world, siteEntity);
  createLaunchEffects(world, siteEntity);

  const panelEntity = world
    .createTransformEntity(undefined, { persistent: true })
    .addComponent(PanelUI, {
      config: "./ui/welcome.json",
      maxHeight: 0.54,
      maxWidth: 0.52,
    })
    .addComponent(RayInteractable)
    .addComponent(PokeInteractable);
  panelEntity.object3D!.name = "Desk Embedded Launch Controls";
  panelEntity.object3D!.position.set(0.28, TABLE_Y + 0.014, -1.13);
  panelEntity.object3D!.rotation.set(-Math.PI / 2, 0, -0.08);

  const rocketPanelEntity = world
    .createTransformEntity(undefined, {
      parent: siteEntity,
      persistent: true,
    })
    .addComponent(PanelUI, {
      config: "./ui/rocket-panel.json",
      maxHeight: 0.13,
      maxWidth: 0.17,
    })
    .addComponent(RayInteractable);
  rocketPanelEntity.object3D!.name = "Rocket Telemetry Panel";
  rocketPanelEntity.object3D!.position.set(-0.18, 0.24, 0.11);
  rocketPanelEntity.object3D!.rotation.set(-0.08, 0.42, 0);

  world.registerSystem(RocketLaunchSystem);
});

function addLighting(world: World) {
  const hemi = new HemisphereLight(0xd8f2ff, 0x6d4a35, 1.5);
  hemi.name = "Soft AR Room Light";
  world.createTransformEntity(hemi, { persistent: true });

  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.name = "Window Key Light";
  sun.position.set(0.7, 1.7, 0.65);
  world.createTransformEntity(sun, { persistent: true });

  const panelGlow = new PointLight(0x78c9ff, 0.75, 1.2);
  panelGlow.name = "Control Panel Glow";
  panelGlow.position.set(0.28, TABLE_Y + 0.08, -1.13);
  world.createTransformEntity(panelGlow, { persistent: true });
}

function addDeskSurface(world: World) {
  const desk = new Mesh(
    new PlaneGeometry(1.24, 0.78),
    new MeshStandardMaterial({
      color: 0x3b2619,
      roughness: 0.84,
      metalness: 0.02,
      transparent: true,
      opacity: 0.34,
    }),
  );
  desk.name = "AR Desk Contact Surface";
  desk.rotation.x = -Math.PI / 2;
  desk.position.set(0, TABLE_Y, -1.14);
  world.createTransformEntity(desk, { persistent: true });

  const contactShadow = new Mesh(
    new CircleGeometry(0.48, 48),
    new MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  contactShadow.name = "Miniature Launch Site Contact Shadow";
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(-0.28, TABLE_Y + 0.002, -1.16);
  world.createTransformEntity(contactShadow, { persistent: true });
}

function createKenneyLaunchSite(world: World, siteEntity: ReturnType<World["createEntity"]>) {
  createKenneyTerrainBase(world, siteEntity);
  addKenneyModel(world, siteEntity, "craterLarge", "Central Crater Detail", [0.015, -0.004, 0.01], 0.15);
  addKenneyModel(world, siteEntity, "platform_large", "Launch Pad", [0, 0.015, 0], 0.065);
  addKenneyModel(world, siteEntity, "platform_center", "Service Pad", [0.19, 0.012, -0.11], 0.045);
  addKenneyModel(world, siteEntity, "platform_straight", "Access Walkway", [0.1, 0.012, 0.1], 0.045, [0, Math.PI / 2, 0]);

  addKenneyModel(world, siteEntity, "structure_closed", "Mission Blockhouse", [-0.19, 0.012, 0.02], 0.045, [0, -0.25, 0]);
  addKenneyModel(world, siteEntity, "machine_generator", "Power Generator", [-0.19, 0.012, -0.16], 0.04, [0, 0.28, 0]);
  addKenneyModel(world, siteEntity, "satelliteDish_large", "Tracking Dish", [0.21, 0.012, 0.16], 0.045, [0, -0.72, 0]);
  addKenneyModel(world, siteEntity, "barrels", "Fuel Tanks", [-0.07, 0.012, -0.22], 0.04);
  addKenneyModel(world, siteEntity, "rover", "Pad Rover", [-0.13, 0.012, 0.19], 0.03, [0, 0.8, 0]);

  createKenneyRocket(world, siteEntity);
  createKenneyTower(world, siteEntity);
}

function createKenneyTerrainBase(world: World, siteEntity: ReturnType<World["createEntity"]>) {
  const outline: Array<[number, number]> = [
    [-0.42, -0.18],
    [-0.36, -0.29],
    [-0.21, -0.33],
    [-0.05, -0.3],
    [0.08, -0.34],
    [0.27, -0.27],
    [0.39, -0.16],
    [0.43, 0.02],
    [0.34, 0.16],
    [0.18, 0.26],
    [0.03, 0.3],
    [-0.12, 0.27],
    [-0.27, 0.31],
    [-0.4, 0.21],
    [-0.48, 0.07],
    [-0.51, -0.08],
  ];

  const terrainTop = new Mesh(
    createTerrainTopGeometry(outline, -0.012),
    new MeshStandardMaterial({
      color: 0xa85d43,
      roughness: 0.96,
      metalness: 0.02,
      side: DoubleSide,
    }),
  );
  terrainTop.name = "Continuous Martian Terrain Surface";
  world.createTransformEntity(terrainTop, { parent: siteEntity, persistent: true });

  const terrainRim = new Mesh(
    createTerrainRimGeometry(outline, -0.012, -0.072),
    new MeshStandardMaterial({
      color: 0x5d3024,
      roughness: 0.98,
      metalness: 0,
      side: DoubleSide,
    }),
  );
  terrainRim.name = "Continuous Martian Terrain Rim";
  world.createTransformEntity(terrainRim, { parent: siteEntity, persistent: true });

  addTerrainDustPatch(world, siteEntity, "Dust Patch A", [-0.2, -0.0105, -0.12], [0.22, 0.08], 0.2);
  addTerrainDustPatch(world, siteEntity, "Dust Patch B", [0.17, -0.0104, 0.12], [0.18, 0.065], -0.6);
  addTerrainDustPatch(world, siteEntity, "Dust Patch C", [0.04, -0.0103, -0.22], [0.14, 0.05], 0.9);

  addKenneyModel(world, siteEntity, "rock_largeA", "Terrain Rock A", [-0.32, 0.002, -0.12], 0.034, [0, 0.4, 0]);
  addKenneyModel(world, siteEntity, "rock", "Terrain Rock B", [0.28, 0.002, -0.17], 0.03, [0, 1.1, 0]);
  addKenneyModel(world, siteEntity, "rock", "Terrain Rock C", [0.31, 0.002, 0.08], 0.024, [0, -0.5, 0]);
  addKenneyModel(world, siteEntity, "rock_largeA", "Terrain Rock D", [-0.08, 0.002, 0.22], 0.026, [0, 2.2, 0]);
}

function createTerrainTopGeometry(outline: Array<[number, number]>, y: number) {
  const positions = [0, y, 0];
  for (const [x, z] of outline) {
    positions.push(x, y, z);
  }

  const indices: number[] = [];
  for (let i = 1; i <= outline.length; i += 1) {
    const next = i === outline.length ? 1 : i + 1;
    indices.push(0, i, next);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTerrainRimGeometry(
  outline: Array<[number, number]>,
  topY: number,
  bottomY: number,
) {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < outline.length; i += 1) {
    const [x, z] = outline[i];
    positions.push(x, topY, z, x, bottomY, z);
  }

  for (let i = 0; i < outline.length; i += 1) {
    const next = i === outline.length - 1 ? 0 : i + 1;
    const topA = i * 2;
    const bottomA = topA + 1;
    const topB = next * 2;
    const bottomB = topB + 1;
    indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addTerrainDustPatch(
  world: World,
  siteEntity: ReturnType<World["createEntity"]>,
  name: string,
  position: [number, number, number],
  scale: [number, number],
  rotationY: number,
) {
  const patch = new Mesh(
    new CircleGeometry(1, 28),
    new MeshBasicMaterial({
      color: 0xc27759,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  patch.name = name;
  patch.position.set(position[0], position[1], position[2]);
  patch.rotation.set(-Math.PI / 2, 0, rotationY);
  patch.scale.set(scale[0], scale[1], 1);
  world.createTransformEntity(patch, { parent: siteEntity, persistent: true });
}

function createKenneyRocket(world: World, siteEntity: ReturnType<World["createEntity"]>) {
  const rocketRoot = new Group();
  rocketRoot.name = "Kenney Modular Rocket";
  rocketRoot.position.set(0, 0.035, 0);
  const rocketEntity = world
    .createTransformEntity(rocketRoot, { parent: siteEntity, persistent: true })
    .addComponent(LaunchVehicle, { initialY: rocketRoot.position.y })
    .addComponent(AudioSource, {
      src: "/audio/chime.mp3",
      maxInstances: 3,
    });

  const scale = 0.065;
  addKenneyModel(world, rocketEntity, "rocket_baseA", "Rocket Engine Base", [0, 0, 0], scale);
  addKenneyModel(world, rocketEntity, "rocket_finsA", "Rocket Fins", [0, 0.016, 0], scale);
  addKenneyModel(world, rocketEntity, "rocket_sidesA", "Rocket Core", [0, 0.09, 0], scale);
  addKenneyModel(world, rocketEntity, "rocket_fuelA", "Rocket Fuel Section", [0, 0.155, 0], scale);
  addKenneyModel(world, rocketEntity, "rocket_topA", "Rocket Capsule", [0, 0.187, 0], scale);

  const flame = new Mesh(
    new ConeGeometry(0.011, 0.085, 18),
    new MeshBasicMaterial({
      color: 0xff8b2f,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  flame.name = "Engine Flame";
  flame.rotation.x = Math.PI;
  flame.position.set(0, -0.032, 0);
  world
    .createTransformEntity(flame, { parent: rocketEntity, persistent: true })
    .addComponent(EngineFlame);

  const flameLight = new PointLight(0xff8b2f, 0, 0.34);
  flameLight.name = "Engine Flame Glow";
  flameLight.position.set(0, -0.04, 0);
  flameLight.visible = false;
  world
    .createTransformEntity(flameLight, { parent: rocketEntity, persistent: true })
    .addComponent(EngineFlameLight, { maxIntensity: 1.4 });
}

function createKenneyTower(world: World, siteEntity: ReturnType<World["createEntity"]>) {
  const towerScale = 0.075;
  const towerX = 0.115;
  const towerZ = -0.015;
  addKenneyModel(world, siteEntity, "supports_high", "Launch Tower Lower", [towerX, 0.035, towerZ], towerScale);
  addKenneyModel(world, siteEntity, "supports_high", "Launch Tower Middle", [towerX, 0.11, towerZ], towerScale);
  addKenneyModel(world, siteEntity, "supports_high", "Launch Tower Upper", [towerX, 0.185, towerZ], towerScale);
  addKenneyModel(world, siteEntity, "supports_low", "Tower Cap", [towerX, 0.26, towerZ], towerScale);
  addKenneyModel(world, siteEntity, "pipe_straight", "Service Arm", [0.06, 0.156, -0.004], 0.046, [0, 0, Math.PI / 2]);
  addKenneyModel(world, siteEntity, "pipe_cornerRound", "Fuel Line Bend", [0.17, 0.092, -0.035], 0.041, [0, Math.PI / 2, 0]);
  addKenneyModel(world, siteEntity, "pipe_supportHigh", "Fuel Line Support", [0.19, 0.018, -0.08], 0.046);

  const beacon = new Mesh(
    new SphereGeometry(0.01, 12, 8),
    new MeshBasicMaterial({ color: 0xff4b32 }),
  );
  beacon.name = "Tower Beacon";
  beacon.position.set(towerX, 0.31, towerZ);
  world
    .createTransformEntity(beacon, { parent: siteEntity, persistent: true })
    .addComponent(BeaconLight, { seed: 1.8 });
  addBlinkingPointLight(
    world,
    siteEntity,
    "Tower Beacon Glow",
    [towerX, 0.31, towerZ],
    0xff3d2f,
    0.95,
    0.32,
    1.8,
  );
}

function createLaunchEffects(world: World, siteEntity: ReturnType<World["createEntity"]>) {
  const smokeGeometry = new SphereGeometry(0.035, 12, 8);
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const radius = 0.026 + (i % 4) * 0.014;
    const puff = new Mesh(
      smokeGeometry,
      new MeshBasicMaterial({
        color: 0xc9d1d5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    puff.name = `Steam Puff ${i + 1}`;
    puff.position.set(Math.cos(angle) * radius, 0.018 + i * 0.001, Math.sin(angle) * radius);
    puff.visible = false;
    world
      .createTransformEntity(puff, { parent: siteEntity, persistent: true })
      .addComponent(SmokePuff, { seed: i / 14 });
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const marker = new Mesh(
      new BoxGeometry(0.008, 0.018, 0.008),
      new MeshBasicMaterial({ color: 0xff9b37 }),
    );
    marker.name = `Pad Marker Light ${i + 1}`;
    marker.position.set(Math.cos(angle) * 0.24, 0.026, Math.sin(angle) * 0.24);
    world
      .createTransformEntity(marker, { parent: siteEntity, persistent: true })
      .addComponent(BeaconLight, { seed: i * 0.37 });
    addBlinkingPointLight(
      world,
      siteEntity,
      `Pad Marker Glow ${i + 1}`,
      [marker.position.x, marker.position.y + 0.012, marker.position.z],
      0xff9b37,
      0.022,
      0.18,
      i * 0.37,
    );
  }
}

function addBlinkingPointLight(
  world: World,
  siteEntity: ReturnType<World["createEntity"]>,
  name: string,
  position: [number, number, number],
  color: number,
  intensity: number,
  distance: number,
  seed: number,
) {
  const light = new PointLight(color, intensity, distance);
  light.name = name;
  light.position.set(position[0], position[1], position[2]);
  world
    .createTransformEntity(light, { parent: siteEntity, persistent: true })
    .addComponent(BeaconLight, { seed });
}

function addKenneyModel(
  world: World,
  parent: ReturnType<World["createEntity"]>,
  key: (typeof kenneyAssets)[number],
  name: string,
  position: [number, number, number],
  scale: number,
  rotation: [number, number, number] = [0, 0, 0],
) {
  const gltf = AssetManager.getGLTF(key);
  if (!gltf) {
    return;
  }

  const model = gltf.scene;
  model.name = `${name} Model`;
  model.scale.setScalar(scale);
  prepareModel(model);

  const box = new Box3().setFromObject(model);
  const center = new Vector3();
  box.getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);

  const wrapper = new Group();
  wrapper.name = name;
  wrapper.position.set(position[0], position[1], position[2]);
  wrapper.rotation.set(rotation[0], rotation[1], rotation[2]);
  wrapper.add(model);

  world.createTransformEntity(wrapper, { parent, persistent: true });
}

function prepareModel(model: Object3D) {
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}
