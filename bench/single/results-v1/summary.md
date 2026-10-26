| Model | Arm | Runs | Bugs fixed (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 8.3 / 10 | 2 / 3 | $0.15 | 1.5 | 10 | 5k | 201k | B1:3 B2:3 B3:2 B4:2 B5:3 B6:3 B7:3 B8:3 B9:0 B10:3 |
| sonnet | control | 3 | 8.3 / 10 | 3 / 3 | $0.13 | 0.8 | 7 | 5k | 108k | B1:3 B2:3 B3:3 B4:3 B5:2 B6:1 B7:3 B8:3 B9:1 B10:3 |
| opus | starchy | 3 | 9.0 / 10 | 3 / 3 | $0.43 | 2.3 | 13 | 7k | 307k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:0 B10:3 |
| opus | control | 3 | 9.0 / 10 | 3 / 3 | $0.52 | 2.1 | 16 | 11k | 269k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:0 B10:3 |

| Run | Fixed | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 9 | kept | $0.57 | 2 | 14 | 0k | 11k | 185k | 39k | 0 | 0 | 0 |
| opus-control-2 | 9 | kept | $0.50 | 2 | 19 | 0k | 11k | 278k | 28k | 0 | 0 | 0 |
| opus-control-3 | 9 | kept | $0.47 | 2.2 | 14 | 0k | 11k | 217k | 26k | 0 | 0 | 0 |
| opus-starchy-1 | 9 | kept | $0.53 | 2.6 | 17 | 0k | 9k | 355k | 36k | 10 | 0 | 0 |
| opus-starchy-2 | 9 | kept | $0.32 | 2.1 | 10 | 0k | 6k | 197k | 20k | 9 | 0 | 0 |
| opus-starchy-3 | 9 | kept | $0.42 | 2.3 | 12 | 0k | 8k | 262k | 26k | 8 | 0 | 0 |
| sonnet-control-1 | 9 | kept | $0.17 | 0.9 | 10 | 0k | 6k | 139k | 25k | 0 | 0 | 0 |
| sonnet-control-2 | 9 | kept | $0.10 | 0.7 | 5 | 0k | 4k | 38k | 14k | 0 | 0 | 0 |
| sonnet-control-3 | 7 | kept | $0.11 | 0.7 | 7 | 0k | 4k | 78k | 15k | 0 | 0 | 0 |
| sonnet-starchy-1 | 8 | kept | $0.15 | 1.3 | 8 | 0k | 4k | 135k | 24k | 7 | 0 | 0 |
| sonnet-starchy-2 | 8 | grid is 2 columns at 900px | $0.14 | 1.3 | 8 | 0k | 5k | 149k | 19k | 7 | 0 | 0 |
| sonnet-starchy-3 | 9 | kept | $0.16 | 1.8 | 14 | 0k | 6k | 242k | 19k | 11 | 0 | 0 |
