### Technical stuff

- The left and right black bars that were removed are actually part of the FIX layer (the layer used for the interface, which is always displayed above everything else). The game was designed for a 320×224 resolution (the full Neo Geo resolution), but it uses the `FIX_CLEAR` BIOS routine, which clears the interface and also adds a black column to the left and right sides of the screen ([see here](https://wiki.neogeodev.org/index.php/FIX_CLEAR)). I simply added a small routine that runs right after `FIX_CLEAR` to restore these columns with transparent tiles, so you can now enjoy the full 320×224 picture.

### Discoveries

- While working on the game, I discovered that when the game detects a non-Japanese BIOS in MVS mode, it automatically adds +2 to the difficulty set by the operator. Just because.

- I also found an undocumented cheat code that had never been documented before: on the Data East logo, quickly press [↓] [↑] [←] [←] [B] [B] [A] [B]. This unlocks a secret menu that lets you choose your starting stage, including the mini-games. With this romhack, however, you won't have to bother with it. :)

- The lower-right tile of the title screen background is incorrect. It appears to be a copy of the tree tile seen above, and seems to be the result of a copy/paste mistake, as it also contains the tree's palette. The correct tile is present in the ROM but is never used.

- There is a small "bug" in the "GAME MODE SELECT" main menu. It can be controlled by the player who didn't press Start on the title screen, but remains tied to the other player. For example, if Player 1 presses Start, goes to "VS COMPUTER", and Player 2 presses A, it will launch Player 1 vs. Computer. The "MODE SELECT" menu doesn't have this bug.

- The flashing screen before the match is actually composed of 4 frames, but every other frame is blacked out, meaning that only 2 of the 4 frames are actually displayed, leaving the others eternally hidden in the C ROM.

- The game dynamically adjusts the difficulty based on your performance during a match, making the CPU stronger or weaker by up to 2 points. On top of that, after each match, the difficulty is increased by 1 on EASY or NORMAL, and by 2 on HARD, MVS, or EXPERT. In MVS mode, the difficulty is always increased by 2.