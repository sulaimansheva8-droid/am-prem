const express = require('express');
const axios = require('axios');

const app = express();

const BASE_URL = 'https://satriam.satriadeveloperz.workers.dev';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Content-Type': 'application/json',
    'Origin': BASE_URL,
    'Referer': BASE_URL + '/'
};

app.use(express.json());

// Menampilkan index.html dari GitHub
app.use(express.static(__dirname));

// API Send Magic Link
app.post('/api/satriam/send-link', async (req, res) => {
    try {
        const response = await axios.post(
            `${BASE_URL}/api/satriam/send-link`,
            req.body,
            {
                headers: HEADERS,
                timeout: 15000
            }
        );

        res.status(response.status).json(response.data);

    } catch (error) {
        const errorMsg = error.response?.data || {
            success: false,
            error: error.message
        };

        res.status(error.response?.status || 500).json(errorMsg);
    }
});

// API Verify Magic Link
app.post('/api/satriam/verify-link', async (req, res) => {
    try {
        const response = await axios.post(
            `${BASE_URL}/api/satriam/verify-link`,
            req.body,
            {
                headers: HEADERS,
                timeout: 15000
            }
        );

        res.status(response.status).json(response.data);

    } catch (error) {
        const errorMsg = error.response?.data || {
            success: false,
            error: error.message
        };

        res.status(error.response?.status || 500).json(errorMsg);
    }
});

module.exports = app;
