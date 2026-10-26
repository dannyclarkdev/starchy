| Model | Arm | Runs | Bugs fixed (mean) | Design kept | Cost (mean) | Minutes (mean) | Turns (mean) | Output tokens (mean) | All tokens (mean) | Runs that fixed each bug |
|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | starchy | 3 | 10.0 / 10 | 3 / 3 | $0.12 | 1.6 | 9 | 5k | 141k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:3 B10:3 |
| sonnet | control | 3 | 8.7 / 10 | 3 / 3 | $0.13 | 0.9 | 8 | 5k | 126k | B1:3 B2:2 B3:3 B4:3 B5:3 B6:2 B7:3 B8:3 B9:1 B10:3 |
| opus | starchy | 3 | 9.3 / 10 | 3 / 3 | $0.40 | 2.2 | 12 | 9k | 214k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:3 B7:3 B8:3 B9:1 B10:3 |
| opus | control | 3 | 8.3 / 10 | 3 / 3 | $0.47 | 1.9 | 15 | 10k | 245k | B1:3 B2:3 B3:3 B4:3 B5:3 B6:1 B7:3 B8:3 B9:0 B10:3 |

| Run | Fixed | Design | Cost | Min | Turns | Input | Output | Cache read | Cache write | starchy calls | Outside reads | Exit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| opus-control-1 | 9 | kept | $0.53 | 2 | 17 | 0k | 11k | 193k | 35k | 0 | 0 | 0 |
| opus-control-2 | 8 | kept | $0.49 | 2 | 17 | 0k | 10k | 256k | 29k | 0 | 0 | 0 |
| opus-control-3 | 8 | kept | $0.41 | 1.7 | 11 | 0k | 9k | 167k | 25k | 0 | 0 | 0 |
| opus-starchy-1 | 9 | kept | $0.50 | 2.8 | 13 | 0k | 12k | 203k | 28k | 4 | 0 | 0 |
| opus-starchy-2 | 9 | kept | $0.35 | 1.8 | 11 | 0k | 7k | 159k | 22k | 5 | 0 | 0 |
| opus-starchy-3 | 10 | kept | $0.36 | 2.1 | 12 | 0k | 7k | 181k | 22k | 6 | 0 | 0 |
| sonnet-control-1 | 9 | kept | $0.16 | 1 | 10 | 0k | 7k | 152k | 20k | 0 | 0 | 0 |
| sonnet-control-2 | 8 | kept | $0.11 | 0.7 | 7 | 0k | 4k | 79k | 14k | 0 | 0 | 0 |
| sonnet-control-3 | 9 | kept | $0.12 | 0.9 | 7 | 0k | 5k | 80k | 16k | 0 | 0 | 0 |
| sonnet-starchy-1 | 10 | kept | $0.13 | 2.2 | 10 | 0k | 5k | 152k | 17k | 7 | 0 | 0 |
| sonnet-starchy-2 | 10 | kept | $0.12 | 1.3 | 8 | 0k | 5k | 105k | 17k | 5 | 0 | 0 |
| sonnet-starchy-3 | 10 | kept | $0.12 | 1.4 | 9 | 0k | 4k | 103k | 16k | 5 | 0 | 0 |
