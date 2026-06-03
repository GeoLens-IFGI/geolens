// Adaptor for the C2PA Content Credentials verification method.
// Conforms to the Validator interface.
// Incorporates C2PA specifics: endpoint, request shape, response shape.
// The adapter only knows how to validate.
// The adapter DOES NOT send messages to the content script.

import type { Validator, ValidationResult } from '../../core/validator-interface';
import { registry } from '../../core/registry';

const C2PA_ENDPOINT = 'http://localhost:8001/c2pa/verify';

class C2paAdapter implements Validator {
    readonly name = 'c2pa';
    readonly displayName = 'C2PA Content Credentials';

    async validate(imageURL: string): Promise<ValidationResult> {
        try {
            // 1. Download image bytes from its URL.
            const imageResponse = await fetch(imageURL);
            if (!imageResponse.ok) {
                return this.unavailable(`Could not fetch image (HTTP ${imageResponse.status}).`);
            }
            const blob = await imageResponse.blob();

            // 2. Send bytes to the C2PA service as multipart/form-data.
            const formData = new FormData();
            formData.append('file', blob, 'image.png');

            const apiResponse = await fetch(C2PA_ENDPOINT, {
                method: 'POST',
                body: formData,
            });

            if (!apiResponse.ok) {
                return this.unavailable(`C2PA service returned HTTP ${apiResponse.status}.`);
            }

            // 3. Parse the C2PA response shape and translate to ValidationResult.
            const data = await apiResponse.json();
            return this.translate(data);
        } catch (error) {
            console.error('[c2pa adapter] validation failed:', error);
            return this.unavailable('C2PA validation service is unavailable.');
        }
    }

    // Map the backend's `summary.status` (validation-results-map vocabulary)
    // onto the extension's three-state ValidationStatus.
    private translate(data: any): ValidationResult {
        const summary = (data && data.summary) || {};
        const backendStatus: string = summary.status ?? 'error';
        const signer: string | undefined = summary.signer_common_name;
        const signerSuffix = signer ? ` Signed by ${signer}.` : '';

        switch (backendStatus) {
            case 'verified':
                return {
                    status: 'verified',
                    validatorName: this.name,
                    message: `Valid Content Credentials.${signerSuffix}`,
                    details: summary,
                };
            case 'signed-untrusted':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: `Signed, but the signer is not on the trust list.${signerSuffix}`,
                    details: summary,
                };
            case 'tampered':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'Content Credentials present, but the image was modified after signing.',
                    details: summary,
                };
            case 'signature-invalid':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'The Content Credentials signature is invalid.',
                    details: summary,
                };
            case 'expired':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'The signing certificate was outside its validity period at signing time.',
                    details: summary,
                };
            case 'revoked':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'The signing credential was revoked.',
                    details: summary,
                };
            case 'no-manifest':
                return this.unavailable('No Content Credentials found in this image.');
            default:
                return this.unavailable('Could not read Content Credentials for this image.');
        }
    }

    // Helper function: build an 'unavailable' result with
    // a consistent shape.
    private unavailable(reason: string): ValidationResult {
        return {
            status: 'unavailable',
            validatorName: this.name,
            error: reason,
        };
    }
}

// Self-registration with the shared registry.
// Self-registration is triggered at import time, in
// this project the background script is importing this module.

registry.register(new C2paAdapter());
