// BUG: Restoring window after display change moves window outside screen.



/**
 * Grid layout configurations.
 * There should be at least one configuration, but no upper limit exist.
 * The first one is used by default before the layout have been switched manually.
 * 
 * vEdges and hEdges contain horizonal and vertical grid cell edges relative to screen.
 * Both arrays must contain at least two values, but no upper limit exist.
 * Values must be in incresing order.
 * Values should be between 0 and 1 to keep the grid within screen.
 * 0 = left (or top) edge of the sceen
 * 1 = right (or bottom) edge of the sceen
 * 
 * gap controls the space between windows (and screen edges).
 * The value is in pixels.
 * 
 * noBorder controls whether window frames should be removed.
 * 
 * cascadeIndent controls the indent size in cascade effect.
 * The value is in pixels.
 * 
 * @example 
 * // Even 2x2 grid without gaps, window frames and cascade effect.
 * {
 *      vEdges: [0, 0.5, 1],
 *      hEdges: [0, 0.5, 1],
 *      gap: 0,
 *      noBorder: true,
 *      cascadeIndent: 0,
 * },
 */
const layouts = [ 
    {
        vEdges: [0, 0.30, 0.70, 1],
        hEdges: [0, 0.5, 0.7, 1],
        gap: 20,
    },  
    {
        vEdges: [0, 0.30, 0.70, 1],
        hEdges: [0, 0.5, 0.7, 1],
    },
    {
        vEdges: [0, 0.25, 0.75, 1],
        hEdges: [0, 0.5, 0.7, 1],
    },
    {
        vEdges: [0, 0.40, 1],
        hEdges: [0, 0.70, 1],
        noBorder: true
    },
];


// Default parameters to be applied to every grid layout.
// Default parameters are overridden by layout specific configuration.
const defaultConfig = {
    vEdges: [0, 0.5, 1],
    hEdges: [0, 0.5, 1],
    gap: 0,
    cascadeIndent: 30,
    noBorder: false
};


// State containers
const layoutSelections = {};
const locations = {};
// Contains previous deskop for each client, to be used for re-cascading the previous desktop after client has been moved to another.
const previousDesktops = {}; 
const originalGeometeries = {};


// Helpers
const getDeskId = cli => cli.screen + '_' + cli.desktop;

const getGrid = cli => Object.assign({}, defaultConfig, layouts[layoutSelections[getDeskId(cli)]] || layouts[0]);

const limit = (val, lower, upper) => Math.max(Math.min(val, upper), lower);

const getCascadeId = (cli, location) => fitLocation(location, getGrid(cli)).slice(0, 3).join(';');

const setBorder = cli => cli.noBorder = getGrid(cli).noBorder ?? false;


/**
 * @param {AbstractClient} cli 
 * @param {'right'|'left'|'up'|'down'} direction 
 * @returns {number[]} Preconfigured starting location
 */
const getPreset = (cli, direction) => {
    const grid = getGrid(cli);
    switch (direction) {
        case 'left': return [0, 0, 1, grid.hEdges.length - 1];
        case 'right': return [grid.vEdges.length - 2, 0, grid.vEdges.length - 1, grid.hEdges.length - 1];
        case 'up': return [0, 0, grid.vEdges.length - 1, grid.hEdges.length - 1] // Maximized;
        case 'down': return [0, grid.hEdges.length - 2, grid.vEdges.length - 1, grid.hEdges.length - 1];
    }
};


/**
 * @description Force cell boundaries within grid
 * @param {number[]} location
 * @param {Object} grid 
 */
const fitLocation = ([left, top, right, bottom], grid) => {
    left = limit(left, 0, grid.vEdges.length - 2);
    right = limit(right, 1, grid.vEdges.length - 1);
    top = limit(top, 0, grid.hEdges.length - 2);
    bottom = limit(bottom, 1, grid.hEdges.length - 1);

    return [left, top, right, bottom];
};



/**
 * @param {AbstractClient} cli 
 * @param {'right'|'left'|'up'|'down'} direction
 * @returns {number[]} Mew location
 */
const getNewLocation = (cli, direction) => {
    if (!locations[cli]) return getPreset(cli, direction);

    let [left, top, right, bottom] = locations[cli];
    const grid = getGrid(cli);

    // Cannot shrink -> back to preset location
    if (direction === 'right' && left === grid.vEdges.length - 2) return getPreset(cli, 'right');
    if (direction === 'left' && right === 1) return getPreset(cli, 'left');
    if (direction === 'up' && bottom === 1) return getPreset(cli, 'up');
    if (direction === 'down' && top === grid.hEdges.length - 2) return getPreset(cli, 'down');

    // Shrink
    if (direction === 'right') { left++; right++; }
    if (direction === 'left') { left--; right--; }
    if (direction === 'up') { top--; bottom--; }
    if (direction === 'down') { top++; bottom++; }

    return fitLocation([left, top, right, bottom], grid);
};


/**
 * 
 * @param {AbstractClient} cli 
 * @param {boolean} restoreLocation - Restore also location in addition to size
 */
