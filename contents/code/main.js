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
        noBorder: true
    },
];


// Default parameters to be applied to every layout.
// Default parameters are overridden by layout specific configuration.
const defaultLayoutParams = {
    vEdges: [0, 0.5, 1],
    hEdges: [0, 0.5, 1],
    gap: 0,
    cascadeIndent: 30,
    noBorder: false
};


// State containers
const layoutSelections = {};
const positions = {};
// Contains previous deskop for each client, to be used for re-cascading the previous desktop after client has been moved to another.
const previousDesktops = {}; 
const originalGeometeries = {};


// Helpers
const getDeskId = cli => cli.screen + '_' + cli.desktop;

const getLayout = cli => Object.assign({}, defaultLayoutParams, layouts[layoutSelections[getDeskId(cli)]] || layouts[0]);

const limit = (val, lower, upper) => Math.max(Math.min(val, upper), lower);

const getCascadeId = (cli, position) => fitPosition(position, getLayout(cli)).slice(0, 3).join(';');

const setBorder = cli => cli.noBorder = getLayout(cli).noBorder ?? false;


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
        case 'up': return [0, 0, layout.vEdges.length - 1, layout.hEdges.length - 1] // Maximized;
        case 'down': return [0, layout.hEdges.length - 2, layout.vEdges.length - 1, layout.hEdges.length - 1];
    }
};



/**
 * @param {AbstractClient} cli 
 * @param {'right'|'left'|'up'|'down'} direction
 * @returns {number[]} Mew position
 */
const getNewPosition = (cli, direction) => {
    if (!positions[cli]) return getPreset(cli, direction);

    let [left, top, right, bottom] = positions[cli];
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
        let { x, y, width, height } = originalGeometeries[cli];
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
        cli.noBorder = false;

        delete originalGeometeries[cli];
        delete positions[cli];
        delete previousDesktops[cli];

        cascade(getDeskId(cli), position)
    }
};


/**
 * @param {AbstractClient} cli 
 * @param {number} cascadeIdx
 * @param {number} cascadeLength
 * @returns {QRect} Geometery
 */
const getGeometery = (cli, cascadeIdx, cascadeLength) => {
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
    workspace.clientList()
        .filter(cli => positions[cli]
            && getDeskId(cli) === deskId
            && getCascadeId(cli, positions[cli]) === getCascadeId(cli, position)
        )
        .forEach((cli, idx, clis) => cli.frameGeometry = getGeometery(cli, idx, clis.length));
};


const move = direction => () => {
    try {
        const cli = workspace.activeClient;
        const deskId = getDeskId(cli);

        if (cli.moveable && cli.resizeable && !cli.specialWindow && !cli.transient) { 
            if (!positions[cli]) {
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
                    cascade(previousDesktops[cli], positions[cli]);
                    previousDesktops[cli] = getDeskId(cli);
                    cascade(previousDesktops[cli], positions[cli]);
                    setBorder(cli);
                });
            }
            
            const previousPosition = positions[cli];

            const newPosition = getNewPosition(cli, direction);
            positions[cli] = newPosition;
            cascade(deskId, newPosition);
            
            if (previousPosition && getLayout(cli).cascadeIndent) cascade(deskId, previousPosition);
        }
    } catch (error) {
        print('FlexGrid move error:', error);
    }
};


const refit = deskId => {
    const deskClis = workspace.clientList().filter(cli => cli in positions && (!deskId || getDeskId(cli) === deskId));
    
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

workspace.clientRemoved.connect(restore);

