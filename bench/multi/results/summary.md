| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 6 | 24.0 / 25 | 0.0 | 6 / 6 | $0.17 | 1.7 | 9 | 6k | 225k | M1:6 M2:6 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:5 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:1 M25:6 |
| sonnet | control | 6 | 21.7 / 25 | 0.8 | 6 / 6 | $0.20 | 1.5 | 9 | 8k | 215k | M1:4 M2:0 M3:6 M4:6 M5:6 M6:1 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:4 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:1 M25:6 |
| opus | starchy | 6 | 24.0 / 25 | 0.0 | 6 / 6 | $0.66 | 3.3 | 18 | 13k | 422k | M1:6 M2:4 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:5 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:3 M25:6 |
| opus | control | 6 | 22.7 / 25 | 0.8 | 6 / 6 | $0.78 | 3.5 | 20 | 16k | 517k | M1:6 M2:0 M3:6 M4:6 M5:6 M6:0 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:5 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:5 M25:6 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 23 | 1 | kept | $0.85 | 3.6 | 18 | 0k | 19k | 450k | 49k | 0 | 0 | 0 |
| opus-control-2 | 23 | 1 | kept | $0.76 | 3.1 | 19 | 0k | 15k | 493k | 44k | 0 | 0 | 0 |
| opus-control-3 | 22 | 0 | kept | $0.80 | 3.2 | 17 | 0k | 16k | 385k | 51k | 0 | 0 | 0 |
| opus-control-4 | 23 | 1 | kept | $0.66 | 2.6 | 14 | 0k | 14k | 367k | 38k | 0 | 0 | 0 |
| opus-control-5 | 23 | 1 | kept | $0.83 | 3.3 | 23 | 0k | 17k | 528k | 48k | 0 | 0 | 0 |
| opus-control-6 | 22 | 1 | kept | $0.76 | 5.3 | 26 | 0k | 16k | 510k | 43k | 0 | 0 | 0 |
| opus-starchy-1 | 24 | 0 | kept | $0.82 | 4.3 | 27 | 0k | 16k | 567k | 48k | 10 | 0 | 0 |
| opus-starchy-2 | 24 | 0 | kept | $0.64 | 3 | 19 | 0k | 13k | 354k | 39k | 5 | 0 | 0 |
| opus-starchy-3 | 23 | 0 | kept | $0.73 | 3.8 | 19 | 0k | 15k | 410k | 44k | 13 | 0 | 0 |
| opus-starchy-4 | 23 | 0 | kept | $0.54 | 2.4 | 13 | 0k | 10k | 263k | 35k | 10 | 0 | 0 |
| opus-starchy-5 | 25 | 0 | kept | $0.66 | 3.1 | 15 | 0k | 13k | 349k | 42k | 12 | 0 | 0 |
| opus-starchy-6 | 25 | 0 | kept | $0.57 | 2.9 | 13 | 0k | 11k | 263k | 36k | 11 | 0 | 0 |
| sonnet-control-1 | 21 | 1 | kept | $0.20 | 2 | 9 | 0k | 8k | 196k | 25k | 0 | 0 | 0 |
| sonnet-control-2 | 22 | 1 | kept | $0.22 | 1.5 | 10 | 0k | 9k | 238k | 27k | 0 | 0 | 0 |
| sonnet-control-3 | 23 | 1 | kept | $0.20 | 1.5 | 7 | 0k | 8k | 149k | 26k | 0 | 0 | 0 |
| sonnet-control-4 | 23 | 0 | kept | $0.22 | 1.5 | 10 | 0k | 9k | 236k | 26k | 0 | 0 | 0 |
| sonnet-control-5 | 20 | 1 | kept | $0.18 | 1.4 | 8 | 0k | 7k | 131k | 23k | 0 | 0 | 0 |
| sonnet-control-6 | 21 | 1 | kept | $0.19 | 1.2 | 7 | 0k | 7k | 141k | 25k | 0 | 0 | 0 |
| sonnet-starchy-1 | 24 | 0 | kept | $0.23 | 2.3 | 12 | 0k | 8k | 303k | 28k | 9 | 0 | 0 |
| sonnet-starchy-2 | 24 | 0 | kept | $0.16 | 1.6 | 9 | 0k | 5k | 189k | 22k | 6 | 0 | 0 |
| sonnet-starchy-3 | 23 | 0 | kept | $0.14 | 1.5 | 8 | 0k | 4k | 133k | 21k | 5 | 0 | 0 |
| sonnet-starchy-4 | 25 | 0 | kept | $0.14 | 1.3 | 9 | 0k | 4k | 174k | 20k | 5 | 0 | 0 |
| sonnet-starchy-5 | 24 | 0 | kept | $0.19 | 2.1 | 10 | 0k | 7k | 221k | 24k | 8 | 0 | 0 |
| sonnet-starchy-6 | 24 | 0 | kept | $0.15 | 1.3 | 8 | 0k | 5k | 161k | 22k | 6 | 0 | 0 |
