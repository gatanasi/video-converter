export class StateManager {
    constructor(initialState = {}) {
        this.state = { ...initialState };
        this.listeners = {};
    }

    getState() {
        return { ...this.state }; // Return a copy
    }

    setState(newState) {
        const changedKeys = [];
        for (const key in newState) {
            if (Object.hasOwnProperty.call(newState, key) && this.state[key] !== newState[key]) {
                this.state[key] = newState[key];
                changedKeys.push(key);
            }
        }

        if (changedKeys.length > 0) {
            changedKeys.forEach(key => {
                const eventName = `${key}Changed`; // e.g., 'videosListChanged'
                if (this.listeners[eventName]) {
                    this.listeners[eventName].forEach(callback => {
                        try {
                            callback(this.state[key]); // Pass the new value
                        } catch (error) {
                            console.error(`Error in listener for ${eventName}:`, error);
                        }
                    });
                }
            });
            // Notify general 'stateChanged' listeners
            if (this.listeners['stateChanged']) {
                this.listeners['stateChanged'].forEach(callback => {
                    try {
                        callback(this.getState()); // Pass the full new state
                    } catch (error) {
                        console.error(`Error in listener for stateChanged:`, error);
                    }
                });
            }
        }
    }

    subscribe(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        if (!this.listeners[eventName].includes(callback)) {
            this.listeners[eventName].push(callback);
        }
    }

    unsubscribe(eventName, callback) {
        if (this.listeners[eventName]) {
            this.listeners[eventName] = this.listeners[eventName].filter(
                listener => listener !== callback
            );
        }
    }
}
