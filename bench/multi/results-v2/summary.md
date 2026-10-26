| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 21.0 / 22 | 0.0 | 3 / 3 | $0.16 | 1.7 | 9 | 5k | 213k | M1:3 M2:3 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:2 M21:1 M22:3 |
| sonnet | control | 3 | 19.3 / 22 | 0.0 | 3 / 3 | $0.20 | 1.7 | 10 | 8k | 232k | M1:1 M2:0 M3:3 M4:3 M5:3 M6:0 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:3 |
| opus | starchy | 3 | 21.0 / 22 | 0.0 | 3 / 3 | $0.74 | 3.5 | 22 | 15k | 542k | M1:3 M2:1 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:2 M22:3 |
| opus | control | 3 | 21.0 / 22 | 0.7 | 2 / 3 | $0.80 | 3.7 | 21 | 16k | 530k | M1:3 M2:0 M3:3 M4:3 M5:3 M6:3 M7:3 M8:3 M9:3 M10:3 M11:3 M12:3 M13:3 M14:3 M15:3 M16:3 M17:3 M18:3 M19:3 M20:3 M21:3 M22:3 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 21 | 1 | index: menu button hidden at 1400px, shown at 500px; index: nav links hidden at 500px; menu: menu button hidden at 1400px, shown at 500px; menu: nav links hidden at 500px; cakes: menu button hidden at 1400px, shown at 500px; cakes: nav links hidden at 500px; catering: menu button hidden at 1400px, shown at 500px; catering: nav links hidden at 500px; about: menu button hidden at 1400px, shown at 500px; about: nav links hidden at 500px; visit: menu button hidden at 1400px, shown at 500px; visit: nav links hidden at 500px | $0.87 | 3.4 | 20 | 0k | 18k | 452k | 53k | 0 | 0 | 0 |
| opus-control-2 | 21 | 0 | kept | $0.76 | 3.8 | 20 | 0k | 16k | 493k | 42k | 0 | 0 | 0 |
| opus-control-3 | 21 | 1 | kept | $0.77 | 3.9 | 22 | 0k | 14k | 454k | 48k | 0 | 0 | 0 |
| opus-starchy-1 | 22 | 0 | kept | $0.70 | 3.6 | 21 | 0k | 13k | 476k | 43k | 7 | 0 | 0 |
| opus-starchy-2 | 20 | 0 | kept | $0.76 | 3.4 | 23 | 0k | 15k | 534k | 45k | 6 | 0 | 0 |
| opus-starchy-3 | 21 | 0 | kept | $0.75 | 3.4 | 21 | 0k | 16k | 443k | 44k | 7 | 0 | 0 |
| sonnet-control-1 | 19 | 0 | kept | $0.19 | 1.3 | 9 | 0k | 8k | 160k | 23k | 0 | 0 | 0 |
| sonnet-control-2 | 20 | 0 | kept | $0.23 | 2.7 | 11 | 0k | 10k | 233k | 27k | 0 | 0 | 0 |
| sonnet-control-3 | 19 | 0 | kept | $0.20 | 1.2 | 9 | 0k | 7k | 202k | 26k | 0 | 0 | 0 |
| sonnet-starchy-1 | 21 | 0 | kept | $0.15 | 1.4 | 9 | 0k | 5k | 158k | 21k | 5 | 0 | 0 |
| sonnet-starchy-2 | 21 | 0 | kept | $0.16 | 2.1 | 10 | 0k | 5k | 219k | 23k | 8 | 0 | 0 |
| sonnet-starchy-3 | 21 | 0 | kept | $0.16 | 1.5 | 9 | 0k | 6k | 181k | 22k | 5 | 0 | 0 |
