// Import required packages
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON request bodies

// --- In-Memory Database (for demonstration) ---
let cardsDB = [];
let currentId = 1;

// --- Replicate API Helper ---
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL_NAME = "ibm-granite/granite-3.3-8b-instruct";

async function callReplicateApi(prompt) {
    if (!REPLICATE_API_TOKEN) {
        throw new Error("Replicate API Token belum diatur di environment variables server.");
    }

    // 1. Start prediction
    const startResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODEL_NAME,
            input: { 
                prompt: prompt,
                max_new_tokens: 256
            },
        }),
    });

    let prediction = await startResponse.json();
    if (startResponse.status !== 201) {
        throw new Error(prediction.detail || "Gagal memulai prediksi di Replicate.");
    }

    // 2. Poll for the result
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getResponse = await fetch(prediction.urls.get, {
            headers: {
                'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            },
        });
        prediction = await getResponse.json();
        if (getResponse.status !== 200) {
            throw new Error(prediction.detail || "Gagal mengambil status prediksi.");
        }
    }

    if (prediction.status === 'failed') {
        throw new Error("Prediksi AI gagal: " + prediction.error);
    }
    
    return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
}


// --- API Endpoints ---

// Endpoint to process extracted text with AI
app.post('/api/process-text', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: "Teks tidak boleh kosong." });
    }

    try {
        const prompt = `Anda adalah ahli pemilah kartu nama. Ekstrak nama, jabatan, perusahaan, nomor telepon, dan email dari teks berikut. Balas HANYA dengan objek JSON yang valid dengan kunci: "nama", "jabatan", "perusahaan", "nomorTelepon", "email". Jika sebuah field tidak ditemukan, gunakan string kosong. Teks: \n\n${text}`;
        
        const jsonString = await callReplicateApi(prompt);
        const cleanedJsonString = jsonString.replace(/```json\n?|\n?```/g, '').trim();
        const parsedData = JSON.parse(cleanedJsonString);

        res.json({ data: parsedData });
    } catch (error) {
        console.error('Error processing text with AI:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint to generate a follow-up email
app.post('/api/generate-email', async (req, res) => {
    const { card } = req.body;
    if (!card) {
        return res.status(400).json({ error: "Data kartu tidak boleh kosong." });
    }

    try {
        const prompt = `Anda adalah asisten komunikasi profesional. Tulis email follow-up yang singkat dan profesional untuk ${card.nama}, seorang ${card.jabatan || 'profesional'} di ${card.perusahaan}. Sebutkan bahwa senang bertemu dengannya dan ingin tetap terhubung untuk peluang di masa depan. Buat email kurang dari 100 kata. Tanda tangani sebagai 'Hormat saya,'.`;
        const emailText = await callReplicateApi(prompt);
        res.json({ email: emailText });
    } catch (error) {
        console.error('Error generating email:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- CRUD Endpoints for Business Cards ---

// GET all cards
app.get('/api/cards', (req, res) => {
    res.json({ cards: cardsDB });
});

// POST a new card
app.post('/api/cards', (req, res) => {
    const { nama, jabatan, perusahaan, nomorTelepon, email } = req.body;
    const newCard = { id: currentId++, nama, jabatan, perusahaan, nomorTelepon, email, tanggalDibuat: new Date().toISOString() };
    cardsDB.unshift(newCard); // Add to the beginning
    res.status(201).json(newCard);
});

// PUT (update) a card
app.put('/api/cards/:id', (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    const cardIndex = cardsDB.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
        return res.status(404).json({ error: "Kartu tidak ditemukan." });
    }
    const updatedCard = { ...cardsDB[cardIndex], ...req.body };
    cardsDB[cardIndex] = updatedCard;
    res.json(updatedCard);
});

// DELETE a card
app.delete('/api/cards/:id', (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    cardsDB = cardsDB.filter(c => c.id !== cardId);
    res.status(204).send(); // No content
});

app.post('/api/test', (req, res) => {
  res.status(200).json({ message: "POST request to /api/test successful!" });
});

// Health check / ping
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong 🚀 API is alive' });
});

// Export the Express app for Vercel to use
module.exports = app;