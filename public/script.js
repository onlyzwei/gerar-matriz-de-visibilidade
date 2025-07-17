// O atributo 'defer' no <script> em index.html garante que este código
// só rode após o carregamento completo do DOM.

// --- CONFIGURAÇÕES GLOBAIS ---
const UFF_GRAGOATA_COORDS = [-22.898225, -43.1339];
const GRID_BOUNDS = { 
    minLat: -22.90272,
    maxLat: -22.89373,
    minLng: -43.14098,
    maxLng: -43.12682,
};
let TAMANHO_CELULA = 0.00003; // Tamanho de célula menor para alta resolução

// Estilos para as células
const ESTILO_NAO_ANDAVEL = { stroke: "#718096", weight: 0.5, fill: "#A0AEC0", fillOpacity: 0.15 };
const ESTILO_ANDAVEL = { stroke: "#3B82F6", weight: 1, fill: "#3B82F6", fillOpacity: 0.3 };
const ESTILO_CAMERA = { stroke: "#EA580C", weight: 1.5, fill: "#F97316", fillOpacity: 0.7 };

// --- ESTADO DA APLICAÇÃO ---
let editMode = 'walkable';
let matrixState = [];
let gridLayer = null;
let layersControl = null; // MODIFICAÇÃO 1: Variável para o controle de camadas
let infoTooltip = null;
let isPainting = false;
let paintMode = true;
let showTooltips = true;
let isBrushModeActive = false;
let currentlyEditingCell = null;
let lastHoveredCell = null;
let isGridDirty = false; // Controle de redesenho para otimização de pintura

// --- INICIALIZAÇÃO DO MAPA ---
const map = L.map('map', { 
    preferCanvas: true,
    minZoom: 9,
    maxZoom: 21 
}).setView(UFF_GRAGOATA_COORDS, 19);

// Camadas de mapa (Tile Layers)
const tileLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 21,
        maxNativeZoom: 19 // ALTERADO: Adicionado maxNativeZoom para evitar que o mapa suma
    }),
    esriSatellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 21,
        maxNativeZoom: 19 // ALTERADO: Adicionado maxNativeZoom para evitar que o mapa suma
    })
};

const baseMaps = {
    "Ruas (OpenStreetMap)": tileLayers.osm,
    "Satélite (Esri)": tileLayers.esriSatellite
};

tileLayers.osm.addTo(map);
// MODIFICAÇÃO 2: Armazenar a instância do controle de camadas
layersControl = L.control.layers(baseMaps).addTo(map);

// --- ELEMENTOS DO DOM ---
const modeWalkableBtn = document.getElementById('mode-walkable');
const modeCameraBtn = document.getElementById('mode-camera');
const brushModeBtn = document.getElementById('btn-brush-mode');
const generateBtn = document.getElementById('btn-gerar-json');
const regionIdInput = document.getElementById('region-id');
const fillWalkableBtn = document.getElementById('btn-fill-walkable');
const fillUnwalkableBtn = document.getElementById('btn-fill-unwalkable');
const toggleTooltipCheckbox = document.getElementById('toggle-tooltip');
const loadJsonInput = document.getElementById('load-json-input');
const cameraModal = document.getElementById('camera-modal');
const modalCellInfo = document.getElementById('modal-cell-info');
const cameraListDiv = document.getElementById('camera-list');
const newCameraNameInput = document.getElementById('new-camera-name');
const addCameraButton = document.getElementById('btn-add-camera');
const closeModalButton = document.getElementById('btn-close-modal');

