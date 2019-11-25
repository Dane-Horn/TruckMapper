const express = require('express');
const path = require('path');
const app = express();
let servedFolder = path.join(__dirname, 'dist');

app.get('/', (req, res) => {
    res.sendFile(path.join(servedFolder, 'index.html'));
});

app.use('/', express.static(servedFolder));

app.listen(process.env.PORT || 3000, () => {
    console.log('listening...');
});
