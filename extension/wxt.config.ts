import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        permissions: ['contextMenus'],
        host_permissions: ['<all_urls>'],
        web_accessible_resources: [
            {
                resources: ['magnifying-lens-128.png'],
                matches: ['<all_urls>'],
            },
        ],
    },
});
