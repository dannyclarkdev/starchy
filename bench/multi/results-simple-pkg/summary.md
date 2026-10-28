| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 6 | 23.5 / 25 | 0.0 | 6 / 6 | $0.17 | 1.9 | 9 | 6k | 215k | M1:6 M2:4 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:6 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:4 M24:2 M25:5 |
| opus | starchy | 6 | 24.5 / 25 | 0.0 | 6 / 6 | $0.63 | 2.9 | 18 | 10k | 456k | M1:6 M2:5 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:6 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:4 M25:6 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-starchy-1 | 25 | 0 | kept | $0.60 | 2.9 | 20 | 0k | 11k | 411k | 38k | 14 | 0 | 0 |
| opus-starchy-2 | 23 | 0 | kept | $0.68 | 3.8 | 20 | 0k | 11k | 498k | 45k | 17 | 0 | 0 |
| opus-starchy-3 | 25 | 0 | kept | $0.67 | 2.8 | 16 | 0k | 10k | 359k | 49k | 12 | 0 | 0 |
| opus-starchy-4 | 25 | 0 | kept | $0.52 | 2.4 | 16 | 0k | 8k | 357k | 37k | 12 | 0 | 0 |
| opus-starchy-5 | 25 | 0 | kept | $0.68 | 2.9 | 17 | 0k | 11k | 368k | 48k | 13 | 0 | 0 |
| opus-starchy-6 | 24 | 0 | kept | $0.65 | 2.8 | 20 | 0k | 11k | 425k | 42k | 15 | 0 | 0 |
| sonnet-starchy-1 | 25 | 0 | kept | $0.14 | 2 | 8 | 0k | 5k | 138k | 20k | 4 | 0 | 0 |
| sonnet-starchy-2 | 24 | 0 | kept | $0.18 | 2.1 | 9 | 0k | 6k | 187k | 26k | 7 | 0 | 0 |
| sonnet-starchy-3 | 22 | 0 | kept | $0.19 | 2 | 12 | 0k | 7k | 244k | 26k | 8 | 0 | 0 |
| sonnet-starchy-4 | 24 | 0 | kept | $0.16 | 1.5 | 8 | 0k | 5k | 148k | 24k | 6 | 0 | 0 |
| sonnet-starchy-5 | 23 | 0 | kept | $0.16 | 1.8 | 8 | 0k | 5k | 154k | 23k | 5 | 0 | 0 |
| sonnet-starchy-6 | 23 | 0 | kept | $0.20 | 2.2 | 10 | 0k | 6k | 237k | 28k | 8 | 0 | 0 |
