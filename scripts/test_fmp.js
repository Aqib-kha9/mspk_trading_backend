import axios from 'axios';

const apiKey = 'KeYNc9qrQOUO1wV6U2Z5h8LElAIkc0co';
const ranges = 'from=2025-01-01&to=2025-01-08';

const endpoints = [
    `https://financialmodelingprep.com/api/v3/economic_calendar?${ranges}&apikey=${apiKey}`,
    `https://financialmodelingprep.com/api/v4/economic-calendar?${ranges}&apikey=${apiKey}`,
    `https://financialmodelingprep.com/stable/economic-calendar?${ranges}&apikey=${apiKey}`
];

for (const url of endpoints) {
    console.log('\nTesting URL:', url.split('?')[0]); // Hide params/key
    try {
        const response = await axios.get(url);
        console.log('✅ Success! Status:', response.status);
        console.log('Data Length:', response.data.length);
    } catch (error) {
        console.log('❌ Failed:', error.response ? error.response.status : error.message);
        if (error.response && error.response.data) {
             console.log('Msg:', JSON.stringify(error.response.data).substring(0, 100));
        }
    }
}
