import {
    BraintreeConnectAddress,
    BraintreeConnectCardComponent,
    BraintreeFastlaneAuthenticationState,
    BraintreeFastlaneCardComponent,
    BraintreeFastlaneCardComponentOptions,
    BraintreeInitializationData,
    isBraintreeAcceleratedCheckoutCustomer,
} from '@bigcommerce/checkout-sdk/braintree-utils';
import {
    Address,
    InvalidArgumentError,
    isHostedInstrumentLike,
    isVaultedInstrument,
    OrderFinalizationNotRequiredError,
    OrderPaymentRequestBody,
    OrderRequestBody,
    Payment,
    PaymentArgumentInvalidError,
    PaymentInitializeOptions,
    PaymentIntegrationService,
    PaymentMethod,
    PaymentMethodClientUnavailableError,
    PaymentRequestOptions,
    PaymentStrategy,
    VaultedInstrument,
} from '@bigcommerce/checkout-sdk/payment-integration-api';
import { BrowserStorage } from '@bigcommerce/checkout-sdk/storage';

import { WithBraintreeFastlanePaymentInitializeOptions } from './braintree-fastlane-payment-initialize-options';
import BraintreeFastlaneUtils from './braintree-fastlane-utils';
import isBraintreeConnectCardComponent from './is-braintree-connect-card-component';
import isBraintreeFastlaneCardComponent from './is-braintree-fastlane-card-component';

export default class BraintreeFastlanePaymentStrategy implements PaymentStrategy {
    private braintreeCardComponent?: BraintreeFastlaneCardComponent | BraintreeConnectCardComponent;
    private isFastlaneEnabled?: boolean;

    constructor(
        private paymentIntegrationService: PaymentIntegrationService,
        private braintreeFastlaneUtils: BraintreeFastlaneUtils,
        private browserStorage: BrowserStorage,
    ) {}

    /**
     *
     * Default methods
     *
     * */
    async initialize(
        options: PaymentInitializeOptions & WithBraintreeFastlanePaymentInitializeOptions,
    ): Promise<void> {
        const { methodId, braintreefastlane } = options;

        if (!methodId) {
            throw new InvalidArgumentError(
                'Unable to initialize payment because "options.methodId" argument is not provided.',
            );
        }

        if (!braintreefastlane) {
            throw new InvalidArgumentError(
                'Unable to initialize payment because "options.braintreefastlane" argument is not provided.',
            );
        }

        if (!braintreefastlane.onInit || typeof braintreefastlane.onInit !== 'function') {
            throw new InvalidArgumentError(
                'Unable to initialize payment because "options.braintreefastlane.onInit" argument is not provided or it is not a function.',
            );
        }

        const paymentMethod = await this.getValidPaymentMethodOrThrow(methodId);

        this.isFastlaneEnabled = !!paymentMethod?.initializationData?.isFastlaneEnabled;

        await this.braintreeFastlaneUtils.initializeBraintreeAcceleratedCheckoutOrThrow(
            methodId,
            braintreefastlane.styles,
        );

        if (this.shouldRunAuthenticationFlow() && !this.isFastlaneEnabled) {
            await this.braintreeFastlaneUtils.runPayPalConnectAuthenticationFlowOrThrow();
        }

        if (this.shouldRunAuthenticationFlow() && this.isFastlaneEnabled) {
            await this.braintreeFastlaneUtils.runPayPalFastlaneAuthenticationFlowOrThrow();
        }

        this.initializeCardComponent();

        braintreefastlane.onInit((container) => this.renderBraintreeAXOComponent(container));
    }

    async execute(orderRequest: OrderRequestBody, options?: PaymentRequestOptions): Promise<void> {
        const { payment, ...order } = orderRequest;

        if (!payment) {
            throw new PaymentArgumentInvalidError(['payment']);
        }

        const { paymentData, methodId } = payment;

        const paymentPayload =
            paymentData && isVaultedInstrument(paymentData)
                ? await this.prepareVaultedInstrumentPaymentPayload(methodId, paymentData)
                : await this.preparePaymentPayload(methodId, paymentData);

        await this.paymentIntegrationService.submitOrder(order, options);
        await this.paymentIntegrationService.submitPayment(paymentPayload);

        this.browserStorage.removeItem('sessionId');
    }

    finalize(): Promise<void> {
        return Promise.reject(new OrderFinalizationNotRequiredError());
    }

    async deinitialize(): Promise<void> {
        this.braintreeCardComponent = undefined;

        return Promise.resolve();
    }

    /**
     *
     * Braintree AXO Component rendering method
     *
     */
    private initializeCardComponent() {
        const state = this.paymentIntegrationService.getState();
        const { phone } = state.getBillingAddressOrThrow();

        const cardComponentOptions: BraintreeFastlaneCardComponentOptions = {
            styles: {},
            fields: {
                ...(phone && {
                    phoneNumber: {
                        prefill: phone,
                    },
                }),
            },
        };

        let paypalCreditCardComponent;

        if (this.isFastlaneEnabled) {
            paypalCreditCardComponent =
                this.braintreeFastlaneUtils.getBraintreeFastlaneComponentOrThrow();
        } else {
            paypalCreditCardComponent =
                this.braintreeFastlaneUtils.getBraintreeConnectComponentOrThrow();
        }

        this.braintreeCardComponent = paypalCreditCardComponent(cardComponentOptions);
    }

