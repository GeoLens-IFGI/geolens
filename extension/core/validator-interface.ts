// the possible outcomes of a verfication attempt.
// 'caution' = passed integrity checks but warrants a warning (e.g. valid
// signature whose signer is not on the trust list). Renders amber in the UI.
// 'verified-legacy' = trusted, but only via the frozen Interim Trust List
// (not the Conformance-Program trust list). Renders as a distinct tier.
export type ValidationStatus =
    | 'verified'
    | 'verified-legacy'
    | 'not-verified'
    | 'unavailable'
    | 'caution';

// the standardized result every verfication method returns.
// optional fields may be ommitted.
export type ValidationResult = {
    status: ValidationStatus;
    validatorName: string;
    message?: string;                  // Short, top-level summary line.
    detail?: string;                   // Longer technical reason (progressive disclosure).
    confidence?: number;
    details?: Record<string, unknown>  // Details specific to verification method.
    error?: string;                    // Reason for 'unavailable' status
};

// the contract followed by each verification method.
// Validator adaptors take an image URL and return a ValidationResult.
export interface Validator {
    readonly name: string;
    readonly displayName: string;
    validate(imageURL: string): Promise<ValidationResult>;
}