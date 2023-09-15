/**
 * NOTE! YOU SHOULD BACKUP THE CHANGES YOU MAKE, BECAUSE THE NEXT UPDATE WILL OVERRIDE THEM!
 * 
 * Grid layout configurations.
 * There is no upper limit for the number of layouts.
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
 * ignore must be a fuction that takes window (client) as a parameter and returns 
 * boolean indicating whether the grid command should be ignored or not. 
 * Some example functions:
 *   cli => !cli.normalWindow || !cli.moveable || !cli.resizeable || cli.specialWindow || cli.transient // More failproof
 *   cli => cli.desktopWindow || cli.dock || cli.resourceClass == 'plasmashell'
 *   cli => !cli.normalWindow || cli.resourceClass == 'firefox' // Added app specific rule
 *   cli => !cli.normalWindow || (cli.windowRole == 'browser' && cli.resourceClass == 'firefox' && cli.resourceName == 'navigator') // Added window specific rule
 * 
 * 
 * @example Even 2x2 layout without gaps, window frames, cascade effect and automatic tiling, that ignores Firefox.
 * {
 *      vEdges: [0, 0.5, 1],
 *      hEdges: [0, 0.5, 1],
 *      gap: 0,
 *      noBorder: true,
 *      cascadeIndent: 0,
 *      ignore: cli => !cli.normalWindow || cli.resourceClass == 'firefox'
 * },
 * 
 * NOTE! YOU SHOULD BACKUP THE CHANGES YOU MAKE, BECAUSE THE NEXT UPDATE WILL OVERRIDE THEM!
 */
const layouts = [ 
    {
        vEdges: [0, 0.30, 0.70, 1],
        hEdges: [0, 0.7, 1],
        gap: 15,
    },  
    {
        vEdges: [0, 0.25, 0.65, 1],
        hEdges: [0, 0.7, 1],
    },
    {
        vEdges: [0, 0.4, 1],
        hEdges: [0, 0.7, 1],
    },
    {
        vEdges: [0, 0.4, 1],
        hEdges: [0, 0.7, 1],
        gap: 15,
    },
    { // Maximize all
        vEdges: [0, 1],
        hEdges: [0, 1],
    },
];


/** 
 * Default parameters to be applied to every layout.
 * Default parameters are overridden by layout specific configuration.
 */
const defaultLayoutParams = {
    vEdges: [0, 0.5, 1],
    hEdges: [0, 0.5, 1],
    gap: 4,
    cascadeIndent: 20,
    noBorder: false,
    ignore: cli => !cli.normalWindow
};


const DEFAULT_NORMAL_LAYOUT = 2;
const DEFAULT_WIDE_LAYOUT = 0;
const WIDE_LAYOUT_TRESHOLD = 2; // Aspect ratio
const MIN_CELL_WIDTH = 400;
const MIN_CELL_HEIGHT = 200;


/** Selected layout for each desktop / screen / activity */
const layoutSelections = {};

const customizedLayouts = {};

/** Client state */
const clients = {};

/** For storing application specific positions to be applied to new windows. */ 
const appPositions = {}; 

let screenSetup = {};


// Helpers
const refreshScreenSetup = () => {
    // Hacky method to parse screen configuration from supportInformation
    screenSetup = (workspace.supportInformation().match(/Screen \d:(.|\n)+=====/)[0] || '')
        .split(/Screen/)
        .map(val => val.trim())
        .filter(Boolean)
        .reduce((res, cur) => {
            const resolution = cur.match(/Geometry:.+\n/)[0].split(' ')[1].trim().split(',').pop();
            const [x, y] = resolution.split('x').map(Number);
            return Object.assign(res, {
                [cur[0]]: {
                    name: cur.match(/Name:.+\n/)[0].split(' ')[1].trim(),
                    resolution,
                    aspectRatio: x / y
                }
            })
        }, {});
}
refreshScreenSetup()


const getDeskId = cli => [
    screenSetup[cli.screen].name,
    screenSetup[cli.screen].resolution,
    cli.desktop === -1 ? workspace.currentDesktop : cli.desktop,
    (cli.activities.length ? cli.activities : workspace.activities)
].join('::');


