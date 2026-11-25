// KA — 夜の蚊取り。パレットは「月光の青」と「肌の暖色」の2系統だけに絞る（solid drawing）。

import { hex } from "../../vendor/pixelfx/src/core/index.js";

const RAW = {
  // 闇と壁
  void: "#07060c",
  wallTop: "#0c0a14",
  wall: "#121020",
  wallHi: "#191628",
  stripe: "#0f0d1a",
  baseboard: "#1c1929",
  baseboardHi: "#2a2640",
  frame: "#2b2740",
  frameHi: "#3b3557",
  curtain: "#191527",
  curtainHi: "#241f36",

  // 窓と月
  sky: "#181633",
  skyTop: "#0e0c20",
  moon: "#f2eeff",
  moonShade: "#cfc8ee",
  star: "#9a94cc",
  beam: "#38345c",
  beamInner: "#4a4573",

  // 床と寝具
  floor: "#0d0b15",
  floorLine: "#151222",
  futon: "#1b1828",
  futonHi: "#282438",
  futonLo: "#12101c",
  sheet: "#2b2740",
  sheetHi: "#3b3654",
  pillow: "#46415f",
  pillowHi: "#5b5578",
  pillowLo: "#312d44",
  blanket: "#232034",
  blanketHi: "#332f4a",
  blanketLo: "#171426",

  // 人
  skin: "#c99a80",
  skinHi: "#eec3a5",
  skinLo: "#9c6f5b",
  skinDeep: "#7a5344",
  hair: "#1e1826",
  hairHi: "#2e2638",
  hairLo: "#141020",
  mouth: "#6d4147",
  eye: "#3a2a33",
  zit: "#c2505c",

  // 蚊
  bug: "#221c2e",
  bugHi: "#3d3552",
  bugEye: "#6b5f8a",
  bugRim: "#5a5280",
  wing: "#7d76ab",
  wingHi: "#c6c0ee",

  // 手
  hand: "#a87f68",
  handHi: "#d8b096",
  handLo: "#7a5847",
  handLine: "#2a1b16",
  handWrist: "#5e4234",
  handShadow: "#0a0810",

  // 効果
  splat: "#7d1a2b",
  splatHi: "#b3313f",
  white: "#ffffff",
  text: "#e6e2ff",
  textDim: "#8b85b0",
  warm: "#ffd9a8",
};

export const C = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, hex(v)]));

export const W = 320;
export const H = 180;
export const NIGHT = 45; // 1晩の秒数
