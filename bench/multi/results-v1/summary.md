| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 16.0 / 19 | 0.0 | 3 / 3 | $0.17 | 1.6 | 12 | 6k | 287k | M1:3 M2:3 M3:3 M4:3 M5:3 M6:3 M7:3 M8:0 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:0 M16:3 M17:3 M18:3 M19:0 |
| sonnet | control | 3 | 16.7 / 19 | 0.0 | 3 / 3 | $0.17 | 1.1 | 6 | 7k | 130k | M1:2 M2:0 M3:3 M4:3 M5:3 M6:0 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 |
| opus | starchy | 3 | 19.0 / 19 | 0.0 | 3 / 3 | $0.57 | 2.6 | 18 | 11k | 344k | M1:3 M2:3 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 |
| opus | control | 3 | 17.3 / 19 | 0.0 | 3 / 3 | $0.84 | 3.3 | 21 | 17k | 635k | M1:3 M2:0 M3:3 M4:3 M5:3 M6:1 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 17 | - | kept | $0.89 | 3.8 | 23 | 0k | 17k | 735k | 50k | 0 | 0 | 0 |
| opus-control-2 | 18 | - | kept | $0.77 | 2.9 | 17 | 0k | 15k | 459k | 47k | 0 | 0 | 0 |
| opus-control-3 | 17 | - | kept | $0.87 | 3.2 | 22 | 0k | 18k | 512k | 52k | 0 | 0 | 0 |
| opus-starchy-1 | 19 | - | kept | $0.60 | 3 | 20 | 0k | 11k | 295k | 41k | 6 | 0 | 0 |
| opus-starchy-2 | 19 | - | kept | $0.61 | 2.7 | 18 | 0k | 12k | 371k | 37k | 5 | 0 | 0 |
| opus-starchy-3 | 19 | - | kept | $0.51 | 2.1 | 17 | 0k | 10k | 222k | 35k | 4 | 0 | 0 |
| sonnet-control-1 | 17 | - | kept | $0.16 | 1 | 6 | 0k | 6k | 112k | 22k | 0 | 0 | 0 |
| sonnet-control-2 | 17 | - | kept | $0.20 | 1.3 | 5 | 0k | 9k | 90k | 25k | 0 | 0 | 0 |
| sonnet-control-3 | 16 | - | kept | $0.14 | 0.9 | 6 | 0k | 5k | 101k | 19k | 0 | 0 | 0 |
| sonnet-starchy-1 | 16 | - | kept | $0.18 | 1.8 | 14 | 0k | 6k | 318k | 23k | 11 | 0 | 0 |
| sonnet-starchy-2 | 16 | - | kept | $0.17 | 1.5 | 10 | 0k | 6k | 207k | 22k | 7 | 0 | 0 |
| sonnet-starchy-3 | 16 | - | kept | $0.16 | 1.5 | 13 | 0k | 5k | 254k | 21k | 8 | 0 | 0 |