const getDefaultLayout = cli => 
    screenSetup[cli.screen].aspectRatio > WIDE_LAYOUT_TRESHOLD ? DEFAULT_WIDE_LAYOUT :  DEFAULT_NORMAL_LAYOUT;


const getLayout = cli => 
    customizedLayouts[getDeskId(cli)] ?? 
    Object.assign({}, defaultLayoutParams, layouts[layoutSelections[getDeskId(cli)] ?? getDefaultLayout(cli)]);

const limit = (val, lower, upper) => Math.max(Math.min(val, upper), lower);

const getCascadeId = (cli, position) => fitPosition(position, getLayout(cli)).slice(0, 3).join(';');

const setBorder = cli => cli.noBorder = clients[cli].originalState.noBorder || getLayout(cli).noBorder || false;

const getAppId = cli => cli.resourceName + ' ' + cli.resourceClass;

const isFullScreen = cli => cli.fullScreen && clients[cli].position == '' + getPreset(cli, 'up');

const clone = obj => JSON.parse(JSON.stringify(obj));

const getCurrentGeometry = cli => clone(cli.frameGeometry);

const saveCurrentGeometry = cli => clients[cli].previousGeometry = getCurrentGeometry(cli);


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
    let position = (clients[cli] || {}).position;

    if (!position) {
        // Initialize fullscreen and maximized windows as if they were already tiled to cover the whole grid.
        if (cli.fullScreen) {
            position = getPreset(cli, 'up');
        } else if (cli.frameGeometry == workspace.clientArea(KWin.MaximizeArea, cli)) {
            cli.setMaximize(false, false); // Unmaximize because maximized windows have differrent borders
            position = getPreset(cli, 'up');
        } else {
            return getPreset(cli, direction);
        }
    }
    
    const layout = getLayout(cli);
    let [left, top, right, bottom] = fitPosition(position, layout);

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


const clearState = (cli, forgetAppPosition) => {
    if (forgetAppPosition) delete appPositions[getAppId(cli)];
    Object.entries(clients[cli].eventListeners).forEach(([event, handler]) => cli[event].disconnect(handler));
    delete clients[cli];
};


/**
 * 
 * @param {AbstractClient} cli 
 * @param {boolean} restorePosition - Restore also position in addition to size
 * @param {boolean} forgetAppPosition - If true, the next time app will open untiled. false will open it to the same cell.
 */
