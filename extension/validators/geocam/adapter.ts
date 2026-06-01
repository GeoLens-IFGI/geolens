// Adaptor for the Geocam backend verification method.
// Conforms to the Validator interface.
// Incorporates Geocam specifics: endpoint, request shape, response shape.
// The adapter only knows how to validate.
// The adapter DOES NOT send messages to the content script.

import type { Validator, ValidationResult } from '../../core/validator-interface';
import { registry } from '../../core/registry';

const GEOCAM_ENDPOINT = 'http://localhost:8000/verify-image/';

class GeoCamAdapter implements Validator {
    readonly name = 'geocam';
    readonly displayName = 'GeoCam Verification';

    async validate(imageURL: string): Promise<ValidationResult> {
        try {
            // 1. Download image bytes from its URL.
            const imageResponse = await fetch(imageURL);
            if (!imageResponse.ok) {
                return this.unavailable(`Could not fetch image (HTTP ${imageResponse.status}).`);
            }
            const blob = await imageResponse.blob();

            // 2. Send bytes to GeoCam service as multipart/form-data.
            const formData = new FormData();
            formData.append('file', blob, 'image.png');

            const apiResponse = await fetch(GEOCAM_ENDPOINT, {
                method: 'POST',
                body: formData,
            });

            if (!apiResponse.ok) {
                return this.unavailable('GeoCam service returned HTTP ${apiResponse.status}.');
            }

            // 3. Parse GeoCam response shape and translate to ValidationResult.
            const data = await apiResponse.json();

            if (data.status === 'verified') {
                return {
                    status: 'verified',
                    validatorName: this.name,
                    message: data.decoded_message,
                };
            } else {
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: data.decoded_message ?? 'GeoCam validation completed, but no decoded message was returned.',
                };
            }
        } catch (error) {
            console.error('[geocam adapter] validation failed:', error);
            return this.unavailable('GeoCam validation service is unavailable.');
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

registry.register(new GeoCamAdapter());