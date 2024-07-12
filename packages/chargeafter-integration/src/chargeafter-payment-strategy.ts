import {
    AmountTransformer,
    MissingDataError,
    MissingDataErrorType,
    NotInitializedError,
    NotInitializedErrorType,
    Order,
    OrderFinalizationNotRequiredError,
    OrderRequestBody,
    PaymentArgumentInvalidError,
    PaymentInitializeOptions,
    PaymentIntegrationService,
    PaymentMethodInvalidError,
    PaymentStrategy,
} from '@bigcommerce/checkout-sdk/payment-integration-api';
import {
    ChargeAfter,
    ChargeAfterCheckoutCartDiscountItemDetails,
    ChargeAfterCheckoutCartItemDetails,
    ChargeAfterCheckoutPreferences,
} from './chargeafter';
import ChargeafterScriptLoader from './chargeafter-script-loader';

export default class ChargeafterPaymentStrategy implements PaymentStrategy {
    private chargeAfter?: ChargeAfter;

    constructor(
        private paymentIntegrationService: PaymentIntegrationService,
        private chargeafterScriptLoader: ChargeafterScriptLoader,
    ) {}

    async initialize(options: PaymentInitializeOptions): Promise<void> {
        await this.paymentIntegrationService.loadPaymentMethod(options.methodId);

        const state = this.paymentIntegrationService.getState();

        const {
            clientToken,
            config: { testMode },
        } = state.getPaymentMethodOrThrow(options.methodId);

        if (!clientToken) {
            throw new MissingDataError(MissingDataErrorType.MissingPaymentMethod);
        }

        this.chargeAfter = await this.chargeafterScriptLoader.load(clientToken, testMode);

        return Promise.resolve();
    }

    async execute(payload: OrderRequestBody): Promise<void> {
        const methodId = payload.payment?.methodId;
        const { useStoreCredit } = payload;

        if (!this.chargeAfter) {
            throw new NotInitializedError(NotInitializedErrorType.PaymentNotInitialized);
        }

        if (!methodId) {
            throw new PaymentArgumentInvalidError(['payment.methodId']);
        }

        await this.paymentIntegrationService.submitOrder({
            useStoreCredit,
        });

        const chargeafterConfirmationToken = await this.presentChargeafterCheckout();

        await this.paymentIntegrationService.submitPayment({
            methodId,
            paymentData: {
                nonce: chargeafterConfirmationToken,
            },
        });
    }

    deinitialize(): Promise<void> {
        if (this.chargeAfter) {
            this.chargeAfter = undefined;
        }

        return Promise.resolve();
    }

    finalize(): Promise<void> {
        return Promise.reject(new OrderFinalizationNotRequiredError());
    }

    private async presentChargeafterCheckout(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.chargeAfter?.checkout.present({
                ...this.getCheckoutInformation(),
                callback: (token?: string) => {
                    if (token) {
                        resolve(token);
                    }

                    reject(new PaymentMethodInvalidError());
                },
            });
        });
    }

    private getCheckoutInformation() {
        const consumerDetails = this.getCustomerDetails();
        const cartDetails = this.getCartDetails();
        const preferences = this.getPreferences();

        return {
            consumerDetails,
            cartDetails,
            preferences,
        };
    }

    private getCustomerDetails() {
        const state = this.paymentIntegrationService.getState();

        const billingAddress = state.getBillingAddress();
        if (!billingAddress) {
            throw new MissingDataError(MissingDataErrorType.MissingBillingAddress);
        }

        let shippingAddress = state.getShippingAddress();
        if (!shippingAddress) {
            shippingAddress = billingAddress;
        }

        return {
            firstName: billingAddress.firstName,
            lastName: billingAddress.lastName,
            email: billingAddress.email,
            mobilePhoneNumber: billingAddress.phone,
            billingAddress: {
                line1: billingAddress.address1,
                line2: billingAddress.address2,
                city: billingAddress.city,
                zipCode: billingAddress.postalCode,
                state: billingAddress.stateOrProvinceCode,
            },
            shippingAddress: {
                line1: shippingAddress.address1,
                line2: shippingAddress.address2,
                city: shippingAddress.city,
                zipCode: shippingAddress.postalCode,
                state: shippingAddress.stateOrProvinceCode,
            },
        };
    }

    private getCartDetails() {
        const state = this.paymentIntegrationService.getState();
        const order = state.getOrder();

        if (!order) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        const items = this.getOrderItems(order);
        const discounts = this.getDiscountItems(order);

        return {
            items,
            discounts,
            merchantOrderId: order.orderId ? order.orderId.toString() : '',
            taxAmount: order.taxTotal,
            shippingAmount: order.shippingCostTotal,
            totalAmount: order.orderAmount,
        };
    }

    private getOrderItems(order: Order) {
        const items: ChargeAfterCheckoutCartItemDetails[] = [];

        const pushItem = ({ name, price, sku, quantity }: ChargeAfterCheckoutCartItemDetails) => {
            items.push({ name, price, sku, quantity });
        };

        order.lineItems.physicalItems.forEach((item) => {
            pushItem({
                name: item.name,
                price: item.salePrice,
                sku: item.sku,
                quantity: item.quantity,
            });
        });

        order.lineItems.digitalItems.forEach((item) => {
            pushItem({
                name: item.name,
                price: item.salePrice,
                sku: item.sku,
                quantity: item.quantity,
            });
        });

        order.lineItems.giftCertificates.forEach((item) => {
            pushItem({
                name: item.name,
                price: item.amount,
                sku: item.name,
                quantity: 1,
            });
        });

        if (order.lineItems.customItems) {
            order.lineItems.customItems.forEach((item) => {
                pushItem({
                    name: item.name,
                    price: item.listPrice,
                    sku: item.sku,
                    quantity: item.quantity,
                });
            });
        }

        return items;
    }

    private getDiscountItems(order: Order) {
        const items: ChargeAfterCheckoutCartDiscountItemDetails[] = [];
        const amountTransformer = new AmountTransformer(order.currency.decimalPlaces);

        order.coupons.forEach((coupon) => {
            if (coupon.discountedAmount > 0) {
                items.push({
                    name: coupon.displayName,
                    amount: amountTransformer.toInteger(coupon.discountedAmount),
                });
            }
        });

        if (order.discountAmount > 0) {
            items.push({
                name: 'Discount',
                amount: amountTransformer.toInteger(order.discountAmount),
            });
        }

        return items;
    }

    private getPreferences(): ChargeAfterCheckoutPreferences {
        const state = this.paymentIntegrationService.getState();

        const config = state.getStoreConfig();
        const order = state.getOrder();

        if (!config) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckoutConfig);
        }

        if (!order) {
            throw new MissingDataError(MissingDataErrorType.MissingCheckout);
        }

        const locale = state.getLocale();
        const billingAddress = state.getBillingAddress();

        return {
            language: locale,
            currency: config.currency.code,
            country: billingAddress?.country,
        };
    }
}
