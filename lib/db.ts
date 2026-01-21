async function flushCloudQueue() {
    try {
        // Attempt to refresh the session before performing flush
        await refreshSession();
        console.log('Session refreshed successfully.');

        // Proceed with flush functionality
        // ...
    } catch (error) {
        console.error('Failed to refresh session:', error);
        // Implement retry logic
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`Retrying session refresh. Attempt ${attempt}...`);
            try {
                await refreshSession();
                console.log('Session refreshed successfully.');
                break; // Exit loop if session is refreshed
            } catch (retryError) {
                console.error('Retry failed:', retryError);
            }
        }
    }
}