// --- CAMADA DE GRID COM CANVAS OTIMIZADA ---
const GridCanvasLayer = L.GridLayer.extend({
    createTile: function (coords) {
        const tile = L.DomUtil.create('canvas', 'leaflet-tile');
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d');
        const tileBounds = this._tileCoordsToBounds(coords);

        const rowMin = Math.max(0, Math.floor((GRID_BOUNDS.maxLat - tileBounds.getNorth()) / TAMANHO_CELULA));
        const rowMax = Math.min(matrixState.length - 1, Math.floor((GRID_BOUNDS.maxLat - tileBounds.getSouth()) / TAMANHO_CELULA));
        const colMin = Math.max(0, Math.floor((tileBounds.getWest() - GRID_BOUNDS.minLng) / TAMANHO_CELULA));
        const colMax = Math.min((matrixState[0] ? matrixState[0].length - 1 : 0), Math.floor((tileBounds.getEast() - GRID_BOUNDS.minLng) / TAMANHO_CELULA));

        for (let r = rowMin; r <= rowMax; r++) {
            for (let c = colMin; c <= colMax; c++) {
                if (!matrixState[r] || !matrixState[r][c]) continue;
                const cellState = matrixState[r][c];
                const style = cellState.cameras.length > 0 ? ESTILO_CAMERA : (cellState.walkable ? ESTILO_ANDAVEL : ESTILO_NAO_ANDAVEL);
                
                const lat = GRID_BOUNDS.maxLat - (r * TAMANHO_CELULA);
                const lng = GRID_BOUNDS.minLng + (c * TAMANHO_CELULA);
                const cellBounds = L.latLngBounds([ [lat - TAMANHO_CELULA, lng], [lat, lng + TAMANHO_CELULA] ]);

                const nw = map.project(cellBounds.getNorthWest());
                const se = map.project(cellBounds.getSouthEast());
                const pointNw = nw.subtract(map.project(tileBounds.getNorthWest()));
                const pointSe = se.subtract(map.project(tileBounds.getNorthWest()));
                
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = style.weight;
                ctx.fillStyle = style.fill;
                ctx.globalAlpha = 1.0;
                ctx.strokeRect(pointNw.x, pointNw.y, pointSe.x - pointNw.x, pointSe.y - pointNw.y);
                ctx.globalAlpha = style.fillOpacity;
                ctx.fillRect(pointNw.x, pointNw.y, pointSe.x - pointNw.x, pointSe.y - pointNw.y);
                ctx.globalAlpha = 1.0;
            }
        }
        return tile;
    }
});

// --- LOOP DE ATUALIZAÇÃO DE TELA ---
function updateLoop() {
    if (isGridDirty && gridLayer) {
        gridLayer.redraw();
        isGridDirty = false;
    }
    requestAnimationFrame(updateLoop);
}

// --- FUNÇÕES PRINCIPAIS ---
function inicializarMatriz(loadedMatrix = null) {
    if (gridLayer) {
        // MODIFICAÇÃO 3: Remover a camada antiga do controle antes de removê-la do mapa
        if (layersControl) {
            layersControl.removeLayer(gridLayer);
        }
        map.removeLayer(gridLayer);
        gridLayer = null;
    }
    matrixState = loadedMatrix ? loadedMatrix : [];
    if (!loadedMatrix) {
        const numRows = Math.ceil((GRID_BOUNDS.maxLat - GRID_BOUNDS.minLat) / TAMANHO_CELULA);
        const numCols = Math.ceil((GRID_BOUNDS.maxLng - GRID_BOUNDS.minLng) / TAMANHO_CELULA);
        for (let r = 0; r < numRows; r++) {
            const rowState = [];
            for (let c = 0; c < numCols; c++) {
                rowState.push({ walkable: false, cameras: [] });
            }
            matrixState.push(rowState);
        }
    }
    gridLayer = new GridCanvasLayer();
    gridLayer.addTo(map);

    // MODIFICAÇÃO 4: Adicionar a nova camada ao controle como uma camada de sobreposição
    if (layersControl) {
        layersControl.addOverlay(gridLayer, "Matriz de Visibilidade");
    }
    
    isGridDirty = true;
    console.log(`Matriz inicializada com ${matrixState.length} linhas e ${matrixState[0] ? matrixState[0].length : 0} colunas.`);
}


function latLngToCell(latlng) {
    if (!latlng || latlng.lat > GRID_BOUNDS.maxLat || latlng.lat < GRID_BOUNDS.minLat || latlng.lng < GRID_BOUNDS.minLng || latlng.lng > GRID_BOUNDS.maxLng) return null;
    const row = Math.floor((GRID_BOUNDS.maxLat - latlng.lat) / TAMANHO_CELULA);
    const col = Math.floor((latlng.lng - GRID_BOUNDS.minLng) / TAMANHO_CELULA);
    if (matrixState[row] && matrixState[row][col]) return { row, col, cellState: matrixState[row][col] };
    return null;
}

