"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const express = require('express');
const app = express();
const port = 8000;
// Example endpoint
app.get('/createModel', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Include the specific logic for your route here
        res.status(200).send("Operation successful");
    }
    catch (error) {
        res.status(500).json({ error: 'Error message' });
    }
}));
app.listen(port, '0.0.0.0', () => {
    console.log(`App running on http://localhost:${port}`);
});
