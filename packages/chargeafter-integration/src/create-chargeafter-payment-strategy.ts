import {
    PaymentStrategyFactory,
    toResolvableModule,
} from '@bigcommerce/checkout-sdk/payment-integration-api';
import ChargeafterPaymentStrategy from './chargeafter-payment-strategy';
import ChargeafterScriptLoader from './chargeafter-script-loader';

const createChargeafterPaymentStrategy: PaymentStrategyFactory<ChargeafterPaymentStrategy> = (
    paymentIntegrationService,
) => {
    return new ChargeafterPaymentStrategy(paymentIntegrationService, new ChargeafterScriptLoader());
};

export default toResolvableModule(createChargeafterPaymentStrategy, [{ id: 'chargeafter' }]);