const untile = (cli, restorePosition, forgetAppPosition) => {
    if (clients[cli]) {
        // Resize to fit the screen area, because screen may have been changed after tiling started.
        let { x, y, width, height, fullScreen, noBorder } = clients[cli].originalState;
        const maxArea = workspace.clientArea(fullScreen ? KWin.FullScreenArea : KWin.MaximizeArea, cli);
        width = limit(width, cli.minSize.width, maxArea.width);
        height = limit(height, cli.minSize.height, maxArea.height);
        x = limit(x, maxArea.x, maxArea.width - width);
        y = limit(y, maxArea.y, maxArea.height - height);

        Object.assign(cli, {
            noBorder,
            fullScreen,
            frameGeometry: Object.assign({ width, height }, restorePosition ? { x, y } : {})
        });

        const position = clients[cli].position;
        clearState(cli, forgetAppPosition);
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
    const position = fitPosition(clients[cli].position, layout);
    
    // Make window actually fullscreen if it is a "fullScreen" window covering the whole grid
    if (isFullScreen(cli)) 
        return workspace.clientArea(KWin.FullScreenArea, cli);

    let [left, top, right, bottom] = position;
    const maxArea = workspace.clientArea(KWin.MaximizeArea, cli);

    const x = maxArea.x + Math.round(layout.vEdges[left] * maxArea.width) + layout.gap * (left === 0 ? 2 : 1) + cascadeIdx * layout.cascadeIndent;
    const y = maxArea.y + Math.round(layout.hEdges[top] * maxArea.height) + layout.gap * (top === 0 ? 2 : 1) + cascadeIdx * layout.cascadeIndent;

    const width = maxArea.x + Math.round(layout.vEdges[right] * maxArea.width) - x - layout.gap * (right === layout.vEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * layout.cascadeIndent;
    const height = maxArea.y + Math.round(layout.hEdges[bottom] * maxArea.height) - y - layout.gap * (bottom === layout.hEdges.length - 1 ? 2 : 1) - (cascadeLength - cascadeIdx - 1) * layout.cascadeIndent;

    return { x, y, width, height };
};


const cascade = (deskId, cascadePos) => {
    const clis = Object.values(clients)
        .filter(({ cli, position }) =>
            !cli.minimized &&
            cli.screen >= 0 && // When screen is unplugged some clients get negative screen values. Ignore them.
            getDeskId(cli) === deskId
            && getCascadeId(cli, position) === getCascadeId(cli, cascadePos)
        )
        .map(({ cli }) => cli)

    // Cascaded windows
    clis.filter(cli => !isFullScreen(cli))
        .forEach((cli, idx, cascadeClis) => cli.frameGeometry = getGeometry(cli, idx, cascadeClis.length));

    // Actual fullScreen windows. Not cascaded.
    clis.filter(isFullScreen)
        .forEach(cli => cli.frameGeometry = getGeometry(cli, 0, 1));
};


const handleDesktopChange = cli => {
    if (clients[cli]) {
        const c = clients[cli];
        cascade(c.previousDesktop, c.position);
        cascade(getDeskId(cli), c.position);
        c.previousDesktop = getDeskId(cli);
        setBorder(cli);
    }
};


const handleFullScreenChange = cli => {
    if (clients[cli]) {
        const c = clients[cli];
        if (cli.fullScreen) { // Changed to full screen
            c.positionBeforeFullScreen = c.position;
            c.position = getPreset(cli, 'up');
            cascade(getDeskId(cli), c.positionBeforeFullScreen);
        } else { // Restored from full screen
            if (c.positionBeforeFullScreen) { // The position before full screen is known.
                c.position = c.positionBeforeFullScreen;
                cascade(getDeskId(cli), c.position);
                delete c.positionBeforeFullScreen;
            } else { 
                // Window manager wants to restore the postion and we don't know where.
                // We also cannot compete with WM -> Just clear tiling state, and regard it as not tiled.
                clearState(cli);
            }
        }

    }
};

const fitEdge = (edges, idx, value, minSize) => 
    limit(value, (edges[idx - 1] ?? -minSize) + minSize, (edges[idx + 1] ?? 1 + minSize) - minSize);


const handleResize = cli => {
    const maxArea = workspace.clientArea(KWin.MaximizeArea, cli);
    const prevGeo = clients[cli].previousGeometry;
    const curGeo = getCurrentGeometry(cli);    
    const layout = getLayout(cli);
    const [left, top, right, bottom] = fitPosition(clients[cli].position, layout);
    const minWidthPct = MIN_CELL_WIDTH / maxArea.width;
    const minHeightPct = MIN_CELL_HEIGHT / maxArea.height;

    const vEdges = [...layout.vEdges];
    const hEdges = [...layout.hEdges];
    
    const leftChange = curGeo.x - prevGeo.x;
    const rightChange = (curGeo.x + curGeo.width) - (prevGeo.x + prevGeo.width);
    const topChange = curGeo.y - prevGeo.y;
    const bottomChange = (curGeo.y + curGeo.height) - (prevGeo.y + prevGeo.height);

    if (leftChange) vEdges[left] = fitEdge(vEdges, left, vEdges[left] + leftChange / maxArea.width, minWidthPct);
    if (rightChange) vEdges[right] = fitEdge(vEdges, right, vEdges[right] + rightChange / maxArea.width, minWidthPct);
    if (topChange) hEdges[top] = fitEdge(hEdges, top, hEdges[top] + topChange / maxArea.height, minHeightPct);
    if (bottomChange) hEdges[bottom] = fitEdge(hEdges, bottom, hEdges[bottom] + bottomChange / maxArea.height, minHeightPct);

    customizedLayouts[getDeskId(cli)] = Object.assign(layout, { vEdges, hEdges });
    refit({ deskId: getDeskId(cli) });    
    saveCurrentGeometry(cli);
};


const initialize = cli => {
    clients[cli] = {
        cli,
        originalState: Object.assign({
            noBorder: cli.noBorder,
            fullScreen: cli.fullScreen
        }, getCurrentGeometry(cli)),
        previousDesktop: getDeskId(cli),
        eventListeners: {
            clientStepUserMovedResized: () => !cli.resize && untile(cli, false, true),
            clientFinishUserMovedResized: handleResize,
            minimizedChanged: () => cascade(getDeskId(cli), clients[cli].position),
            desktopChanged: () => handleDesktopChange(cli),
            screenChanged: () => handleDesktopChange(cli),
            fullScreenChanged: () => handleFullScreenChange(cli),
            clientMaximizedStateChanged: () => clearState(cli),
        }
    };
    setBorder(cli);

    Object.entries(clients[cli].eventListeners).forEach(([event, handler]) => cli[event].connect(handler));
};


const tile = (cli, position) => {
    try {
        const deskId = getDeskId(cli);
        const layout = getLayout(cli);

        if (!layout.ignore(cli)) {
            if (!clients[cli]) initialize(cli);
            
            const previousPosition = clients[cli].position;
            
            clients[cli].position = position;
            
            cascade(deskId, position);

            if (!cli.fullScreen) appPositions[getAppId(cli)] = position;
            
            if (previousPosition && layout.cascadeIndent) cascade(deskId, previousPosition);

            saveCurrentGeometry(cli);
        }
    } catch (error) {
        print('FlexGrid tile error:', error, error.stack);
    }
};


const move = direction => () => 
    tile(workspace.activeClient, getNewPosition(workspace.activeClient, direction));


const handleNewClient = cli => {
    const position = appPositions[getAppId(cli)];
    if (position) tile(cli, position);
};


const refit = ({ deskId, descNumber } = {}) => {
    Object.values(clients)
        .filter(({ cli }) =>
            deskId ? getDeskId(cli) === deskId
                : descNumber ? cli.desktop === descNumber || cli.desktop === -1
                    : true
        )
        .forEach(({ cli, position }) => {
            setBorder(cli);
            cascade(getDeskId(cli), position);
            saveCurrentGeometry(cli);
        });
};


const switchLayout = direction => () => {
    try {
        const deskId = getDeskId(workspace.activeClient);
        
        layoutSelections[deskId] = (layoutSelections[deskId] ?? getDefaultLayout(workspace.activeClient)) + (direction === 'next' ? 1 : -1);
        layoutSelections[deskId] = limit(layoutSelections[deskId], 0, layouts.length - 1);
        delete customizedLayouts[deskId];

        refit({ deskId });
    } catch (error) {
        print('FlexGrid switchLayout error:', error, error.stack);
    }
};


registerShortcut("FlexGridMoveRight", "FlexGrid: Move Window right", "Meta+Right", move('right'));
registerShortcut("FlexGridMoveLeft", "FlexGrid: Move Window left", "Meta+Left", move('left'));
registerShortcut("FlexGridMoveUp", "FlexGrid: Move Window up", "Meta+Up", move('up'));
registerShortcut("FlexGridMoveDown", "FlexGrid: Move Window down", "Meta+Down", move('down'));

registerShortcut("FlexGridNextLayout", "FlexGrid: Next layout", "Meta+Ctrl+Right", switchLayout('next'));
registerShortcut("FlexGridPreviousLayout", "FlexGrid: Previous layout", "Meta+Ctrl+Left", switchLayout('prev'));

registerShortcut("FlexGridUntile", "FlexGrid: Untile", "Meta+end", () => untile(workspace.activeClient, true, true));

workspace.virtualScreenGeometryChanged.connect(refreshScreenSetup);
workspace.virtualScreenGeometryChanged.connect(refit);

workspace.clientAdded.connect(handleNewClient);
workspace.clientRemoved.connect(cli => untile(cli, true, false));

workspace.currentDesktopChanged.connect(() => refit({ descNumber: workspace.currentDesktop }));