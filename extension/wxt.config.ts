import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react'],
    vite: () => ({
        plugins: [tailwindcss()],
    }),
    manifest: {
        name: 'GeoLens',
        permissions: ['contextMenus'],
        host_permissions: ['<all_urls>'],
        web_accessible_resources: [
            {
                resources: ['lens32.png'],
                matches: ['<all_urls>'],
            },
        ],
    },
});
