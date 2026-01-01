import axios from 'axios';
import Parser from 'rss-parser';

const parser = new Parser();

async function testRSS() {
    try {
        console.log('Fetching ForexFactory RSS...');
        const url = 'https://www.forexfactory.com/rss.php?calendar'; // often they accept query params or just rss.php
        // Try strict calendar URL if known, else generic
        
        const feed = await parser.parseURL('https://www.forexfactory.com/rss.php?calendar');
        console.log('Feed Title:', feed.title);
        console.log('Items:', feed.items.length);
        
        if (feed.items.length > 0) {
            console.log('Sample Item:', feed.items[0]);
        }
    } catch (error) {
        console.error('RSS Error:', error.message);
    }
}

testRSS();
