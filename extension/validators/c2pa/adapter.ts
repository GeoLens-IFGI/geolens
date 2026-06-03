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
    // onto the extension's four-state ValidationStatus. The UI surfaces four
    // tiers: verified (green), caution (amber), not-verified (red), and
    // unavailable (gray).
    //
    //   verified         -> verified  : integrity AND identity confirmed.
    //   signed-untrusted -> caution   : valid + untampered, signer not vetted.
    //   expired          -> caution   : see note below.
    //   tampered         -> red       : cryptographic / integrity failures —
    //   signature-invalid                the highest alert tier.
    //   revoked          -> red
    //   no-manifest      -> gray      : the normal case for ~all web images.
    //   error            -> gray
    //
    // On `expired`: c2pa-rs only emits the expired codes when there is no
    // trusted RFC-3161 timestamp proving the asset was signed while the cert
    // was still valid. So once the backend reports "expired", there was no
    // timestamp to rescue it — amber (not red) is the honest signal.
    private translate(data: any): ValidationResult {
        const summary = (data && data.summary) || {};
        const backendStatus: string = summary.status ?? 'error';

        // Signer common name lives at summary.signer.common_name (nested object).
        const signer: string | undefined = summary.signer?.common_name;
        const signerSuffix = signer ? ` Signed by ${signer}.` : '';

        // The specific cryptographic reason(s), for progressive disclosure.
        const detail = this.failureDetail(data);

        switch (backendStatus) {
            case 'verified':
                return {
                    status: 'verified',
                    validatorName: this.name,
                    message: `Valid Content Credentials.${signerSuffix}`,
                    details: summary,
                };
            case 'verified-legacy':
                return {
                    status: 'verified-legacy',
                    validatorName: this.name,
                    message: `Valid Content Credentials, trusted via the legacy Interim Trust List (not yet Conformance-Program vetted).${signerSuffix}`,
                    details: summary,
                };
            case 'signed-untrusted':
                return {
                    status: 'caution',
                    validatorName: this.name,
                    message: `Valid Content Credentials, but the signer is not on the trust list.${signerSuffix}`,
                    detail,
                    details: summary,
                };
            case 'expired': {
                const signedOn = typeof summary.signed_at === 'string' ? summary.signed_at : undefined;
                const signedNote = signedOn ? ` Signed on ${signedOn}.` : '';
                return {
                    status: 'caution',
                    validatorName: this.name,
                    message: `Valid Content Credentials, but the signing certificate could not be confirmed valid at signing time.${signedNote}`,
                    detail,
                    details: summary,
                };
            }
            case 'tampered':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'Content Credentials present, but the image was modified after signing. This image may have been altered or the credentials are invalid.',
                    detail,
                    details: summary,
                };
            case 'signature-invalid':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'The Content Credentials signature is invalid. This image may have been altered or the credentials are invalid.',
                    detail,
                    details: summary,
                };
            case 'revoked':
                return {
                    status: 'not-verified',
                    validatorName: this.name,
                    message: 'The signing credential was revoked. This image may have been altered or the credentials are invalid.',
                    detail,
                    details: summary,
                };
            case 'no-manifest':
                return this.unavailable('No Content Credentials found in this image.');
            default:
                return this.unavailable('Could not read Content Credentials for this image.');
        }
    }

    // Build a human-readable, multi-line reason from the failure codes in the
    // validation-results-map. Used for the "Why?" progressive-disclosure toggle.
    private failureDetail(data: any): string | undefined {
        const failures = data?.validation_results?.activeManifest?.failure;
        if (!Array.isArray(failures) || failures.length === 0) return undefined;

        const lines = failures
            .map((f: any) => {
                const code = typeof f?.code === 'string' ? f.code : undefined;
                const explanation = typeof f?.explanation === 'string' ? f.explanation : undefined;
                if (code && explanation) return `${code} — ${explanation}`;
                return explanation || code;
            })
            .filter((line: unknown): line is string => typeof line === 'string' && line.length > 0);

        return lines.length ? lines.join('\n') : undefined;
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