    private renderBraintreeAXOComponent(container?: string) {
        const braintreeCardComponent = this.getBraintreeCardComponentOrThrow();

        if (!container) {
            throw new InvalidArgumentError(
                'Unable to initialize payment because "container" argument is not provided.',
            );
        }

        braintreeCardComponent.render(container);
    }

    /**
     *
     * Payment Payload preparation methods
     *
     */
    private async prepareVaultedInstrumentPaymentPayload(
        methodId: string,
        paymentData: VaultedInstrument,
    ): Promise<Payment> {
        const deviceSessionId = await this.braintreeFastlaneUtils.getDeviceSessionId();

        const { instrumentId } = paymentData;

        if (this.isPayPalFastlaneInstrument(instrumentId)) {
            return {
                methodId,
                paymentData: {
                    deviceSessionId,
                    formattedPayload: {
                        ...(this.isFastlaneEnabled
                            ? {
                                  paypal_fastlane_token: {
                                      token: instrumentId,
                                  },
                              }
                            : {
                                  paypal_connect_token: {
                                      token: instrumentId,
                                  },
                              }),
                    },
                },
            };
        }

        return {
            methodId,
            paymentData: {
                ...paymentData,
                instrumentId,
                deviceSessionId,
            },
        };
    }

    private async preparePaymentPayload(
        methodId: string,
        paymentData: OrderPaymentRequestBody['paymentData'],
    ): Promise<Payment> {
        const state = this.paymentIntegrationService.getState();
        const billingAddress = state.getBillingAddressOrThrow();
        // Info: shipping can be unavailable for carts with digital items
        const shippingAddress = state.getShippingAddress();

        const deviceSessionId = await this.braintreeFastlaneUtils.getDeviceSessionId();

        const { shouldSaveInstrument = false, shouldSetAsDefaultInstrument = false } =
            isHostedInstrumentLike(paymentData) ? paymentData : {};

        const braintreeCreditCardComponent = this.getBraintreeCardComponentOrThrow();

        const paypalBillingAddress = this.mapToPayPalAddress(billingAddress);
        const paypalShippingAddress = shippingAddress && this.mapToPayPalAddress(shippingAddress);

        let token;

        if (
            this.isFastlaneEnabled &&
            isBraintreeFastlaneCardComponent(braintreeCreditCardComponent)
        ) {
            const { id } = await braintreeCreditCardComponent.getPaymentToken({
                billingAddress: paypalBillingAddress,
            });

            token = id;
        } else if (isBraintreeConnectCardComponent(braintreeCreditCardComponent)) {
            const { nonce } = await braintreeCreditCardComponent.tokenize({
                billingAddress: paypalBillingAddress,
                ...(paypalShippingAddress && { shippingAddress: paypalShippingAddress }),
            });

            token = nonce;
        }

        return {
            methodId,
            paymentData: {
                ...paymentData,
                deviceSessionId,
                shouldSaveInstrument,
                shouldSetAsDefaultInstrument,
                nonce: token,
            },
        };
    }

    private mapToPayPalAddress(address?: Address): BraintreeConnectAddress {
        return {
            streetAddress: address?.address1 || '',
            locality: address?.city || '',
            region: address?.stateOrProvinceCode || '',
            postalCode: address?.postalCode || '',
            countryCodeAlpha2: address?.countryCode || '',
        };
    }

    /**
     *
     * Other methods
     *
     */
    private shouldRunAuthenticationFlow(): boolean {
        const state = this.paymentIntegrationService.getState();
        const cart = state.getCartOrThrow();
        const paymentProviderCustomer = state.getPaymentProviderCustomer();
        const braintreePaymentProviderCustomer = isBraintreeAcceleratedCheckoutCustomer(
            paymentProviderCustomer,
        )
            ? paymentProviderCustomer
            : {};

        const paypalFastlaneSessionId = this.browserStorage.getItem('sessionId');

        if (
            braintreePaymentProviderCustomer?.authenticationState ===
            BraintreeFastlaneAuthenticationState.CANCELED
        ) {
            return false;
        }

        return (
            !braintreePaymentProviderCustomer?.authenticationState &&
            paypalFastlaneSessionId === cart.id
        );
    }

    private getBraintreeCardComponentOrThrow() {
        if (!this.braintreeCardComponent) {
            throw new PaymentMethodClientUnavailableError();
        }

        return this.braintreeCardComponent;
    }

    private isPayPalFastlaneInstrument(instrumentId: string): boolean {
        const state = this.paymentIntegrationService.getState();
        const paymentProviderCustomer = state.getPaymentProviderCustomerOrThrow();
        const braintreePaymentProviderCustomer = isBraintreeAcceleratedCheckoutCustomer(
            paymentProviderCustomer,
        )
            ? paymentProviderCustomer
            : {};

        const paypalConnectInstruments = braintreePaymentProviderCustomer.instruments || [];

        return !!paypalConnectInstruments.find(
            (instrument) => instrument.bigpayToken === instrumentId,
        );
    }

    private async getValidPaymentMethodOrThrow(
        methodId: string,
    ): Promise<PaymentMethod<BraintreeInitializationData>> {
        let validPaymentMethodId = methodId;

        try {
            await this.paymentIntegrationService.loadPaymentMethod(validPaymentMethodId);
        } catch {
            validPaymentMethodId =
                methodId === 'braintree' ? 'braintreeacceleratedcheckout' : 'braintree';
            await this.paymentIntegrationService.loadPaymentMethod(validPaymentMethodId);
        }

        return this.paymentIntegrationService
            .getState()
            .getPaymentMethodOrThrow<BraintreeInitializationData>(validPaymentMethodId);
    }
}