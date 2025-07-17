// server.js

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve arquivos estáticos (HTML, CSS, JS) da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal que serve o nosso arquivo de mapa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log('Abra este endereço no seu navegador para criar a rota.');
});