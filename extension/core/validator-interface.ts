// the possible outcomes of a verfication attempt.
export type ValidationStatus = 'verified' | 'not-verified' | 'unavailable';

// the standardized result every verfication method returns.
// optional fields may be ommitted.
export type ValidationResult = {
    status: ValidationStatus;
    validatorName: string;
    message?: string;
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