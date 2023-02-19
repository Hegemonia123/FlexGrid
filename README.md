# FlexGrid

A feature rich window tiling extension for KDE. The goal is to provide more functionality compared to the default corner tiling feature, while being more simple than an actual tiling WM. Especially useful with ultrawide or large monitor.

Inspired by Wintile Gnome extension: https://github.com/fmstrat/wintile

![Screenshot](/screenshot.jpg)

https://user-images.githubusercontent.com/102908263/167155213-5471ee08-e51e-441f-b7d9-e18e253da3da.mp4

## Features

- Tile / put windows to grid.
- Simple usage. Just few hotkeys.
- Multiple grid layouts with various slot sizes: 3x3, 4x3, 2x2...
- Resize slot by resizing tiled window.
- Window can cover multiple slots.
- Select separate layout for each screen/desktop/activity.
- Remember and restore selected layout when external monitor is plugged back in.
- Gaps between windows.
- Ability to hide window borders.
- Cascade effect for windows in the same slot.
- Fully configurable (by editing the script file).

## Usage

- Put window to the grid and move it: `Meta+<arrow key>`
- Change grid layout: `Ctrl+Meta+<left or right arrow key>`
- Restore original window geometry, i.e. untile: `Meta+end` or by grabbing and moving the window.

## Configuration

1. Edit `layouts` variable in the beginning of `~/.local/share/kwin/scripts/flexGrid/contents/code/main.js`. 
2. Kwin restart is required for the changes to take effect. Hit `Alt+f2` and type `kwin --replace`.
3. **BACKUP THE CHANGES YOU MAKE, BECAUSE THE NEXT UPDATE WILL OVERRIDE THEM!**

## Notes

- Windows that are selected to be visible on all virtual desktops or multiple activities may behave unexpectedly, since they have their own grid layouts.
- Hotkeys conflict with the default corner tiling. You may have to remove them to make FlexGrid work.
