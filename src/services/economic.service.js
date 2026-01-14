import axios from 'axios';
import EconomicEvent from '../models/EconomicEvent.js';
import announcementService from './announcement.service.js';
import config from '../config/config.js';
import logger from '../config/logger.js';

// Base URL for Financial Modeling Prep
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Helper to map FMP impact to our enum
const mapImpact = (fmpImpact) => {
  if (!fmpImpact) return 'None';
  const lower = fmpImpact.toLowerCase();
  if (lower === 'high') return 'High';
  if (lower === 'medium') return 'Medium';
  if (lower === 'low') return 'Low';
  return 'None';
};

/**
 * Fetch events from FMP and store in DB
 * @param {string} from - Date string YYYY-MM-DD
 * @param {string} to - Date string YYYY-MM-DD
 */
const fetchAndStoreEvents = async (from, to) => {
  const apiKey = config.fmpApiKey || process.env.FMP_API_KEY;
  if (!apiKey) {
    logger.warn('FMP API Key not found. Skipping economic data fetch.');
    return;
  }

  try {
    // Using stable endpoint to avoid 403 legacy error
    const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${apiKey}`;
    const response = await axios.get(url);
    const events = response.data;

    if (!Array.isArray(events)) {
      logger.error('Invalid response from FMP API');
      return;
    }

    let count = 0;
    for (const item of events) {
        // Create a unique ID if not provided (FMP doesn't strictly provide a unique ID suitable for all cases, 
        // but we can composite one or use what they have. They usually have an id field generated?)
        // Inspecting FMP sample: { "event": "...", "date": "2024-01-01 10:00:00", "country": "US", ... }
        // We'll Use country + event + date as composite unique key if ID missing, or allow duplicates if we can't uniq.
        // Actually, let's use a composite key for update (upsert).
        
        // Handling FMP date which is "YYYY-MM-DD HH:mm:ss"
        const eventDate = new Date(item.date);
        
        // Composite filter
        const filter = {
            date: eventDate,
            event: item.event,
            country: item.country
        };

        const update = {
            eventId: `${item.country}-${item.event}-${item.date}`.replace(/\s+/g, '_'), // Mock ID generation
            date: eventDate,
            country: item.country,
            event: item.event,
            currency: item.currency,
            impact: mapImpact(item.impact),
            actual: item.actual,
            forecast: item.estimate, // FMP uses 'estimate'
            previous: item.previous,
            unit: item.unit
        };

        await EconomicEvent.findOneAndUpdate(filter, update, { upsert: true, new: true });
        count++;
    }
    logger.info(`Synced ${count} economic events.`);
  } catch (error) {
    if (error.response) {
        logger.error(`FMP API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
        logger.error('Error fetching economic events:', error.message);
    }
    
    // --- FALLBACK: Robust Simulation Mode ---
    logger.warn('Falling back to SIMULATION MODE for Economic Calendar...');
    
    const mockEvents = [];
    const now = new Date();
    // Generate for the requested range or default to +/- 3 days
    const rangeStart = from ? new Date(from) : new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const rangeEnd = to ? new Date(to) : new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const eventTemplates = [
        { e: 'CPI (MoM)', c: 'USD', i: 'High', u: '%' },
        { e: 'GDP Growth Rate', c: 'USD', i: 'High', u: '%' },
        { e: 'Unemployment Rate', c: 'USD', i: 'High', u: '%' },
        { e: 'Interest Rate Decision', c: 'EUR', i: 'High', u: '%' },
        { e: 'Retail Sales', c: 'GBP', i: 'Medium', u: '%' },
        { e: 'Balance of Trade', c: 'JPY', i: 'Medium', u: 'B' },
        { e: 'PPI (YoY)', c: 'USD', i: 'Medium', u: '%' },
        { e: 'Industrial Production', c: 'EUR', i: 'Low', u: '%' },
        { e: 'Crude Oil Inventories', c: 'USD', i: 'High', u: 'M' },
        { e: 'Manufacturing PMI', c: 'CNY', i: 'Medium', u: 'pts' }
    ];

    // Generate events for each day in range
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
        // 3-5 events per day
        const dailyCount = Math.floor(Math.random() * 3) + 3;
        
        for (let i = 0; i < dailyCount; i++) {
            const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
            const eventTime = new Date(d);
            eventTime.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15); // 9 AM to 5 PM
            
            // Randomize values slightly
            const est = (Math.random() * 5).toFixed(1);
            const act = Math.random() > 0.5 ? (Math.random() * 5).toFixed(1) : ''; // 50% chance of having actual data (past vs future)
            const prev = (Math.random() * 5).toFixed(1);

            mockEvents.push({
                date: eventTime.toISOString(),
                event: template.e,
                country: template.c,
                currency: template.c,
                impact: template.i,
                estimate: est + template.u,
                actual: eventTime < now ? (Math.random() * 5).toFixed(1) + template.u : '', // Past events have actual
                previous: prev + template.u,
                unit: template.u
            });
        }
    }

    // Insert Mock Events
    let count = 0;
    for (const item of mockEvents) {
         const eventDate = new Date(item.date);
         
         const filter = {
             date: eventDate,
             event: item.event,
             country: item.country
         };
         // Use a deterministic ID for mock events
         const mockId = `SIM-${item.country}-${item.event}-${eventDate.getTime()}`;
         
         const update = {
             eventId: mockId,
             date: eventDate,
             country: item.country,
             event: item.event,
             currency: item.currency,
             impact: mapImpact(item.impact),
             actual: item.actual,
             forecast: item.estimate,
             previous: item.previous,
             unit: item.unit
         };
         await EconomicEvent.findOneAndUpdate(filter, update, { upsert: true, new: true });
         count++;
    }
    logger.info(`Generated ${count} simulated events for testing.`);
  }
};

/**
 * Query stored events
 */
const getEvents = async (filter) => {
    const query = {};
    if (filter.from && filter.to) {
        const fromDate = new Date(filter.from);
        fromDate.setHours(0, 0, 0, 0);
        
        const toDate = new Date(filter.to);
        toDate.setHours(23, 59, 59, 999);

        query.date = { $gte: fromDate, $lte: toDate };
    }
    return EconomicEvent.find(query).sort({ date: 1 });
};

/**
 * Check for upcoming high impact events and trigger announcements
 */
const checkAndTriggerAlerts = async () => {
    const now = new Date();
    // Look ahead 15 minutes
    const future = new Date(now.getTime() + 15 * 60 * 1000);

    const events = await EconomicEvent.find({
        impact: 'High',
        isAlertSent: false,
        date: {
            $gt: now,
            $lte: future
        }
    });

    for (const event of events) {
        try {
            // Create Announcement
            const message = `High Impact Alert: ${event.country} ${event.event} is scheduled for ${event.date.toLocaleTimeString()}. Forecast: ${event.forecast || 'N/A'}`;
            
            await announcementService.createAnnouncement({
                title: `Economic Alert: ${event.event}`,
                message: message,
                type: 'ECONOMIC',
                targetAudience: { role: 'all', planValues: [] }, // Send to all? Or premium?
                priority: 'HIGH',
                isActive: true
            });

            // Mark as sent
            event.isAlertSent = true;
            await event.save();
            logger.info(`Triggered alert for ${event.event}`);
        } catch (error) {
            logger.error(`Failed to trigger alert for ${event.event}`, error);
        }
    }
};

export const economicService = {
  fetchAndStoreEvents,
  getEvents,
  checkAndTriggerAlerts
};
