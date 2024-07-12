interface ChargeAfterCheckoutConsumerAddressDetails {
    line1: string;
    line2: string;
    city: string;
    zipCode: string;
    state: string;
}

interface ChargeAfterCheckoutConsumerDetails {
    firstName: string;
    lastName: string;
    email?: string;
    mobilePhoneNumber?: string;
    billingAddress: ChargeAfterCheckoutConsumerAddressDetails;
    shippingAddress: ChargeAfterCheckoutConsumerAddressDetails;
}

export interface ChargeAfterCheckoutCartDiscountItemDetails {
    name: string;
    amount: number;
}

export interface ChargeAfterCheckoutCartItemDetails {
    name: string;
    price: number;
    sku: string;
    quantity: number;
}

interface ChargeAfterCheckoutCartDetails {
    items: ChargeAfterCheckoutCartItemDetails[];
    discounts: ChargeAfterCheckoutCartDiscountItemDetails[];
    merchantOrderId: string;
    taxAmount: number;
    shippingAmount: number;
    totalAmount: number;
}

export interface ChargeAfterCheckoutPreferences {
    language?: string;
    currency: string;
    country?: string;
}

interface ChargeAfterCheckoutData {
    consumerDetails: ChargeAfterCheckoutConsumerDetails;
    cartDetails: ChargeAfterCheckoutCartDetails;
    preferences: ChargeAfterCheckoutPreferences;
    callback: (token?: string) => void;
}

interface ChargeAfterCheckout {
    present: (data: ChargeAfterCheckoutData) => void;
}

export interface ChargeAfter {
    checkout: ChargeAfterCheckout;
}
export enum CHARGEAFTER_CDN_HOST {
    SANDBOX = '-ca-dev.co',
    PRODUCTION = '.chargeafter.com',
}
