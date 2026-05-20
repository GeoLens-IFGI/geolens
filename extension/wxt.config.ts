import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        permissions: ['contextMenus'],
        host_permissions: ['<all_urls>'],
    },
});
