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

            // GeoCam encodes the captured location and time inside the decoded
            // message, e.g. "Captured at: 2024-06-12 14:31 | Location: 51.96921,
            // 7.59613". Parse both out so the UI can map and date the image.
            const location = parseLocation(data.decoded_message);
            const capturedAt = parseCapturedAt(data.decoded_message);
            const details = { lat: location?.lat, lng: location?.lng, capturedAt };

            if (data.status === 'verified') {
                return {
                    status: 'verified',
                    validatorName: this.name,
                    message: data.decoded_message,
                    details,
                };
            } else {
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: data.decoded_message ?? 'GeoCam validation completed, but no decoded message was returned.',
                    details,
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

// Extract { lat, lng } from a GeoCam decoded message, if present.
// Expected fragment: "Location: <lat>, <lng>".
function parseLocation(message: unknown): { lat: number; lng: number } | undefined {
    if (typeof message !== 'string') return undefined;
    const match = message.match(/Location:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
    if (!match) return undefined;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined;
    return { lat, lng };
}

// Extract the capture time from a GeoCam decoded message, if present.
// Expected fragment: "Captured at: <time>" up to the next "|" or end of string.
function parseCapturedAt(message: unknown): string | undefined {
    if (typeof message !== 'string') return undefined;
    const match = message.match(/Captured at:\s*([^|]+?)\s*(?:\||$)/i);
    const value = match?.[1]?.trim();
    return value || undefined;
}

// Self-registration with the shared registry.
// Self-registration is triggered at import time, in
// this project the background script is importing this module.

registry.register(new GeoCamAdapter());