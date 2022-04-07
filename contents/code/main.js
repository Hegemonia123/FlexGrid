/**
 * Grid layout configurations.
 * There is no upper limit for the number of layouts.
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
 * autoTileSlot defines the slot where new windows are opened to. 
 * Set it false to disable tautomatic tiling for new windows.
 * [
 *    <window left side vertican grid edge>,
 *    <window top side horizonal grid edge>,
 *    <window right side vertican grid edge>,
 *    <window bottom side horizonal grid edge>
 * ]
 * 
 * ignore must be a fuction that takes window (client) as a parameter and returns 
 * boolean indicating whether the grid command should be ignored or not. 
 * 
 * 
 * @example 
 * // Even 2x2 layout without gaps, window frames and cascade effect.
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
        noBorder: true,
        autoTileSlot: false
    },
];


// Default parameters to be applied to every layout.
// Default parameters are overridden by layout specific configuration.
const defaultLayoutParams = {
    vEdges: [0, 0.5, 1],
    hEdges: [0, 0.5, 1],
    gap: 0,
    cascadeIndent: 30,
    noBorder: false,
    autoTileSlot: [1, 0, 2, 3],
    ignore: cli => !cli.normalWindow
    /**
     * Examples:
    ignore: cli => !cli.normalWindow || !cli.moveable || !cli.resizeable || cli.specialWindow || cli.transient // More failproof
    ignore: cli => cli.desktopWindow || cli.dock || cli.resourceClass == 'plasmashell'
    ignore: cli => !cli.normalWindow || cli.resourceClass == 'firefox' // Added app specific rule
    ignore: cli => !cli.normalWindow || (cli.windowRole == 'browser' && cli.resourceClass == 'firefox' && cli.resourceName == 'navigator') // Added window specific rule
     */
};


// State containers
const layoutSelections = {};
const positions = {};
// Contains previous deskop for each client, to be used for re-cascading the previous desktop after client has been moved to another.
const previousDesktops = {}; 
const originalState = {};
const clients = {};


// Helpers
const getDeskId = cli => cli.screen + ';' + cli.desktop + ';' + (cli.activities.length ? cli.activities : workspace.activities);

const getLayout = cli => Object.assign({}, defaultLayoutParams, layouts[layoutSelections[getDeskId(cli)]] || layouts[0]);

const limit = (val, lower, upper) => Math.max(Math.min(val, upper), lower);

const getCascadeId = (cli, position) => fitPosition(position, getLayout(cli)).slice(0, 3).join(';');

const setBorder = cli => cli.noBorder = originalState[cli].noBorder || getLayout(cli).noBorder || false;


/**
 * @description Force cell boundaries within grid
 * @param {number[]} position
 * @param {Object} layout 
 */
const fitPosition = ([left, top, right, bottom], layout) => {
    left = limit(left, 0, layout.vEdges.length - 2);
    right = limit(right, 1, layout.vEdges.length - 1);
    top = limit(top, 0, layout.hEdges.length - 2);
    bottom = limit(bottom, 1, layout.hEdges.length - 1);

    return [left, top, right, bottom];
};


/**
 * @param {AbstractClient} cli 
 * @param {'right'|'left'|'up'|'down'} direction 
 * @returns {number[]} Preconfigured starting position
 */
const getPreset = (cli, direction) => {
    const layout = getLayout(cli);
    switch (direction) {
        case 'left': return [0, 0, 1, layout.hEdges.length - 1];
        case 'right': return [layout.vEdges.length - 2, 0, layout.vEdges.length - 1, layout.hEdges.length - 1];
        case 'up': return [0, 0, layout.vEdges.length - 1, layout.hEdges.length - 1] // "Maximized";
        case 'down': return [0, layout.hEdges.length - 2, layout.vEdges.length - 1, layout.hEdges.length - 1];
    }
};



/**
 * @param {AbstractClient} cli 
 * @param {'right'|'left'|'up'|'down'} direction
 * @returns {number[]} Mew position
 */
const getNewPosition = (cli, direction) => {
    let position = positions[cli];

    if (!position && (cli.fullScreen || cli.frameGeometry == workspace.clientArea(KWin.MaximizeArea, cli))) {
        position = getPreset(cli, 'up');
    }

    if (!position) return getPreset(cli, direction);

    let [left, top, right, bottom] = position;
    const layout = getLayout(cli);

    // Cannot shrink -> back to preset position
    if (direction === 'right' && left === layout.vEdges.length - 2) return getPreset(cli, 'right');
    if (direction === 'left' && right === 1) return getPreset(cli, 'left');
    if (direction === 'up' && bottom === 1) return getPreset(cli, 'up');
    if (direction === 'down' && top === layout.hEdges.length - 2) return getPreset(cli, 'down');

    // Shrink
    if (direction === 'right') { left++; right++; }
    if (direction === 'left') { left--; right--; }
    if (direction === 'up') { top--; bottom--; }
    if (direction === 'down') { top++; bottom++; }

    return fitPosition([left, top, right, bottom], layout);
};


/**
 * 
 * @param {AbstractClient} cli 
 * @param {boolean} restorePosition - Restore also position in addition to size
 */