// --- LÓGICA DE EVENTOS ---
map.on('mousedown', (e) => {
    if (!isBrushModeActive || editMode !== 'walkable') return;
    isPainting = true;
    const cellInfo = latLngToCell(e.latlng);
    if (cellInfo) {
        paintMode = !cellInfo.cellState.walkable;
        toggleWalkable(cellInfo.row, cellInfo.col, paintMode);
    }
});

map.on('mousemove', (e) => {
    const cellInfo = latLngToCell(e.latlng);
    if (isPainting && isBrushModeActive && editMode === 'walkable') {
        if (cellInfo && cellInfo.cellState.walkable !== paintMode) {
             toggleWalkable(cellInfo.row, cellInfo.col, paintMode);
        }
    }
    if (showTooltips) {
        if (cellInfo) {
            const cellKey = `${cellInfo.row}-${cellInfo.col}`;
            if (lastHoveredCell !== cellKey) {
                 lastHoveredCell = cellKey;
                 const tooltipContent = getTooltipText(cellInfo.cellState, cellInfo.row, cellInfo.col);
                 if (!infoTooltip) {
                    infoTooltip = L.tooltip({ sticky: true }).setLatLng(e.latlng).setContent(tooltipContent).addTo(map);
                 } else {
                    infoTooltip.setLatLng(e.latlng).setContent(tooltipContent);
                 }
            } else if (infoTooltip) {
                infoTooltip.setLatLng(e.latlng);
            }
        } else {
             lastHoveredCell = null;
             if (infoTooltip) {
                 map.removeLayer(infoTooltip);
                 infoTooltip = null;
             }
        }
    }
});

map.on('mouseup', () => { isPainting = false; });
map.on('mouseout', () => { if (infoTooltip) { map.removeLayer(infoTooltip); infoTooltip = null; } lastHoveredCell = null; });

map.on('click', (e) => {
    if (isPainting || isBrushModeActive) return;
    const cellInfo = latLngToCell(e.latlng);
    if (!cellInfo) return;
    if (editMode === 'walkable') toggleWalkable(cellInfo.row, cellInfo.col);
    else if (editMode === 'camera') openCameraEditor(cellInfo.row, cellInfo.col, cellInfo.cellState);
});

// --- FUNÇÕES DE MANIPULAÇÃO DE DADOS ---
function toggleWalkable(row, col, forceState = null) {
    const cellState = matrixState[row][col];
    const newState = forceState !== null ? forceState : !cellState.walkable;
    if (cellState.walkable === newState) return;
    cellState.walkable = newState;
    if (!cellState.walkable) cellState.cameras = [];
    isGridDirty = true;
}

function handleAddCamera() {
    if (!currentlyEditingCell) return;
    const cameraName = newCameraNameInput.value.trim();
    if (!cameraName) { alert("Por favor, digite um ID para a câmera."); return; }
    const { cellState } = currentlyEditingCell;
    if (cellState.cameras.includes(cameraName)) { alert("Este ID de câmera já foi adicionado a esta célula."); return; }
    cellState.cameras.push(cameraName);
    newCameraNameInput.value = '';
    newCameraNameInput.focus();
    renderCameraList();
    isGridDirty = true;
}

function handleRemoveCamera(event) {
    if (!currentlyEditingCell || !event.target.classList.contains('remove-camera-btn')) return;
    const cameraNameToRemove = event.target.dataset.cameraName;
    const { cellState } = currentlyEditingCell;
    cellState.cameras = cellState.cameras.filter(name => name !== cameraNameToRemove);
    renderCameraList();
    isGridDirty = true;
}

function preencherTudo(walkableState) {
    matrixState.forEach(row => {
        row.forEach(cellState => {
            cellState.walkable = walkableState;
            if (!walkableState) cellState.cameras = [];
        });
    });
    isGridDirty = true;
}

function carregarJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data && data.matrix && data.region_id) {
                Object.assign(GRID_BOUNDS, data.grid_bounds || {});
                TAMANHO_CELULA = data.cell_size || TAMANHO_CELULA;
                document.getElementById('region-id').value = data.region_id;
                inicializarMatriz(data.matrix);
                alert("Matriz carregada com sucesso!");
            } else {
                alert("Arquivo JSON inválido. Verifique o formato.");
            }
        } catch (error) {
            console.error("Erro ao ler o arquivo JSON:", error);
            alert("Ocorreu um erro ao ler o arquivo. Veja o console para detalhes.");
        }
    };
    reader.readAsText(file);
    event.target.value = null; 
}

