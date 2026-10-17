import { buildApplePayPaymentRequest } from "./ApplePayCheckout";

test("requests the billing postal address PayPal needs to confirm Apple Pay", () => {
  const request = buildApplePayPaymentRequest({
    countryCode: "US",
    merchantCapabilities: ["supports3DS"],
    supportedNetworks: ["visa", "masterCard"],
  }, 41.5);

  expect(request).toEqual({
    countryCode: "US",
    currencyCode: "USD",
    merchantCapabilities: ["supports3DS"],
    supportedNetworks: ["visa", "masterCard"],
    requiredBillingContactFields: ["postalAddress"],
    total: { label: "Puff2Door", type: "final", amount: "41.50" },
  });
});
