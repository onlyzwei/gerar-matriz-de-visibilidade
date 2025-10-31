/**
 * Script para converter matriz:
 * Se uma célula é acessível, automaticamente seta walkable = true
 */

const fs = require('fs');
const path = require('path');

/**
 * Converte uma matriz: acessível -> walkable
 * @param {Array} matrix - Matriz a ser convertida
 * @returns {number} Número de células convertidas
 */
function convertAccessibleToWalkable(matrix) {
    let convertedCount = 0;

    matrix.forEach(row => {
        if (Array.isArray(row)) {
            row.forEach(cell => {
                if (cell && cell.accessible === true && cell.walkable !== true) {
                    cell.walkable = true;
                    convertedCount++;
                }
            });
        }
    });

    return convertedCount;
}

/**
 * Processa arquivo JSON
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @param {string} outputPath - Caminho do arquivo de saída
 */
function processFile(inputPath, outputPath) {
    try {
        console.log(`\nProcessando arquivo...`);
        console.log(`Entrada: ${inputPath}`);

        // Ler arquivo
        const fileContent = fs.readFileSync(inputPath, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.matrix) {
            console.error('✗ Arquivo não contém campo "matrix"');
            return false;
        }

        // Converter
        const convertedCount = convertAccessibleToWalkable(data.matrix);

        // Adicionar metadados
        data.converted_accessible_to_walkable = true;
        data.converted_cells_count = convertedCount;
        data.conversion_date = new Date().toISOString();

        // Salvar
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');

        // Resumo
        console.log(`\n=== Resumo da Conversão ===`);
        console.log(`Células convertidas: ${convertedCount}`);
        console.log(`Arquivo salvo: ${outputPath}`);
        console.log(`✓ Conversão concluída!`);

        return true;
    } catch (error) {
        console.error(`✗ Erro: ${error.message}`);
        return false;
    }
}

/**
 * Converte múltiplos arquivos de um diretório
 * @param {string} inputDir - Diretório de entrada
 * @param {string} outputDir - Diretório de saída
 */
function processDirectory(inputDir, outputDir) {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.json'));

        if (files.length === 0) {
            console.log('Nenhum arquivo JSON encontrado.');
            return;
        }

        console.log(`Processando ${files.length} arquivo(s)...\n`);

        let successCount = 0;
        let totalConverted = 0;

        files.forEach((file, index) => {
            const inputPath = path.join(inputDir, file);
            const outputFileName = file.replace('.json', '_accessible_converted.json');
            const outputPath = path.join(outputDir, outputFileName);

            console.log(`[${index + 1}/${files.length}] ${file}`);
            
            try {
                const fileContent = fs.readFileSync(inputPath, 'utf8');
                const data = JSON.parse(fileContent);

                if (data.matrix) {
                    const convertedCount = convertAccessibleToWalkable(data.matrix);
                    data.converted_accessible_to_walkable = true;
                    data.converted_cells_count = convertedCount;
                    data.conversion_date = new Date().toISOString();

                    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
                    console.log(`  ✓ ${convertedCount} células convertidas`);
                    totalConverted += convertedCount;
                    successCount++;
                } else {
                    console.log(`  ✗ Campo "matrix" não encontrado`);
                }
            } catch (err) {
                console.log(`  ✗ Erro: ${err.message}`);
            }
        });

        console.log(`\n=== Resumo Final ===`);
        console.log(`Total de arquivos: ${files.length}`);
        console.log(`Arquivos processados: ${successCount}`);
        console.log(`Total de células convertidas: ${totalConverted}`);
    } catch (error) {
        console.error(`Erro ao processar diretório: ${error.message}`);
    }
}

// --- EXECUÇÃO ---
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Conversor: Acessível → Andável\n');
    console.log('Uso:');
    console.log('  node convert-accessible-to-walkable.js <entrada.json> <saida.json>');
    console.log('  node convert-accessible-to-walkable.js --dir <entrada> <saida>\n');
    console.log('Exemplos:');
    console.log('  node convert-accessible-to-walkable.js rota.json rota_converted.json');
    console.log('  node convert-accessible-to-walkable.js --dir ./matrices ./output');
    process.exit(0);
}

if (args[0] === '--dir') {
    const inputDir = args[1];
    const outputDir = args[2];
    if (!inputDir || !outputDir) {
        console.error('Erro: Especifique ambos os diretórios');
        process.exit(1);
    }
    processDirectory(inputDir, outputDir);
} else {
    const inputPath = args[0];
    const outputPath = args[1];
    if (!inputPath || !outputPath) {
        console.error('Erro: Especifique arquivo de entrada e saída');
        process.exit(1);
    }
    if (!fs.existsSync(inputPath)) {
        console.error(`Erro: Arquivo não encontrado: ${inputPath}`);
        process.exit(1);
    }
    processFile(inputPath, outputPath);
}