function getTooltipText(cellState, row, col) {
    let text = `<b>Pos: [${row}, ${col}]</b><br>Andável: ${cellState.walkable ? 'Sim' : 'Não'}`;
    if (cellState.cameras.length > 0) {
        text += `<br>Câmeras: ${cellState.cameras.join(', ')}`;
    }
    return text;
}

function toggleBrushMode() {
    isBrushModeActive = !isBrushModeActive;
    brushModeBtn.classList.toggle('bg-blue-600', isBrushModeActive);
    brushModeBtn.classList.toggle('bg-gray-600', !isBrushModeActive);
    if (isBrushModeActive) map.dragging.disable();
    else { map.dragging.enable(); isPainting = false; }
}

function openCameraEditor(row, col, cellState) {
    if (!cellState.walkable) {
        alert("Só é possível gerenciar câmeras em áreas andáveis (azuis).");
        return;
    }
    currentlyEditingCell = { row, col, cellState };
    modalCellInfo.textContent = `[${row}, ${col}]`;
    renderCameraList();
    cameraModal.classList.remove('hidden');
    newCameraNameInput.focus();
}

function closeCameraEditor() {
    cameraModal.classList.add('hidden');
    currentlyEditingCell = null;
    newCameraNameInput.value = '';
}

function renderCameraList() {
    if (!currentlyEditingCell) return;
    const { cellState } = currentlyEditingCell;
    cameraListDiv.innerHTML = '';
    if (cellState.cameras.length === 0) {
        cameraListDiv.innerHTML = '<p class="text-gray-400">Nenhuma câmera adicionada.</p>';
        return;
    }
    cellState.cameras.forEach(cameraName => {
        const cameraItem = document.createElement('div');
        cameraItem.className = 'flex justify-between items-center bg-gray-600 p-2 rounded-md mb-2';
        cameraItem.innerHTML = `<span>${cameraName}</span><button data-camera-name="${cameraName}" class="remove-camera-btn text-red-400 hover:text-red-300 font-bold text-lg">&times;</button>`;
        cameraListDiv.appendChild(cameraItem);
    });
}

function setEditMode(mode) {
    editMode = mode;
    modeWalkableBtn.classList.toggle('bg-blue-600', mode === 'walkable');
    modeWalkableBtn.classList.toggle('text-white', mode === 'walkable');
    modeWalkableBtn.classList.toggle('shadow', mode === 'walkable');
    modeCameraBtn.classList.toggle('bg-blue-600', mode === 'camera');
    modeCameraBtn.classList.toggle('text-white', mode === 'camera');
    modeCameraBtn.classList.toggle('shadow', mode === 'camera');
    if (isBrushModeActive && mode === 'camera') toggleBrushMode();
}

function gerarJson() {
    const regionId = parseInt(regionIdInput.value, 10) || 1;
    const dataToExport = { region_id: regionId, grid_bounds: GRID_BOUNDS, cell_size: TAMANHO_CELULA, matrix: matrixState };
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matrix_region_${regionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function toggleTooltips() {
    showTooltips = toggleTooltipCheckbox.checked;
    if (!showTooltips && infoTooltip) {
        map.removeLayer(infoTooltip);
        infoTooltip = null;
        lastHoveredCell = null;
    }
}

// --- EVENT LISTENERS ---
modeWalkableBtn.addEventListener('click', () => setEditMode('walkable'));
modeCameraBtn.addEventListener('click', () => setEditMode('camera'));
brushModeBtn.addEventListener('click', toggleBrushMode);
generateBtn.addEventListener('click', gerarJson);
fillWalkableBtn.addEventListener('click', () => preencherTudo(true));
fillUnwalkableBtn.addEventListener('click', () => preencherTudo(false));
toggleTooltipCheckbox.addEventListener('change', toggleTooltips);
loadJsonInput.addEventListener('change', carregarJson);
closeModalButton.addEventListener('click', closeCameraEditor);
addCameraButton.addEventListener('click', handleAddCamera);
cameraListDiv.addEventListener('click', handleRemoveCamera);
newCameraNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddCamera(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && currentlyEditingCell) closeCameraEditor(); });

// --- INICIALIZAÇÃO ---
inicializarMatriz();
updateLoop();