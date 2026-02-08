import apiClient from './client';

export const settingsApi = {
    getSettings: async () => {
        const response = await apiClient.get('/api/settings');
        return response;
    },

    updateSettings: async (settings) => {
        const response = await apiClient.put('/api/settings', settings);
        return response;
    }
};
