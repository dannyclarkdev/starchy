| Model | Arm | Runs | Bugs fixed (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 9.7 / 10 | 3 / 3 | $0.11 | 0.8 | 6 | 4k | 93k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:2 B10:3 |
| sonnet | control | 3 | 7.7 / 10 | 3 / 3 | $0.13 | 0.9 | 8 | 5k | 117k | B1:3 B2:2 B3:3 B4:3 B5:1 B6:2 B7:3 B8:3 B9:0 B10:3 |
| opus | starchy | 3 | 9.3 / 10 | 3 / 3 | $0.47 | 1.8 | 16 | 10k | 321k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:1 B10:3 |
| opus | control | 3 | 9.3 / 10 | 3 / 3 | $0.49 | 2.2 | 14 | 11k | 244k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:1 B10:3 |

| Run | Fixed | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 9 | kept | $0.41 | 1.6 | 12 | 0k | 9k | 138k | 24k | 0 | 0 | 0 |
| opus-control-2 | 9 | kept | $0.38 | 1.6 | 11 | 0k | 8k | 156k | 22k | 0 | 0 | 0 |
| opus-control-3 | 10 | kept | $0.68 | 3.5 | 18 | 0k | 15k | 320k | 38k | 0 | 0 | 0 |
| opus-starchy-1 | 9 | kept | $0.51 | 2 | 19 | 0k | 11k | 323k | 29k | 7 | 0 | 0 |
| opus-starchy-2 | 10 | kept | $0.49 | 1.9 | 16 | 0k | 10k | 284k | 29k | 6 | 0 | 0 |
| opus-starchy-3 | 9 | kept | $0.40 | 1.6 | 12 | 0k | 8k | 245k | 23k | 6 | 0 | 0 |
| sonnet-control-1 | 8 | kept | $0.10 | 0.6 | 5 | 0k | 4k | 39k | 14k | 0 | 0 | 0 |
| sonnet-control-2 | 8 | kept | $0.14 | 0.9 | 8 | 0k | 6k | 104k | 17k | 0 | 0 | 0 |
| sonnet-control-3 | 7 | kept | $0.14 | 1.3 | 10 | 0k | 6k | 147k | 17k | 0 | 0 | 0 |
| sonnet-starchy-1 | 10 | kept | $0.11 | 0.8 | 6 | 0k | 4k | 61k | 15k | 3 | 0 | 0 |
| sonnet-starchy-2 | 9 | kept | $0.11 | 0.9 | 8 | 0k | 4k | 103k | 15k | 5 | 0 | 0 |
| sonnet-starchy-3 | 10 | kept | $0.10 | 0.7 | 4 | 0k | 4k | 59k | 14k | 3 | 0 | 0 |
