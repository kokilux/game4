// 横向きに寝ている人の頭（36×30）。顔は枕の上でこちらへ向き、目は閉じている。
// 記号: # 輪郭 / H 髪 / h 髪のツヤ / k 髪の陰 / S 肌 / s 肌の陰 / d 肌の深い陰
//       b 眉 / E 閉じた目 / N 鼻の陰 / M 口
export const HEAD_ROWS = [
  "....................................",
  "....................................",
  ".................#######............",
  "..............###HHHHHHH###.........",
  "............##HHHHHHHHHHHHH##.......",
  "...........#HHHHHHHHHHhhhhHHH#......",
  "..........#HHHHHhhhhHHHHHHHHHH#.....",
  ".........#HHHHHHHHHHHHHHHHHHHHH#....",
  "........#HHHHHHHHHHHHHHHHHHHHHHH#...",
  ".......#HHHHHHHHHHhhHHHHHHHHHHSSS#..",
  ".......#HHHHSShHHHHHHHHHHHHSSSSSS#..",
  "......#HHHHHSSSSSHHHHHHHSSSSSSSSSS#.",
  "......#HHHHHSSSSSSSSHSSSSSSSSSSSSS#.",
  "......#HHHHHSSSSSSSSSSSSSSSSSSSSSS#.",
  "......#HHHHHSSSbbbbSSSSbbbbSSSSSSS#.",
  ".....#HHHHHHSSSSSSSSSSSSSSSSSSSSSSS#",
  "......#HHHHSSSESSSESSSESSSESssssss#.",
  "......#HHHHSNNSEEEESSSSEEEESssssss#.",
  "......#HHHHSSNSSSSSSSSSSSSSSssssss#.",
  "......#HHHHSSNSSSSSSSSSSSSSSssssss#.",
  ".......#HHHSSsssSSSNSSSSSSSSsssss#..",
  ".......#HHHSSsssSSSSNSSSSSSSsssss#..",
  "........#HHHHHssSMSSSSMSSSSSssss#...",
  ".........#HHHHssSSMMMMSSSSSSsss#....",
  "..........#HHHssssssssssssssSS#.....",
  "...........#kkssssssssssssssS#......",
  "............##kssssssssssss##.......",
  "..............###SSSSSSS###.........",
  ".................#######............",
  "....................................",
];

// 顔の中心（スプライト内の座標）。
export const HEAD_ANCHOR = { x: 20, y: 17 };
// 耳の位置（蚊が狙う）. 
export const HEAD_EAR = { x: 13, y: 18 };