const restore = (cli, restoreLocation) => {
    if (cli in locations) {
        if (restoreLocation)
            cli.frameGeometry = originalGeometeries[cli];
        else 
            // Restore only window size
            cli.frameGeometry = {
                height: originalGeometeries[cli].height,
                width: originalGeometeries[cli].width
            };
        
        const location = locations[cli];
        cli.noBorder = false;

        delete originalGeometeries[cli];
        delete locations[cli];
        delete previousDesktops[cli];

        cascade(getDeskId(cli), location)
    }
};


/**
 * @param {AbstractClient} cli 
 * @param {number} cascadeIdx
 * @param {number} cascadeLength
 * @returns {QRect} Geometery
 */
const getGeometery = (cli, cascadeIdx, cascadeLength) => {
    const grid = getGrid(cli);
    let [left, top, right, bottom] = fitLocation(locations[cli], grid);
    const maxArea = workspace.clientArea(KWin.MaximizeArea, cli);

    const x = maxArea.x + Math.round(grid.vEdges[left] * maxArea.width) + grid.gap * (left === 0 ? 2 : 1) + cascadeIdx * grid.cascadeIndent;
    const y = maxArea.y + Math.round(grid.hEdges[top] * maxArea.height) + grid.gap * (top === 0 ? 2 : 1) + cascadeIdx * grid.cascadeIndent;

    const width = maxArea.x + Math.round(grid.vEdges[right] * maxArea.width) - x - grid.gap * (right === grid.vEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * grid.cascadeIndent;
    const height = maxArea.y + Math.round(grid.hEdges[bottom] * maxArea.height) - y - grid.gap * (bottom === grid.hEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * grid.cascadeIndent;

    return { x, y, width, height };
};


const cascade = (deskId, location) => {
    workspace.clientList()
        .filter(cli => locations[cli]
            && getDeskId(cli) === deskId
            && getCascadeId(cli, locations[cli]) === getCascadeId(cli, location)
        )
        .forEach((cli, idx, clis) => cli.frameGeometry = getGeometery(cli, idx, clis.length));
};


const move = direction => () => {
    try {
        const cli = workspace.activeClient;
        const deskId = getDeskId(cli);

        if (cli.moveable && cli.resizeable) { 
            if (!locations[cli]) {
                // Copy properties instead of reference to geometery object
                originalGeometeries[cli] = {
                    x: cli.frameGeometry.x,
                    y: cli.frameGeometry.y,
                    width: cli.frameGeometry.width,
                    height: cli.frameGeometry.height
                };
                previousDesktops[cli] = deskId;
                setBorder(cli);

                cli.clientStartUserMovedResized.connect(() => restore(cli));
                
                cli.desktopChanged.connect(() => {
                    cascade(previousDesktops[cli], locations[cli]);
                    previousDesktops[cli] = getDeskId(cli);
                    cascade(previousDesktops[cli], locations[cli]);
                    setBorder(cli);
                });
            }
            
            const previousLocation = locations[cli];

            const newLocation = getNewLocation(cli, direction);
            locations[cli] = newLocation;
            cascade(deskId, newLocation);
            
            if (previousLocation && getGrid(cli).cascadeIndent) cascade(deskId, previousLocation);
        }
    } catch (error) {
        print('FlexGrid move error:', error);
    }
};


const refit = deskId => {
    const deskClis = workspace.clientList().filter(cli => cli in locations && (!deskId || getDeskId(cli) === deskId));
    
    deskClis.forEach(setBorder);

    deskClis.forEach(cli => cascade(getDeskId(cli), locations[cli]));
};


const switchGrid = direction => () => {
    try {
        const deskId = getDeskId(workspace.activeClient);
        
        layoutSelections[deskId] = (layoutSelections[deskId] || 0) + (direction === 'next' ? 1 : -1);
        layoutSelections[deskId] = limit(layoutSelections[deskId], 0, layouts.length - 1);

        refit(deskId);
    } catch (error) {
        print('FlexGrid switchGrid error:', error);
    }
};


registerShortcut("FlexGridMoveRight", "FlexGrid: Move Window right", "Meta+Right", move('right'));
registerShortcut("FlexGridMoveLeft", "FlexGrid: Move Window left", "Meta+Left", move('left'));
registerShortcut("FlexGridMoveUp", "FlexGrid: Move Window up", "Meta+Up", move('up'));
registerShortcut("FlexGridMoveDown", "FlexGrid: Move Window down", "Meta+Down", move('down'));

registerShortcut("FlexGridNextGrid2", "FlexGrid: Next grid", "Meta+Ctrl+Right", switchGrid('next'));
registerShortcut("FlexGridPreviousGrid2", "FlexGrid: Previous grid", "Meta+Ctrl+Left", switchGrid('prev'));

registerShortcut("FlexGridRestore", "FlexGrid: Restore", "Meta+end", () => restore(workspace.activeClient, true));

workspace.virtualScreenGeometryChanged.connect(refit);

workspace.clientRemoved.connect(restore);

