/**
 * Script para converter matriz do formato antigo (sem accessible)
 * para o novo formato com campo accessible (padrão false)
 */

const fs = require('fs');
const path = require('path');

/**
 * Converte uma matriz do formato antigo para o novo
 * @param {Object} oldMatrix - Matriz no formato antigo
 * @returns {Object} Matriz no novo formato
 */
function convertMatrix(oldMatrix) {
    return oldMatrix.map(row =>
        row.map(cell => ({
            walkable: cell.walkable || false,
            accessible: false, // Padrão: NÃO acessível
            cameras: cell.cameras || []
        }))
    );
}

/**
 * Converte um arquivo JSON completo
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @param {string} outputPath - Caminho do arquivo de saída
 */
function convertFile(inputPath, outputPath) {
    try {
        const fileContent = fs.readFileSync(inputPath, 'utf8');
        const oldData = JSON.parse(fileContent);

        if (!oldData.matrix) {
            throw new Error('Arquivo não contém campo "matrix"');
        }

        const convertedMatrix = convertMatrix(oldData.matrix);

        const newData = {
            region_id: oldData.region_id || 1,
            grid_bounds: oldData.grid_bounds || {},
            cell_size: oldData.cell_size || 0.00003,
            matrix: convertedMatrix,
            converted_from: 'legacy_format',
            conversion_date: new Date().toISOString()
        };

        fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2), 'utf8');

        console.log(`✓ Conversão concluída com sucesso!`);
        console.log(`  Entrada: ${inputPath}`);
        console.log(`  Saída: ${outputPath}`);
        console.log(`  Linhas: ${convertedMatrix.length}`);
        console.log(`  Colunas: ${convertedMatrix[0]?.length || 0}`);
        console.log(`  Nota: Todas as células foram definidas com accessible = false`);

        return true;
    } catch (error) {
        console.error(`✗ Erro na conversão: ${error.message}`);
        return false;
    }
}

/**
 * Converte múltiplos arquivos de um diretório
 * @param {string} inputDir - Diretório com arquivos antigos
 * @param {string} outputDir - Diretório para arquivos convertidos
 */
function convertDirectory(inputDir, outputDir) {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const files = fs.readdirSync(inputDir)
            .filter(file => file.endsWith('.json'));

        if (files.length === 0) {
            console.log('Nenhum arquivo JSON encontrado no diretório de entrada.');
            return;
        }

        console.log(`Processando ${files.length} arquivo(s)...\n`);

        let successCount = 0;
        files.forEach((file, index) => {
            const inputPath = path.join(inputDir, file);
            const outputFileName = file.replace('.json', '_converted.json');
            const outputPath = path.join(outputDir, outputFileName);

            console.log(`[${index + 1}/${files.length}] ${file}`);
            if (convertFile(inputPath, outputPath)) {
                successCount++;
            }
            console.log();
        });

        console.log(`\n=== Resumo ===`);
        console.log(`Total: ${files.length}`);
        console.log(`Sucesso: ${successCount}`);
        console.log(`Erros: ${files.length - successCount}`);

    } catch (error) {
        console.error(`Erro ao processar diretório: ${error.message}`);
    }
}

// --- EXECUÇÃO ---
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Conversor de Matriz - Formato Legado para Novo Formato com "accessible"\n');
    console.log('Uso:');
    console.log('  Node para arquivo único:');
    console.log('    node converter.js <arquivo_entrada.json> <arquivo_saida.json>\n');
    console.log('  Node para diretório:');
    console.log('    node converter.js --dir <diretório_entrada> <diretório_saida>\n');
    console.log('Exemplos:');
    console.log('  node converter.js public/assets/rota.json public/assets/rota_new.json');
    console.log('  node converter.js --dir ./old_matrices ./new_matrices');
    process.exit(0);
}

if (args[0] === '--dir') {
    const inputDir = args[1];
    const outputDir = args[2];
    if (!inputDir || !outputDir) {
        console.error('Erro: Especifique ambos os diretórios de entrada e saída');
        process.exit(1);
    }
    convertDirectory(inputDir, outputDir);
} else {
    const inputPath = args[0];
    const outputPath = args[1];
    if (!inputPath || !outputPath) {
        console.error('Erro: Especifique arquivo de entrada e saída');
        process.exit(1);
    }
    convertFile(inputPath, outputPath);
}
