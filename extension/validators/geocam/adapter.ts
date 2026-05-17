// Adaptor for the Geocam backend verification method.
// Conforms to the Validator interface.
// Incorporates Geocam specifics: endpoint, request shape, response shape.

import type { Validator, ValidationResult } from '../../core/validator-interface';

class GeoCamAdaptor implements Validator {
    readonly name = 'geocam';
    readonly displayName = 'GeoCam Verification';

    async validate(imageURL: string): Promise<ValidationResult> {
        return {
            status: 'unavailable',
            validatorName: this.name,
            error: 'GeoCam verification not yet implemented.',
        };
    }
}