const restore = (cli, restorePosition) => {
    if (cli in positions) {
        // Resize to fit the screen area, because screen may have been changed after tiling started.
        const maxArea = workspace.clientArea(KWin.MaximizeArea, cli);
        let { x, y, width, height, fullScreen, noBorder } = originalState[cli];
        width = limit(width, cli.minSize.width, maxArea.width);
        height = limit(height, cli.minSize.height, maxArea.height);

        if (restorePosition)
            cli.frameGeometry = {
                x: limit(x, maxArea.x, maxArea.width - width),
                y: limit(y, maxArea.y, maxArea.height - height),
                width,
                height
            };
        else // Restore only window size
            cli.frameGeometry = { height, width };

        const position = positions[cli];
        cli.noBorder = noBorder;
        if (fullScreen) {
            // Dirty hack: Otherwise panels remain visible.
            cli.fullScreen = false;
            cli.fullScreen = true;
        }

        delete originalState[cli];
        delete positions[cli];
        delete previousDesktops[cli];
        delete clients[cli];

        cascade(getDeskId(cli), position)
    }
};


/**
 * @param {AbstractClient} cli 
 * @param {number} cascadeIdx
 * @param {number} cascadeLength
 * @returns {QRect} Geometry
 */
const getGeometry = (cli, cascadeIdx, cascadeLength) => {
    const layout = getLayout(cli);
    let [left, top, right, bottom] = fitPosition(positions[cli], layout);
    const maxArea = workspace.clientArea(KWin.MaximizeArea, cli);

    const x = maxArea.x + Math.round(layout.vEdges[left] * maxArea.width) + layout.gap * (left === 0 ? 2 : 1) + cascadeIdx * layout.cascadeIndent;
    const y = maxArea.y + Math.round(layout.hEdges[top] * maxArea.height) + layout.gap * (top === 0 ? 2 : 1) + cascadeIdx * layout.cascadeIndent;

    const width = maxArea.x + Math.round(layout.vEdges[right] * maxArea.width) - x - layout.gap * (right === layout.vEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * layout.cascadeIndent;
    const height = maxArea.y + Math.round(layout.hEdges[bottom] * maxArea.height) - y - layout.gap * (bottom === layout.hEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * layout.cascadeIndent;

    return { x, y, width, height };
};


const cascade = (deskId, position) => {
    Object.values(clients)
        .filter(cli =>
            getDeskId(cli) === deskId
            && getCascadeId(cli, positions[cli]) === getCascadeId(cli, position)
        )
        .forEach((cli, idx, clis) => cli.frameGeometry = getGeometry(cli, idx, clis.length));
};


const tile = (cli, position) => {
    try {
        const deskId = getDeskId(cli);
        const layout = getLayout(cli);

        if (!layout.ignore(cli)) {
            if (!clients[cli]) {
                // Copy properties instead of reference to geometry object
                originalState[cli] = {
                    x: cli.frameGeometry.x,
                    y: cli.frameGeometry.y,
                    width: cli.frameGeometry.width,
                    height: cli.frameGeometry.height,
                    noBorder: cli.noBorder,
                    fullScreen: cli.fullScreen
                };
                clients[cli] = cli;
                previousDesktops[cli] = deskId;
                setBorder(cli);

                cli.clientStartUserMovedResized.connect(() => !cli.resize && restore(cli));
                
                cli.desktopChanged.connect(() => {
                    cascade(previousDesktops[cli], positions[cli]);
                    previousDesktops[cli] = getDeskId(cli);
                    cascade(previousDesktops[cli], positions[cli]);
                    setBorder(cli);
                });
            }
            
            const previousPosition = positions[cli];

            positions[cli] = position;
            cascade(deskId, position);
            
            if (previousPosition && layout.cascadeIndent) cascade(deskId, previousPosition);
        }
    } catch (error) {
        print('FlexGrid tile error:', error);
    }
};


const move = direction => () => 
    tile(workspace.activeClient, getNewPosition(workspace.activeClient, direction));


const handleNewClient = cli => {
    const position = getLayout(cli).autoTileSlot;
    if (position) tile(cli, position);
};


const refit = deskId => {
    const deskClis = Object.values(clients).filter(cli => !deskId || getDeskId(cli) === deskId);
    deskClis.forEach(setBorder);
    deskClis.forEach(cli => cascade(getDeskId(cli), positions[cli]));
};


const switchLayout = direction => () => {
    try {
        const deskId = getDeskId(workspace.activeClient);
        
        layoutSelections[deskId] = (layoutSelections[deskId] || 0) + (direction === 'next' ? 1 : -1);
        layoutSelections[deskId] = limit(layoutSelections[deskId], 0, layouts.length - 1);

        refit(deskId);
    } catch (error) {
        print('FlexGrid switchLayout error:', error);
    }
};


registerShortcut("FlexGridMoveRight", "FlexGrid: Move Window right", "Meta+Right", move('right'));
registerShortcut("FlexGridMoveLeft", "FlexGrid: Move Window left", "Meta+Left", move('left'));
registerShortcut("FlexGridMoveUp", "FlexGrid: Move Window up", "Meta+Up", move('up'));
registerShortcut("FlexGridMoveDown", "FlexGrid: Move Window down", "Meta+Down", move('down'));

registerShortcut("FlexGridNextLayout", "FlexGrid: Next layout", "Meta+Ctrl+Right", switchLayout('next'));
registerShortcut("FlexGridPreviousLayout", "FlexGrid: Previous layout", "Meta+Ctrl+Left", switchLayout('prev'));

registerShortcut("FlexGridRestore", "FlexGrid: Restore", "Meta+end", () => restore(workspace.activeClient, true));

workspace.virtualScreenGeometryChanged.connect(refit);

workspace.clientAdded.connect(handleNewClient);
workspace.clientRemoved.connect(restore);

