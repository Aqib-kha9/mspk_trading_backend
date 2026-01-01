import investing from 'investing-com-api';

async function test() {
    try {
        console.log('Fetching Investing.com data...');
        // Inspect payload
        console.log('Package exports:', JSON.stringify(investing, null, 2));
        
        if (!investing.economicCalendar) {
             throw new Error("economicCalendar function not found");
        }
        
        const data = await investing.economicCalendar({
            lang: 'en',
            timeZone: 'India Standard Time',
            calType: 'day', 
        });
        
        console.log('Success!', data.length, 'events found.');
        if (data.length > 0) {
            console.log('Sample:', data[0]);
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
