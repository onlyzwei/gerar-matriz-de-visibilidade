/**
 * Script para converter trilha GPX em células acessíveis
 * Marca todas as células que pertencem à trilha como accessible: true
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Configuração dos bounds do grid
const GRID_BOUNDS = {
    minLat: -22.90272,
    maxLat: -22.89373,
    minLng: -43.14098,
    maxLng: -43.12682
};
const TAMANHO_CELULA = 0.00003;

/**
 * Converte coordenadas lat/lng em índices de célula
 */
function latLngToCell(lat, lng) {
    if (lat > GRID_BOUNDS.maxLat || lat < GRID_BOUNDS.minLat || 
        lng < GRID_BOUNDS.minLng || lng > GRID_BOUNDS.maxLng) {
        return null;
    }
    const row = Math.floor((GRID_BOUNDS.maxLat - lat) / TAMANHO_CELULA);
    const col = Math.floor((lng - GRID_BOUNDS.minLng) / TAMANHO_CELULA);
    return { row, col };
}

/**
 * Lê arquivo GPX e extrai pontos da trilha
 */
async function parseGPX(gpxFilePath) {
    try {
        const gpxContent = fs.readFileSync(gpxFilePath, 'utf8');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(gpxContent);

        const trackPoints = [];
        
        // Extrair pontos de <trk><trkseg><trkpt>
        if (result.gpx && result.gpx.trk) {
            result.gpx.trk.forEach(track => {
                if (track.trkseg) {
                    track.trkseg.forEach(segment => {
                        if (segment.trkpt) {
                            segment.trkpt.forEach(point => {
                                const lat = parseFloat(point.$.lat);
                                const lng = parseFloat(point.$.lon);
                                if (!isNaN(lat) && !isNaN(lng)) {
                                    trackPoints.push({ lat, lng });
                                }
                            });
                        }
                    });
                }
            });
        }

        // Extrair pontos de <wpt> (waypoints) se não houver tracks
        if (trackPoints.length === 0 && result.gpx && result.gpx.wpt) {
            result.gpx.wpt.forEach(point => {
                const lat = parseFloat(point.$.lat);
                const lng = parseFloat(point.$.lon);
                if (!isNaN(lat) && !isNaN(lng)) {
                    trackPoints.push({ lat, lng });
                }
            });
        }

        return trackPoints;
    } catch (error) {
        console.error(`✗ Erro ao ler arquivo GPX: ${error.message}`);
        return [];
    }
}

/**
 * Converte arquivo JSON de matriz e marca células da trilha como acessíveis
 */
function updateMatrixWithTrack(matrixData, trackPoints) {
    const accessibleCells = [];
    let skippedPoints = 0;

    trackPoints.forEach(point => {
        const cell = latLngToCell(point.lat, point.lng);
        
        if (cell === null) {
            skippedPoints++;
            return;
        }

        const { row, col } = cell;

        // Validar se célula existe na matriz
        if (!matrixData.matrix[row] || !matrixData.matrix[row][col]) {
            skippedPoints++;
            return;
        }

        // Marcar como acessível
        matrixData.matrix[row][col].accessible = true;
        accessibleCells.push({ row, col, lat: point.lat, lng: point.lng });
    });

    return { accessibleCells, skippedPoints };
}

/**
 * Processa arquivo GPX e atualiza matriz JSON
 */
async function processGPXToMatrix(gpxPath, matrixPath, outputPath) {
    try {
        console.log(`\nProcessando trilha GPX...`);
        console.log(`Entrada: ${gpxPath}`);
        
        // Ler arquivo GPX
        const trackPoints = await parseGPX(gpxPath);
        
        if (trackPoints.length === 0) {
            console.error('✗ Nenhum ponto de trilha encontrado no arquivo GPX');
            return false;
        }
        
        console.log(`✓ ${trackPoints.length} pontos encontrados na trilha`);

        // Ler matriz JSON
        const matrixContent = fs.readFileSync(matrixPath, 'utf8');
        const matrixData = JSON.parse(matrixContent);

        if (!matrixData.matrix) {
            console.error('✗ Arquivo JSON não contém campo "matrix"');
            return false;
        }

        // Atualizar matriz
        const { accessibleCells, skippedPoints } = updateMatrixWithTrack(matrixData, trackPoints);

        // Adicionar metadados
        matrixData.gpx_source = path.basename(gpxPath);
        matrixData.accessible_cells_count = accessibleCells.length;
        matrixData.processed_date = new Date().toISOString();

        // Salvar arquivo atualizado
        fs.writeFileSync(outputPath, JSON.stringify(matrixData, null, 2), 'utf8');

        // Exibir resumo
        console.log(`\n=== Resumo da Conversão ===`);
        console.log(`Pontos processados: ${trackPoints.length}`);
        console.log(`Células marcadas como acessíveis: ${accessibleCells.length}`);
        console.log(`Pontos fora dos limites: ${skippedPoints}`);
        console.log(`Arquivo salvo: ${outputPath}`);
        console.log(`Grid: ${GRID_BOUNDS.minLat} a ${GRID_BOUNDS.maxLat} (lat)`);
        console.log(`       ${GRID_BOUNDS.minLng} a ${GRID_BOUNDS.maxLng} (lng)`);

        return true;
    } catch (error) {
        console.error(`✗ Erro ao processar: ${error.message}`);
        return false;
    }
}

// --- EXECUÇÃO ---
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Conversor de GPX para Matriz Acessível\n');
    console.log('Uso:');
    console.log('  node gpx-to-accessible.js <arquivo.gpx> <matriz.json> [saida.json]\n');
    console.log('Exemplos:');
    console.log('  node gpx-to-accessible.js trilha.gpx rota.json rota_com_trilha.json');
    console.log('  node gpx-to-accessible.js trilha.gpx rota.json\n');
    console.log('Se saida.json não for especificado, será gerado automaticamente.');
    process.exit(0);
}

const gpxPath = args[0];
const matrixPath = args[1];
const outputPath = args[2] || `${path.basename(matrixPath, '.json')}_com_trilha.json`;

// Verificar se arquivos existem
if (!fs.existsSync(gpxPath)) {
    console.error(`✗ Arquivo GPX não encontrado: ${gpxPath}`);
    process.exit(1);
}

if (!fs.existsSync(matrixPath)) {
    console.error(`✗ Arquivo matriz não encontrado: ${matrixPath}`);
    process.exit(1);
}

processGPXToMatrix(gpxPath, matrixPath, outputPath)
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
        console.error(`Erro: ${error.message}`);
        process.exit(1);
    });
