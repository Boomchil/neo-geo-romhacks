# Windjammers - Endless Breeze

Windjammers (a.k.a. *Flying Power Disc*), while not a fighting game, is without a doubt one of the Neo•Geo's best versus games. It's a real treat in two-player mode, and hasn't aged a bit in 30 years. But for me it has always suffered from one big flaw: rounds end far too quickly.

12 points is way too few, and if the two players are lucky enough to pull off a gorgeous rally, it's the ridiculous 30-second timer that spoils the party.

Small fixes, big difference!

## List of Changes

### Gameplay

- The round duration can be configured to **30**, **45**, **60**, **75**, or **90** seconds, or set to **infinite**.
- The number of points required to win a round can be configured to **12**, **15**, **20**, **30**, **50**, **75**, or **99**.

### Others
- **Dog Distance** and **Flying Disc Bowling** are instantly playable from the main menu. Please note that they can only be played by Player 1.
- **EXPERT difficulty** is unlocked by default if you're looking for a *high-flying* challenge.
- **Supersonic Mode** is avalaible if you're looking for a very fast paced VS mode. When enabled, the disc is thrown at twice its base speed.
- The awful, eye-straining flashing background shown before a match has been replaced with a softer one.
- The left and right black bars have been removed, giving you a glorious 16-pixel wider picture!
- All menu and minigame timers have been disabled.
- The "Add +2 to difficulty" logic, applied when the system is in MVS mode and the region is not set to Japan, has been disabled.

### Bugfix
- Fixed the incorrect lower-right tile of the title backdrop, visible when the Data East logo is displayed.
- Some incorrect pixels were removed, alongside a f

### Gallery

```gallery
media/title.png  
media/black_bars.png -> media/no_black_bars.png No more black bars, for a whopping 5,26% more pixels!
media/config.png Epic fights incoming
media/main_menu.png Play the awesome mini-games directly
media/wj_no_more_flash.mp4 Yay! No more seizure!
```

## Changelog

**v1.2.0**

- New "Supersonic Mode" as requested, which make each shot twice as fast (usually triggered by pressing A *right* after receiving the disc). Should be used specifically on VS mode as it kinda kills the fun when playing against the CPU ^^'

- The original VS flashing screen was *\*a little\** over the top, but the black screen was not really in the Windjammers spirit. I went with an in-between solution that locks the flashing screen to the first frame (technically the animmation still plays, but I duplicated the first frame four times so it always displays the same thing), removes the odd-numbered black frames, and changes the palette's brightest colors each frame to simulate a glowing effect.

- Fixed the original logo which had some [bad pixel colors](https://github.com/Boomchil/neo-geo-romhacks/issues/1) (Thanks Tuxosaurus for pointing it out!).

- Fixed some details in the character selection screen (bad shadows and useless dots). Replaced the misleading "For Beginner", "For Medium" & "For Expert" labels with "Light", "Medium" & "Heavy". Now it also displays characters' full name.

**v1.1.0**

- Initial release, iterated from my ["Windjammers - Let me play longer"](https://github.com/Boomchil/wjammers-lmpl) romhack.



