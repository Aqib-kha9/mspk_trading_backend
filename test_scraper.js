import axios from 'axios';
import * as cheerio from 'cheerio';

async function scrapeYahoo() {
    try {
        console.log('Fetching Yahoo Finance Calendar...');
        // Yahoo often requires cookies consent, but let's try basic GET
        const url = 'https://finance.yahoo.com/calendar/economic?day=2025-01-02'; // Use a future/current date
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(data);
        const events = [];

        // Yahoo structure is table based
        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length > 0) {
                const time = $(cols[0]).text().trim();
                const country = $(cols[1]).text().trim(); // Yahoo handles country differently? Actually looks like: Event, Country...
                // Need to inspect structure. Assuming: Time, Event, Importance?, Actual, Forecast...
                const event = $(cols[1]).text().trim();
                const eventName = $(cols[2]).text().trim();
                
                events.push({
                   time: time,
                   country: event, // Yahoo merges sometimes
                   event: eventName
                });
            }
        });

        console.log(`Scraped ${events.length} events.`);
        if (events.length > 0) console.log('Sample:', events[0]);
        
    } catch (error) {
        console.error('Scrape Error:', error.message);
        if (error.response) console.log('Status:', error.response.status);
    }
}

scrapeYahoo();
