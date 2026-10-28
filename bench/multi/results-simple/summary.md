| Model | Arm | Runs | Bugs fixed (mean) | Regressions (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 6 | 21.5 / 25 | 0.0 | 6 / 6 | $0.19 | 2.0 | 10 | 6k | 234k | M1:5 M2:4 M3:6 M4:6 M5:6 M6:5 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:5 M15:6 M16:6 M17:6 M18:6 M19:5 M20:6 M21:6 M22:5 M23:1 M24:1 M25:2 |
| sonnet | control | 6 | 20.2 / 25 | 0.3 | 6 / 6 | $0.12 | 0.9 | 6 | 5k | 110k | M1:1 M2:0 M3:6 M4:6 M5:6 M6:0 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:5 M15:6 M16:6 M17:6 M18:6 M19:4 M20:5 M21:6 M22:5 M23:5 M24:1 M25:5 |
| opus | starchy | 6 | 16.5 / 25 | 0.0 | 6 / 6 | $0.46 | 2.0 | 13 | 7k | 328k | M1:4 M2:4 M3:4 M4:4 M5:4 M6:4 M7:4 M8:4 M9:4 M10:4 M11:4 M12:4 M13:4 M14:4 M15:4 M16:4 M17:4 M18:4 M19:4 M20:4 M21:4 M22:4 M23:4 M24:3 M25:4 |
| opus | control | 6 | 22.7 / 25 | 0.5 | 3 / 6 | $0.62 | 2.9 | 18 | 12k | 415k | M1:5 M2:0 M3:6 M4:6 M5:6 M6:1 M7:6 M8:6 M9:6 M10:6 M11:6 M12:6 M13:6 M14:6 M15:6 M16:6 M17:6 M18:4 M19:6 M20:6 M21:6 M22:6 M23:6 M24:6 M25:6 |

| Run | Fixed | Regressions | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 22 | 0 | kept | $0.56 | 2.3 | 16 | 0k | 11k | 339k | 34k | 0 | 0 | 0 |
| opus-control-2 | 22 | 1 | kept | $0.74 | 4.4 | 22 | 0k | 15k | 534k | 41k | 0 | 0 | 0 |
| opus-control-3 | 24 | 1 | kept | $0.74 | 2.3 | 19 | 0k | 12k | 380k | 54k | 0 | 0 | 0 |
| opus-control-4 | 23 | 1 | index: menu button hidden at 1400px, shown at 500px; index: nav links hidden at 500px; menu: menu button hidden at 1400px, shown at 500px; menu: nav links hidden at 500px; cakes: menu button hidden at 1400px, shown at 500px; cakes: nav links hidden at 500px; catering: menu button hidden at 1400px, shown at 500px; catering: nav links hidden at 500px; about: menu button hidden at 1400px, shown at 500px; about: nav links hidden at 500px; visit: menu button hidden at 1400px, shown at 500px; visit: nav links hidden at 500px | $0.48 | 2.3 | 12 | 0k | 10k | 260k | 28k | 0 | 0 | 0 |
| opus-control-5 | 22 | 0 | index: menu button hidden at 1400px, shown at 500px; index: nav links hidden at 500px; index: page text unchanged; menu: menu button hidden at 1400px, shown at 500px; menu: nav links hidden at 500px; menu: page text unchanged; cakes: menu button hidden at 1400px, shown at 500px; cakes: nav links hidden at 500px; cakes: page text unchanged; catering: menu button hidden at 1400px, shown at 500px; catering: nav links hidden at 500px; catering: page text unchanged; about: menu button hidden at 1400px, shown at 500px; about: nav links hidden at 500px; about: page text unchanged; visit: menu button hidden at 1400px, shown at 500px; visit: nav links hidden at 500px; visit: page text unchanged | $0.56 | 2.2 | 20 | 0k | 10k | 278k | 39k | 0 | 0 | 0 |
| opus-control-6 | 23 | 0 | index: menu button hidden at 1400px, shown at 500px; index: nav links hidden at 500px; index: page text unchanged; menu: menu button hidden at 1400px, shown at 500px; menu: nav links hidden at 500px; menu: page text unchanged; cakes: menu button hidden at 1400px, shown at 500px; cakes: nav links hidden at 500px; cakes: page text unchanged; catering: menu button hidden at 1400px, shown at 500px; catering: nav links hidden at 500px; catering: page text unchanged; about: menu button hidden at 1400px, shown at 500px; about: nav links hidden at 500px; about: page text unchanged; visit: menu button hidden at 1400px, shown at 500px; visit: nav links hidden at 500px; visit: page text unchanged | $0.61 | 4.1 | 19 | 0k | 12k | 395k | 36k | 0 | 0 | 0 |
| opus-starchy-1 | 25 | 0 | kept | $0.62 | 2.3 | 16 | 0k | 9k | 302k | 46k | 12 | 0 | 0 |
| opus-starchy-2 | 0 | 0 | kept | $0.09 | 0.4 | 3 | 0k | 1k | 34k | 8k | 2 | 0 | 0 |
| opus-starchy-3 | 25 | 0 | kept | $0.67 | 3.1 | 21 | 0k | 10k | 506k | 45k | 18 | 0 | 0 |
| opus-starchy-4 | 24 | 0 | kept | $0.63 | 2.6 | 19 | 0k | 10k | 444k | 43k | 14 | 0 | 0 |
| opus-starchy-5 | 0 | 0 | kept | $0.07 | 0.4 | 2 | 0k | 1k | 20k | 6k | 1 | 0 | 0 |
| opus-starchy-6 | 25 | 0 | kept | $0.66 | 3 | 18 | 0k | 11k | 425k | 45k | 8 | 0 | 0 |
| sonnet-control-1 | 17 | 0 | kept | $0.15 | 1 | 7 | 0k | 4k | 111k | 24k | 0 | 0 | 0 |
| sonnet-control-2 | 19 | 0 | kept | $0.11 | 1 | 4 | 0k | 4k | 53k | 15k | 0 | 0 | 0 |
| sonnet-control-3 | 21 | 0 | kept | $0.13 | 0.9 | 6 | 0k | 5k | 96k | 17k | 0 | 0 | 0 |
| sonnet-control-4 | 21 | 0 | kept | $0.12 | 1 | 7 | 0k | 5k | 117k | 16k | 0 | 0 | 0 |
| sonnet-control-5 | 22 | 1 | kept | $0.12 | 0.8 | 5 | 0k | 4k | 73k | 17k | 0 | 0 | 0 |
| sonnet-control-6 | 21 | 1 | kept | $0.11 | 0.9 | 5 | 0k | 4k | 73k | 16k | 0 | 0 | 0 |
| sonnet-starchy-1 | 23 | 0 | kept | $0.28 | 2.2 | 13 | 0k | 7k | 283k | 43k | 10 | 0 | 0 |
| sonnet-starchy-2 | 22 | 0 | kept | $0.19 | 2.5 | 11 | 0k | 6k | 237k | 27k | 8 | 0 | 0 |
| sonnet-starchy-3 | 23 | 0 | kept | $0.24 | 2.7 | 9 | 0k | 7k | 226k | 36k | 6 | 0 | 0 |
| sonnet-starchy-4 | 23 | 0 | kept | $0.15 | 1.5 | 9 | 0k | 5k | 149k | 21k | 7 | 0 | 0 |
| sonnet-starchy-5 | 22 | 0 | kept | $0.21 | 2.4 | 12 | 0k | 7k | 248k | 30k | 7 | 0 | 0 |
| sonnet-starchy-6 | 16 | 0 | kept | $0.10 | 0.6 | 4 | 0k | 3k | 52k | 14k | 2 | 0 | 0 |
