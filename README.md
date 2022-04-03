# FlexGrid

A flexible grid system for KDE.

![Screenshot](/screenshot.jpg)


## Features
- Simple usage. Just few hotkeys.
- Multiple grid layouts. 
- Select separate layout for each screen/desktop/activity.
- Gaps between windows.
- Ability to hide window borders.
- Cascade effect for windows in the same slot.
- Fully configurable.


## Usage
- Put window to the grid and move it: `Meta+<arrow key>`
- Change grid layout: `Ctrl+Meta+<left or right arrow key>`
- Restore original window geometry: `Meta+end` or by grabbing and moving the window.


## Configuration
Edit `layouts` variable in the beginning of `~/.local/share/kwin/scripts/flexGrid/contents/code/main.js`. Kwin restart is required for the changes to take effect. Hit `Alt+f2` and type `kwin --replace`.

## Notes 
- Windows that are selected to be visible on all virtual desktops or multiple activities may behave unexpectedly, since they have their own grid layouts.
- Hotkeys conflict with the default corner tiling. You may have to remove them to make FlexGrid work.
