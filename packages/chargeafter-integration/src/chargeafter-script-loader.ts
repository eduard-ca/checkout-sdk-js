import { ChargeAfter, CHARGEAFTER_CDN_HOST } from './chargeafter';
import { PaymentMethodClientUnavailableError } from '@bigcommerce/checkout-sdk/payment-integration-api';
import loadChargeafterSdk from './chargeafter-sdk';

export default class ChargeafterScriptLoader {
    async load(apiKey = '', testMode?: boolean): Promise<ChargeAfter> {
        const cdnHost = testMode ? CHARGEAFTER_CDN_HOST.SANDBOX : CHARGEAFTER_CDN_HOST.PRODUCTION;

        const chargeafterWindow = await loadChargeafterSdk(apiKey, cdnHost);
        if (!chargeafterWindow) {
            throw new PaymentMethodClientUnavailableError();
        }

        return Promise.resolve(chargeafterWindow);
    }
}
