| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 6 | 23.7 / 25 | 0.0 | 6 / 6 | $0.17 | 2.4 | 13 | 6k | 243k | M1:6 M2:4 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:6 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:2 M24:6 M25:4 |
| opus | starchy | 6 | 25.0 / 25 | 0.0 | 6 / 6 | $0.62 | 3.3 | 20 | 10k | 469k | M1:6 M2:6 M3:6 M4:6 M5:6 M6:6 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:6 M15:6 M16:6 M17:6 M18:6 M19:6 M20:6 M21:6 M22:6 M23:6 M24:6 M25:6 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-starchy-1 | 25 | 0 | kept | $0.64 | 3.2 | 22 | 0k | 10k | 493k | 42k | 12 | 0 | 0 |
| opus-starchy-2 | 25 | 0 | kept | $0.60 | 2.8 | 18 | 0k | 10k | 373k | 40k | 13 | 0 | 0 |
| opus-starchy-3 | 25 | 0 | kept | $0.55 | 2.7 | 18 | 0k | 9k | 302k | 40k | 14 | 0 | 0 |
| opus-starchy-4 | 25 | 0 | kept | $0.63 | 2.9 | 19 | 0k | 11k | 356k | 42k | 14 | 0 | 0 |
| opus-starchy-5 | 25 | 0 | kept | $0.65 | 5.2 | 23 | 0k | 10k | 476k | 43k | 19 | 0 | 0 |
| opus-starchy-6 | 25 | 0 | kept | $0.68 | 3.1 | 20 | 0k | 12k | 499k | 44k | 14 | 0 | 0 |
| sonnet-starchy-1 | 24 | 0 | kept | $0.17 | 1.7 | 14 | 0k | 5k | 216k | 26k | 10 | 0 | 0 |
| sonnet-starchy-2 | 24 | 0 | kept | $0.15 | 1.9 | 11 | 0k | 5k | 173k | 20k | 8 | 0 | 0 |
| sonnet-starchy-3 | 24 | 0 | kept | $0.20 | 2.1 | 14 | 0k | 7k | 211k | 27k | 11 | 0 | 0 |
| sonnet-starchy-4 | 24 | 0 | kept | $0.14 | 1.9 | 10 | 0k | 4k | 171k | 22k | 7 | 0 | 0 |
| sonnet-starchy-5 | 23 | 0 | kept | $0.20 | 3 | 15 | 0k | 7k | 287k | 25k | 10 | 0 | 0 |
| sonnet-starchy-6 | 23 | 0 | kept | $0.18 | 3.5 | 15 | 0k | 6k | 226k | 23k | 14 | 0 | 0 |
