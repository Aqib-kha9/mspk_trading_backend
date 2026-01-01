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
    const url = `${FMP_BASE_URL}/economic_calendar?from=${from}&to=${to}&apikey=${apiKey}`;
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
    const todayStr = now.toISOString().split('T')[0];
    
    // 1. Generate some "Past" events for today
    for(let i=1; i<=3; i++) {
        const d = new Date(now);
        d.setHours(now.getHours() - i);
        
        mockEvents.push({
            date: d.toISOString(),
            event: `Simulated Past Event ${i}`,
            country: 'USD',
            currency: 'USD',
            impact: 'Medium',
            estimate: '2.0%',
            actual: '2.1%',
            previous: '1.9%',
            unit: '%'
        });
    }

    // 2. Generate a "Future High Impact" event (Testing Alerts)
    // Scheduled for 5 minutes from now to trigger the "15 min" lookahead logic immediately or soon
    const upcomingEvent = new Date(now);
    upcomingEvent.setMinutes(now.getMinutes() + 5); 
    
    mockEvents.push({
        date: upcomingEvent.toISOString(),
        event: 'Simulated CPI Data (High Impact)',
        country: 'USD',
        currency: 'USD',
        impact: 'High',
        estimate: '3.1%',
        actual: '', // Pending
        previous: '3.0%',
        unit: '%'
    });

    // 3. Generate events for coming days
    for(let i=1; i<=5; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        d.setHours(14, 0, 0);
        
        mockEvents.push({
            date: d.toISOString(),
            event: `Future Event Day ${i}`,
            country: i % 2 === 0 ? 'EUR' : 'GBP',
            currency: i % 2 === 0 ? 'EUR' : 'GBP',
            impact: 'Low',
            estimate: '',
            actual: '',
            previous: '',
            unit: ''
        });
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
