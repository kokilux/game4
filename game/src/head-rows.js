// 寝ている人の頭（36x26）。上を向いて（仰向けで天井を向いて）眠っている。
// 枕に顔を預け、上から見おろした形につぶして描く（目は上寄り、あごは短い）。
// 記号: # 輪郭 / H 髪 / h 髪のツヤ / k 髪の陰 / S 肌 / s 肌の陰 / d 肌の深い陰
//       b 眉 / E 閉じた目 / N 鼻の陰 / M 口
export const HEAD_ROWS = [
  "....................................",
  "....................................",
  ".................#######............",
  "..............###HHHHHHH###.........",
  "............##HHHHHHHHHHHHH##.......",
  "...........#HHHHHHHHHHhhhhHHH#......",
  "........#HHHHHHHHHHHHHHHHHHHHHHH#...",
  ".......#HHHHHHHHHHhhHHHHHHHHHHSSS#..",
  "......#HHHHHSSSSSSSSHSSSSSSSSSSSSS#.",
  "......#HHHHHSSSSSSSSSSSSSSSSSSSSSS#.",
  "......#HHHHHbbbbbSSSSSSbbbbbSSSSSS#.",
  ".....#HHHHHHSSSSSSSSSSSSSSSSSSSSSSS#",
  "......#HHHSSESSSESSSSSSESSSEssssss#.",
  "......#HHHSSEEEEESSSSSSEEEEEssssss#.",
  "......#HHHSSsSSSSSSSSSSSSSSSssssss#.",
  "......#HHHHSsSSSSSSSSSSSSSSSssssss#.",
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

export const HEAD_ANCHOR = { x: 20, y: 15 };
export const HEAD_EAR = { x: 13, y: 17 };
