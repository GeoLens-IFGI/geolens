// Validators register themselves here at startup,
// and the rest of the extension dispatches validation requests through it.
//
// A single shared instance (`registry`) is exported at the bottom of this file.
// Every file that imports `registry` receives the same instance.

import type { Validator, ValidationResult } from './validator-interface';

class ValidatorRegistry {
    // Map from validator name  -> validator instance.

    private validators = new Map<string, Validator>();

    // Register a verfication method. Called once per validator at startup,
    // typically from the bottom of each adaptor file.
    // Rejects duplicates.
    register(validator: Validator): void {
        if (this.validators.has(validator.name)) {
            throw new Error(
                `Validator '${validator.name}' is already registered.` +
                `Each verfication method requires a unique name.`
            );
        }
        this.validators.set(validator.name, validator);
        console.log(`[registry] registered validator: ${validator.name}`);
    }

    // Return all currently registered validators.
    getAll(): Validator[] {
        return Array.from(this.validators.values());
    }

    // Look up single validator by name.
    getByName(name: string): Validator | undefined {
        return this.validators.get(name);
    }

    // Run a single verfication method.
    // Returns 'undefined' if no such validation method exists.
    // Catch unexpected errors and return 'unavailable'.
    async validateWith(name: string, imageURL: string): Promise<ValidationResult | undefined> {
        const validator = this.getByName(name);
        if (!validator) {
            console.warn(`[registry] no verification method registered with name: ${name}`);
            return undefined;
        }
        return await this.runSafely(validator, imageURL);
    }

    // Run each registered verfication method against the same image.
    // Returns one ValidationResult per validator (in registration order).
    async validateWithAll(imageURL: string): Promise<ValidationResult[]> {
        const validators = this.getAll();
        const promises = validators.map((v) => this.runSafely(v, imageURL));
        return await Promise.all(promises);
    }

    // Internal helper: run a verification method
    // and convert unexpected exceptions into ValidationResult.
    private async runSafely(validator: Validator, imageURL: string): Promise<ValidationResult> {
        try {
            return await validator.validate(imageURL);
        } catch (error) {
            console.error(`[registry] validator '${validator.name}' threw unexpectedly:`, error);
            return {
                status: 'unavailable',
                validatorName: validator.name,
                error: 'Unexpected error: ${error instanceof Error ? error.message : String(error)}'
            };
        }
    }
}

// The single shared instance for the entire extension.
// Every file that imports `registry` will get this same instance (singleton).
export const registry = new ValidatorRegistry();