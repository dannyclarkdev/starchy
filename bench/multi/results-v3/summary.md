| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 21.0 / 22 | 0.0 | 3 / 3 | $0.17 | 2.0 | 9 | 6k | 227k | M1:3 M2:2 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:1 |
| sonnet | control | 3 | 19.3 / 22 | 0.3 | 3 / 3 | $0.20 | 1.6 | 9 | 8k | 218k | M1:2 M2:0 M3:3 M4:3 M5:3 M6:0 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:2 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:3 |
| opus | starchy | 3 | 21.3 / 22 | 0.0 | 3 / 3 | $0.69 | 3.1 | 19 | 13k | 505k | M1:3 M2:1 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:3 |
| opus | control | 3 | 20.0 / 22 | 0.3 | 3 / 3 | $0.89 | 4.5 | 19 | 18k | 602k | M1:3 M2:0 M3:3 M4:3 M5:3 M6:0 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:3 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 20 | 0 | kept | $0.97 | 4.3 | 21 | 0k | 20k | 618k | 57k | 0 | 0 | 0 |
| opus-control-2 | 20 | 0 | kept | $0.99 | 6.1 | 21 | 0k | 20k | 649k | 57k | 0 | 0 | 0 |
| opus-control-3 | 20 | 1 | kept | $0.70 | 3 | 15 | 0k | 14k | 325k | 45k | 0 | 0 | 0 |
| opus-starchy-1 | 21 | 0 | kept | $0.68 | 3.2 | 19 | 0k | 13k | 424k | 41k | 5 | 0 | 0 |
| opus-starchy-2 | 21 | 0 | kept | $0.75 | 3.4 | 21 | 0k | 15k | 521k | 44k | 14 | 0 | 0 |
| opus-starchy-3 | 22 | 0 | kept | $0.65 | 2.8 | 18 | 0k | 12k | 403k | 40k | 12 | 0 | 0 |
| sonnet-control-1 | 20 | 1 | kept | $0.17 | 1.2 | 6 | 0k | 7k | 105k | 21k | 0 | 0 | 0 |
| sonnet-control-2 | 18 | 0 | kept | $0.25 | 2.3 | 13 | 0k | 10k | 312k | 30k | 0 | 0 | 0 |
| sonnet-control-3 | 20 | 0 | kept | $0.19 | 1.3 | 7 | 0k | 8k | 136k | 23k | 0 | 0 | 0 |
| sonnet-starchy-1 | 21 | 0 | kept | $0.17 | 2.2 | 9 | 0k | 6k | 193k | 23k | 7 | 0 | 0 |
| sonnet-starchy-2 | 22 | 0 | kept | $0.18 | 2.3 | 11 | 0k | 6k | 243k | 23k | 8 | 0 | 0 |
| sonnet-starchy-3 | 20 | 0 | kept | $0.16 | 1.5 | 8 | 0k | 6k | 161k | 22k | 6 | 0 | 0 |
