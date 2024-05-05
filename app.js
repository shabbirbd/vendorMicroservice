const express = require('express');
const app = express();
const port = 8000;

app.use(express.json()); // For parsing application/json

// Example endpoint
app.get('/createModel', async (req, res) => {
    try {
        // Include the specific logic for your route here
        res.status(200).send("Operation successful");
    } catch (error) {
        res.status(500).json({ error: 'Error message' });
    }
});

app.listen(port,'0.0.0.0', () => {
    console.log(`App running on http://localhost:${port}`);
});