import { PaymentIntegrationService } from '@bigcommerce/checkout-sdk/payment-integration-api';
import { PaymentIntegrationServiceMock } from '@bigcommerce/checkout-sdk/payment-integrations-test-utils';
import createChargeafterPaymentStrategy from './create-chargeafter-payment-strategy';
import ChargeafterPaymentStrategy from './chargeafter-payment-strategy';

describe('createChargeafterPaymentStrategy', () => {
    let paymentIntegrationService: PaymentIntegrationService;

    beforeEach(() => {
        paymentIntegrationService = new PaymentIntegrationServiceMock();
    });

    it('should create chargeafter payment strategy', () => {
        const strategy = createChargeafterPaymentStrategy(paymentIntegrationService);

        expect(strategy).toBeInstanceOf(ChargeafterPaymentStrategy);
    });
});
